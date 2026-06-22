/**
 * Split a booking total into room hire vs food add-ons for display and ledger posting.
 * Prefers explicit `roomAmount` / `foodAmount` from the API; falls back to notes parsing.
 */

function parseAmountToken(s) {
  const n = Number(String(s || '').replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Sum "(R 600)" style amounts in the food add-ons portion of booking notes. */
export function parseFoodAmountFromNotes(notes) {
  const text = String(notes || '');
  const marker = text.match(/Food add-ons:\s*(.+)/i);
  if (!marker) return 0;
  const section = marker[1];
  let sum = 0;
  const re = /\(R\s*([\d,]+(?:\.\d+)?)\)/gi;
  let m;
  while ((m = re.exec(section))) {
    sum += parseAmountToken(m[1]);
  }
  return sum;
}

/**
 * @param {Record<string, unknown> | null | undefined} booking
 * @returns {{ totalAmount: number, roomAmount: number, foodAmount: number }}
 */
export function getBookingRevenueSplit(booking) {
  const totalRaw = Number(booking?.amount ?? booking?.totalAmount ?? 0);
  const totalAmount = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : 0;

  const roomRaw = booking?.roomAmount;
  const foodRaw = booking?.foodAmount;
  const hasRoom = roomRaw != null && roomRaw !== '' && Number.isFinite(Number(roomRaw));
  const hasFood = foodRaw != null && foodRaw !== '' && Number.isFinite(Number(foodRaw));
  const roomExplicit = hasRoom ? Math.max(0, Number(roomRaw)) : null;
  const foodExplicit = hasFood ? Math.max(0, Number(foodRaw)) : null;

  if (roomExplicit != null && foodExplicit != null) {
    return {
      totalAmount: roomExplicit + foodExplicit,
      roomAmount: roomExplicit,
      foodAmount: foodExplicit,
    };
  }
  if (foodExplicit != null) {
    return {
      totalAmount,
      roomAmount: Math.max(0, totalAmount - foodExplicit),
      foodAmount: foodExplicit,
    };
  }
  if (roomExplicit != null) {
    return {
      totalAmount,
      roomAmount: roomExplicit,
      foodAmount: Math.max(0, totalAmount - roomExplicit),
    };
  }

  const parsedFood = parseFoodAmountFromNotes(booking?.notes);
  if (parsedFood > 0 && parsedFood <= totalAmount) {
    return {
      totalAmount,
      roomAmount: totalAmount - parsedFood,
      foodAmount: parsedFood,
    };
  }

  return { totalAmount, roomAmount: totalAmount, foodAmount: 0 };
}

export function bookingHasExplicitRevenueSplit(booking) {
  const b = booking || {};
  return (
    (b.roomAmount != null && b.roomAmount !== '') ||
    (b.foodAmount != null && b.foodAmount !== '')
  );
}

function transactionIdFromResponse(resp) {
  const body = resp?.data ?? resp;
  if (!body || typeof body !== 'object') return '';
  const row = body.transaction ?? body.data ?? body;
  if (!row || typeof row !== 'object') return '';
  const id = row._id ?? row.id;
  return id != null ? String(id) : '';
}

/**
 * @param {Record<string, unknown>} bookingLike
 * @param {(body: object, opts?: { idempotencyKey?: string }) => Promise<unknown>} createTransaction
 * @param {{ referenceDisplay?: (b: object) => string, onCateringFallback?: boolean }} [opts]
 * @returns {Promise<{ revenueTransactionId?: string, foodRevenueTransactionId?: string, errors: string[] }>}
 */
export async function ensureRevenueTransactionsForBooking(bookingLike, createTransaction, opts = {}) {
  const booking = bookingLike;
  const errors = [];
  const result = {};

  if (!booking || typeof booking !== 'object') return { errors };

  const bookingId = booking._id ?? booking.id;
  if (!bookingId) return { errors: ['Booking id is missing.'] };

  const split = getBookingRevenueSplit(booking);
  const { roomAmount, foodAmount } = split;
  if (roomAmount <= 0 && foodAmount <= 0) return { errors: ['No revenue amount to post.'] };

  const hasExplicitSplit = bookingHasExplicitRevenueSplit(booking);
  const legacyCombinedTxn =
    Boolean(booking.revenueTransactionId) && !hasExplicitSplit && foodAmount > 0;

  if (legacyCombinedTxn) return { errors };

  const refFn =
    opts.referenceDisplay ||
    ((b) => String(b.trackingCode || b.reference || b._id || bookingId).slice(-12));
  const ref = refFn(booking);
  const refSlug = String(ref).replace(/\s+/g, '').slice(0, 16);
  const dateRaw = booking.checkIn || booking.eventDate || booking.createdAt || new Date().toISOString();
  const date = new Date(dateRaw).toISOString().slice(0, 10);

  if (roomAmount > 0 && !booking.revenueTransactionId) {
    try {
      const resp = await createTransaction(
        {
          type: 'income',
          category: 'booking',
          description: `Booking confirmed: ${ref}`,
          amount: roomAmount,
          date,
          reference: `BOOK-${refSlug}`,
          booking: String(bookingId),
          debitAccount: '4000',
          creditAccount: '1010',
        },
        { idempotencyKey: `booking-revenue-${String(bookingId)}` }
      );
      const txnId = transactionIdFromResponse(resp);
      if (txnId) result.revenueTransactionId = txnId;
    } catch (err) {
      errors.push(err?.message || 'Could not post room revenue transaction.');
    }
  } else if (booking.revenueTransactionId) {
    result.revenueTransactionId = String(booking.revenueTransactionId);
  }

  if (foodAmount > 0 && !booking.foodRevenueTransactionId) {
    const foodBody = {
      type: 'income',
      description: `Food add-ons — booking ${ref}`,
      amount: foodAmount,
      date,
      reference: `BOOK-FOOD-${refSlug}`,
      booking: String(bookingId),
      debitAccount: '4000',
      creditAccount: '1010',
    };

    try {
      const resp = await createTransaction(
        { ...foodBody, category: 'catering' },
        { idempotencyKey: `booking-food-revenue-${String(bookingId)}` }
      );
      const txnId = transactionIdFromResponse(resp);
      if (txnId) result.foodRevenueTransactionId = txnId;
    } catch (err) {
      if (opts.onCateringFallback !== false) {
        try {
          const resp = await createTransaction(
            { ...foodBody, category: 'booking', description: `Food add-ons (booking ${ref})` },
            { idempotencyKey: `booking-food-revenue-${String(bookingId)}` }
          );
          const txnId = transactionIdFromResponse(resp);
          if (txnId) result.foodRevenueTransactionId = txnId;
        } catch (fallbackErr) {
          errors.push(fallbackErr?.message || err?.message || 'Could not post food revenue transaction.');
        }
      } else {
        errors.push(err?.message || 'Could not post food revenue transaction.');
      }
    }
  } else if (booking.foodRevenueTransactionId) {
    result.foodRevenueTransactionId = String(booking.foodRevenueTransactionId);
  }

  return { ...result, errors };
}
