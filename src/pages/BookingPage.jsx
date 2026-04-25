import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createGuestBooking } from '@/api/guestBookings';
import { getRooms, getRoomsPublicMedia } from '@/api/rooms';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import { formatGuestBookingError, pickRoomNightlyRate } from '@/utils/guestBookingErrors';
import { FARM_STAYS, apiRowMatchesStay } from '@/content/farmStays';
import { mergeLandingCatalogRows, normalizePublicRoomsPayload } from '@/utils/publicRoomCatalog';
import { resolveRoomImageUrls } from '@/utils/roomImageUrl';
import {
  loadBookingPolicySettings,
  depositAmountFromTotal,
  BOOKING_POLICY_CHANGED_EVENT,
  BOOKING_POLICY_STORAGE_KEY,
} from '@/utils/bookingPolicySettings';
import './BookingPage.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtDate(d) {
  return formatDateDayMonthYear(d);
}

/** YYYY-MM-DD in local time (avoids timezone shift from toISOString) */
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local date (avoids UTC midnight issues) */
function parseLocalDateStr(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function formatNum(n) {
  return n.toLocaleString('en-ZA');
}

const REQ_CHIPS = [
  '🍽️ Early Breakfast',
  '🎵 Anniversary Setup',
  '💑 Honeymoon Package',
  '🌍 Late Check-out',
  '🏳️ Vegetarian Meals',
  '🚕 Airport Transfer',
  '👶 Baby Crib',
  '♿ Accessibility',
];

/** Remotion iframe (?vc_embed=1): avoid /api/rooms — production API has no CORS for localhost. */
function skipRoomsApiInEmbed() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains('vc-remotion-ad')) return true;
  try {
    return new URLSearchParams(window.location.search).get('vc_embed') === '1';
  } catch {
    return false;
  }
}

export default function BookingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const today = new Date();
  const defaultCheckout = new Date(today);
  defaultCheckout.setDate(defaultCheckout.getDate() + 3);

  const [step, setStep] = useState(1);
  /** BnB checkout only — event hire uses `/event-enquiry`. */
  const bookingType = 'bnb';
  const [checkin, setCheckin] = useState(() => {
    const d = parseLocalDateStr(location.state?.checkIn);
    return (d && !isNaN(d.getTime())) ? d : today;
  });
  const [checkout, setCheckout] = useState(() => {
    const ci = parseLocalDateStr(location.state?.checkIn);
    const co = parseLocalDateStr(location.state?.checkOut);
    const baseCheckin = (ci && !isNaN(ci.getTime())) ? ci : today;
    if (co && !isNaN(co.getTime()) && co > baseCheckin) return co;
    const def = new Date(baseCheckin);
    def.setDate(def.getDate() + 3);
    return def;
  });
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [room, setRoom] = useState(null);
  const [roomName, setRoomName] = useState(null);
  const [roomPrice, setRoomPrice] = useState(0);
  const [guestFname, setGuestFname] = useState('');
  const [guestLname, setGuestLname] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestId, setGuestId] = useState('');
  const [guestCountry, setGuestCountry] = useState('ZA');
  const [requests, setRequests] = useState([]);
  const [notes, setNotes] = useState('');
  const [arrival, setArrival] = useState('14:00 – 16:00');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirmRef, setConfirmRef] = useState(null);
  const [roomGallery, setRoomGallery] = useState(null);
  const [errorModal, setErrorModal] = useState({ open: false, title: '', message: '' });
  const [detailsErrors, setDetailsErrors] = useState({});
  const [pendingPreferredId, setPendingPreferredId] = useState(null);
  const [step1House, setStep1House] = useState('any');
  const [policyRev, setPolicyRev] = useState(0);

  const showErrorModal = useCallback((title, message) => {
    setErrorModal({ open: true, title: title || 'Something went wrong', message: message || 'Please try again.' });
  }, []);

  const closeErrorModal = useCallback(() => {
    setErrorModal((m) => ({ ...m, open: false }));
  }, []);

  const applyRoomSelection = useCallback((r) => {
    setRoom(r.id);
    setRoomName(r.name);
    setRoomPrice(r.price);
  }, []);

  const checkInStr = toLocalDateStr(checkin);
  const checkOutStr = toLocalDateStr(checkout);
  const skipRoomsApi = skipRoomsApiInEmbed();
  const datesReady = Boolean(checkInStr && checkOutStr);

  const { data: roomsMediaRaw } = useQuery({
    queryKey: ['booking-rooms-catalog-media'],
    queryFn: () => getRoomsPublicMedia(),
    enabled: datesReady && !skipRoomsApi,
  });

  const { data: roomsApi } = useQuery({
    queryKey: ['rooms', checkInStr, checkOutStr],
    queryFn: () => getRooms({ checkIn: checkInStr, checkOut: checkOutStr }),
    enabled: datesReady && !skipRoomsApi,
  });

  const mergedBnBRooms = useMemo(() => {
    const mediaList = normalizePublicRoomsPayload(roomsMediaRaw);
    const detailList = normalizePublicRoomsPayload(roomsApi);
    return mergeLandingCatalogRows(mediaList, detailList);
  }, [roomsMediaRaw, roomsApi]);

  const displayRooms = useMemo(() => {
    const defaultImages = FARM_STAYS[0]?.images ?? [];
    const imgs = (list) => resolveRoomImageUrls(list?.length ? list : defaultImages);
    const fallbackRow = (stay) => ({
      id: stay.slug,
      slug: stay.slug,
      name: stay.name,
      price: stay.price,
      desc: stay.desc,
      tags: stay.tags,
      images: imgs(stay.images?.length ? stay.images : defaultImages),
      avail: true,
      bookedBy: [],
      onlyOneLeft: false,
    });
    if (!mergedBnBRooms.length) {
      return FARM_STAYS.map((stay) => fallbackRow(stay));
    }
    return mergedBnBRooms.map((api) => {
      const stay = FARM_STAYS.find((s) => apiRowMatchesStay(api, s));
      const staticMatch = stay
        ? { name: stay.name, desc: stay.desc, tags: stay.tags, price: stay.price, slug: stay.slug }
        : { name: api.name || 'Room', desc: '', tags: [], price: 0, slug: String(api.slug || '') };
      const id = api._id ?? api.id ?? staticMatch.slug;
      const price = pickRoomNightlyRate(api, staticMatch);
      const tagsFromAmenities =
        Array.isArray(api.amenities) && api.amenities.length
          ? api.amenities
              .slice(0, 8)
              .map((x) => (typeof x === 'string' ? x : x?.name || x?.label || ''))
              .map((s) => String(s).trim())
              .filter(Boolean)
          : [];
      const desc =
        (api.description && String(api.description).trim()) ||
        (api.spaceDescription && String(api.spaceDescription).trim()) ||
        staticMatch.desc ||
        'Self-catering farm stay.';
      return {
        id,
        slug: api.slug || staticMatch.slug || String(id),
        name: api.name || staticMatch.name,
        price,
        desc,
        tags: tagsFromAmenities.length ? tagsFromAmenities : stay?.tags || ['Farm stay'],
        images: imgs(
          api.images?.length ? api.images : stay?.images?.length ? stay.images : defaultImages
        ),
        avail: api.availableForDates !== false,
        bookedBy: api.bookedBy ?? [],
        onlyOneLeft: Boolean(api.onlyOneLeft),
      };
    });
  }, [mergedBnBRooms]);

  useEffect(() => {
    const onMsg = (e) => {
      if (window.parent === window) return;
      if (e.source !== window.parent) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || d.type !== 'VC_BOOKING_AD') return;

      document.documentElement.classList.add('vc-remotion-ad');

      if (d.demoGuest) {
        setGuestFname('Alex');
        setGuestLname('Morgan');
        setGuestEmail('hello@example.com');
        setGuestPhone('+27 82 000 0000');
        setTermsAccepted(true);
      }
      if (d.room && typeof d.room === 'object') {
        const { id, name, price } = d.room;
        if (id != null && id !== '') setRoom(id);
        if (name) setRoomName(name);
        setRoomPrice(Number(price) || 0);
      }
      if (typeof d.step === 'number' && d.step >= 1 && d.step <= 5) {
        setStep(d.step);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    const t = searchParams.get('type');
    if (t && ['wedding', 'corporate', 'celebration', 'retreat'].includes(t)) {
      navigate(`/event-enquiry?type=${encodeURIComponent(t)}`, { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    const st = location.state;
    if (!st || typeof st !== 'object') return;
    if (st.bookingType === 'event') {
      navigate('/event-enquiry', { replace: true });
      return;
    }
    if (st.checkIn) {
      const d = parseLocalDateStr(st.checkIn);
      if (d) setCheckin(d);
    }
    if (st.checkOut) {
      const d = parseLocalDateStr(st.checkOut);
      if (d) setCheckout(d);
    }
    const ad = Number(st.adults);
    if (Number.isFinite(ad) && ad >= 1 && ad <= 15) setAdults(ad);
    const ch = Number(st.children);
    if (Number.isFinite(ch) && ch >= 0 && ch <= 3) setChildren(ch);
    if (st.preferredRoomId != null && String(st.preferredRoomId).trim() !== '') {
      const pr = String(st.preferredRoomId).trim();
      setPendingPreferredId(pr);
      setStep1House(pr);
    }
  }, [location.key, location.state, navigate]);

  useEffect(() => {
    const bump = (e) => {
      if (e?.type === 'storage' && e.key != null && e.key !== BOOKING_POLICY_STORAGE_KEY) return;
      setPolicyRev((r) => r + 1);
    };
    window.addEventListener('storage', bump);
    window.addEventListener(BOOKING_POLICY_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener(BOOKING_POLICY_CHANGED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    if (!pendingPreferredId) return;
    let r = displayRooms.find(
      (x) => String(x.slug) === String(pendingPreferredId) || String(x.id) === String(pendingPreferredId)
    );
    if (!r) {
      const stay = FARM_STAYS.find((s) => s.slug === pendingPreferredId);
      if (stay) {
        r = displayRooms.find((x) => x.slug === stay.slug || (x.name || '').trim() === stay.name);
      }
    }
    if (r && r.avail) {
      applyRoomSelection(r);
      setPendingPreferredId(null);
    }
  }, [displayRooms, pendingPreferredId, applyRoomSelection]);

  const nights = Math.max(1, Math.round((checkout - checkin) / (1000 * 60 * 60 * 24)));
  const subtotal = room ? roomPrice * nights : 0;
  /** Room totals exclude VAT (rates are treated as VAT-inclusive or not charged separately on site). */
  const total = subtotal;
  const bookingPolicy = useMemo(() => loadBookingPolicySettings(), [policyRev]);
  const policyDeposit = depositAmountFromTotal(total, bookingPolicy);

  function getNights() {
    return Math.max(1, Math.round((checkout - checkin) / (1000 * 60 * 60 * 24)));
  }

  function validateDetailsForStep4() {
    const errs = {};
    if (!guestFname.trim()) errs.guestFname = 'First name is required.';
    if (!guestEmail.trim()) errs.guestEmail = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      errs.guestEmail = 'Enter a valid email address.';
    }
    if (!guestPhone.trim()) errs.guestPhone = 'Phone number is required.';
    return errs;
  }

  function goToStep(n) {
    setDetailsErrors({});
    if (n === 2 && step === 1) {
      if (step1House && step1House !== 'any') {
        setPendingPreferredId(step1House);
      } else {
        setPendingPreferredId(null);
      }
    }
    if (n === 3 && !room) {
      showErrorModal('Choose a room', 'Please select a room before continuing.');
      return;
    }
    if (n === 4) {
      const errs = validateDetailsForStep4();
      if (Object.keys(errs).length) {
        setDetailsErrors(errs);
        showErrorModal(
          'Please complete your details',
          'Some required information is missing. Check the highlighted fields below.'
        );
        return;
      }
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openRoomPreview(r) {
    if (!r.images?.length) return;
    setRoomGallery({
      name: r.name,
      images: r.images,
      index: 0,
      room: r,
      previewOnly: true,
    });
  }

  function selectRoomWithGallery(r) {
    if (!r.avail) return;
    applyRoomSelection(r);
    if (!r.images?.length) return;
    setRoomGallery({
      name: r.name,
      images: r.images,
      index: 0,
      room: r,
      previewOnly: false,
    });
  }

  function toggleChip(label) {
    setRequests((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  }

  const [submitting, setSubmitting] = useState(false);

  async function confirmBooking() {
    const errs = validateDetailsForStep4();
    if (Object.keys(errs).length) {
      setDetailsErrors(errs);
      showErrorModal(
        'Please complete your details',
        'Some required information is missing. Check the highlighted fields below.'
      );
      return;
    }
    if (!termsAccepted) {
      showErrorModal('Terms & conditions', 'Please accept the Terms & Conditions to confirm your booking.');
      return;
    }
    setSubmitting(true);
    const guestName = `${guestFname.trim()} ${guestLname.trim()}`.trim();
    const payload = {
      guestName: guestName || 'Guest',
      guestEmail: guestEmail.trim(),
      guestPhone: guestPhone.trim(),
      roomId: room || undefined,
      ...(room && roomName ? { roomName: String(roomName).trim() } : {}),
      checkIn: toLocalDateStr(checkin),
      checkOut: toLocalDateStr(checkout),
      totalAmount: total,
      deposit: policyDeposit,
      source: 'website',
      notes: [notes.trim(), requests.length ? requests.join('; ') : ''].filter(Boolean).join(' ') || undefined,
    };
    try {
      const res = await createGuestBooking(payload);
      const trackingCode = (res && (res.trackingCode || res.data && res.data.trackingCode)) || ('VC-' + Date.now());
      setConfirmRef(trackingCode);
      setStep(5);
    } catch (err) {
      showErrorModal('Could not submit booking', formatGuestBookingError(err));
    } finally {
      setSubmitting(false);
    }
  }


  const stepClass = (n) => {
    if (n < step) return 'done';
    if (n === step) return 'active';
    return 'pending';
  };

  const lineClass = (n) => (n < step ? 'done' : 'pending');

  const gallerySetIndex = useCallback((delta) => {
    setRoomGallery((g) => {
      if (!g || !g.images?.length) return g;
      const len = g.images.length;
      const next = (g.index + delta + len) % len;
      return { ...g, index: next };
    });
  }, []);

  useEffect(() => {
    if (!roomGallery && !errorModal.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [roomGallery, errorModal.open]);

  useEffect(() => {
    if (!roomGallery && !errorModal.open) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (roomGallery) setRoomGallery(null);
      else closeErrorModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roomGallery, errorModal.open, closeErrorModal]);

  return (
    <div className="booking-page">
      <header className="booking-header">
        <Link to="/" className="header-brand">
          <div className="header-icon">
            <i className="fas fa-leaf" />
          </div>
          <div>
            <div className="header-name">ValleyCroft</div>
            <div className="header-sub">Agro-Tourism</div>
          </div>
        </Link>
        <div className="booking-header-actions">
          <div className="booking-header-trust">
            <i className="fas fa-lock" style={{ color: 'var(--gold-l)' }} /> Secure Booking
          </div>
          <div className="booking-header-phone">
            <i className="fas fa-phone" style={{ color: 'var(--gold-l)' }} /> +27 11 234 5678
          </div>
          <Link to="/" className="booking-header-back">
            ← Back to Site
          </Link>
        </div>
      </header>

      <div className="steps-bar">
        <div className="steps-inner">
          <div className={`step ${stepClass(1)}`}>
            <div className="step-num">{step > 1 ? '✓' : '1'}</div>
            <div className="step-label">Dates & Guests</div>
          </div>
          <div className={`step-line ${lineClass(1)}`} />
          <div className={`step ${stepClass(2)}`}>
            <div className="step-num">{step > 2 ? '✓' : '2'}</div>
            <div className="step-label">Choose Room</div>
          </div>
          <div className={`step-line ${lineClass(2)}`} />
          <div className={`step ${stepClass(3)}`}>
            <div className="step-num">{step > 3 ? '✓' : '3'}</div>
            <div className="step-label">Your Details</div>
          </div>
          <div className={`step-line ${lineClass(3)}`} />
          <div className={`step ${stepClass(4)}`}>
            <div className="step-num">{step > 4 ? '✓' : '4'}</div>
            <div className="step-label">Review & Pay</div>
          </div>
          <div className={`step-line ${lineClass(4)}`} />
          <div className={`step ${stepClass(5)}`}>
            <div className="step-num">{step === 5 ? '✓' : '5'}</div>
            <div className="step-label">Confirmation</div>
          </div>
        </div>
      </div>

      <div className={`booking-body${step === 4 ? ' booking-body--review' : ''}`}>
        <div className="booking-main">
          {/* STEP 1 */}
          <div className={`page-section ${step === 1 ? 'active' : ''}`} id="step-1">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <div className="step-badge">1</div> Dates & Stay Type
                </div>
              </div>
              <div className="panel-body">
                <div className="form-group booking-type-field">
                  <div className="form-label">What are you booking?</div>
                  <div className="booking-type-grid">
                    <div
                      className={`type-card ${bookingType === 'bnb' ? 'active' : ''}`}
                      role="group"
                      aria-label="BnB stay"
                    >
                      <div className="type-card-emoji" aria-hidden>🏡</div>
                      <div className="type-card-title">BnB stay</div>
                      <div className="type-card-sub">Overnight stay in our farm rooms — you&apos;re on the right page.</div>
                    </div>
                    <Link to="/event-enquiry" className="type-card type-card--link">
                      <div className="type-card-emoji" aria-hidden>🎉</div>
                      <div className="type-card-title">Event hire</div>
                      <div className="type-card-sub">Weddings, corporate days &amp; celebrations — send an enquiry for a quote</div>
                      <span className="type-card-cta">Open event enquiry form →</span>
                    </Link>
                  </div>
                </div>
                <div className="booking-dates-row">
                  <div className={`date-box ${step === 1 ? 'active' : ''}`}>
                    <div className="date-box-label">Check-in Date</div>
                    <div className="date-box-val">{fmtDate(checkin)}</div>
                    <div className="date-box-day">{DAYS[checkin.getDay()]}</div>
                    <input
                      type="date"
                      id="checkin-input"
                      min={toLocalDateStr(today)}
                      value={toLocalDateStr(checkin)}
                      onChange={(e) => {
                        const d = parseLocalDateStr(e.target.value);
                        if (d) setCheckin(d);
                      }}
                      aria-label="Check-in date"
                    />
                  </div>
                  <div className="date-box">
                    <div className="date-box-label">Check-out Date</div>
                    <div className="date-box-val">{fmtDate(checkout)}</div>
                    <div className="date-box-day">{DAYS[checkout.getDay()]}</div>
                    <input
                      type="date"
                      id="checkout-input"
                      min={toLocalDateStr(checkin)}
                      value={toLocalDateStr(checkout)}
                      onChange={(e) => {
                        const d = parseLocalDateStr(e.target.value);
                        if (d) setCheckout(d);
                      }}
                      aria-label="Check-out date"
                    />
                  </div>
                </div>
                <div className="nights-tag">
                  <i className="fas fa-moon" /> {nights} nights selected
                </div>
                <div className="booking-step1-dates-next">
                  <button type="button" className="btn btn-primary" onClick={() => goToStep(2)}>
                    Next: Choose room <i className="fas fa-arrow-right" aria-hidden />
                  </button>
                </div>
                <div className="booking-guests-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div className="form-label">Adults</div>
                    <select
                      className="form-control"
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                    >
                      {Array.from({ length: 15 }, (_, i) => {
                        const n = i + 1;
                        return (
                          <option key={n} value={n}>
                            {n} Adult{n > 1 ? 's' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div className="form-label">Children</div>
                    <select
                      className="form-control"
                      value={children}
                      onChange={(e) => setChildren(Number(e.target.value))}
                    >
                      <option value={0}>0 Children</option>
                      <option value={1}>1 Child</option>
                      <option value={2}>2 Children</option>
                      <option value={3}>3 Children</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div className="form-label">Room</div>
                    <select
                      className="form-control"
                      value={step1House}
                      onChange={(e) => setStep1House(e.target.value)}
                      aria-label="Preferred room"
                    >
                      <option value="any">
                        {mergedBnBRooms.length ? `Any of our ${mergedBnBRooms.length} stays` : 'Any of our stays'}
                      </option>
                      {mergedBnBRooms.length
                        ? mergedBnBRooms.map((r) => {
                            const id = String(r._id ?? r.id ?? '');
                            const cap = r.capacity != null ? ` · up to ${r.capacity} guests` : '';
                            return (
                              <option key={id} value={id}>
                                {(r.name || 'Room').trim()}
                                {cap}
                              </option>
                            );
                          })
                        : FARM_STAYS.map((s) => (
                            <option key={s.slug} value={s.slug}>
                              {s.name} ({s.bedsShort})
                            </option>
                          ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="panel-footer">
                <div className="step-actions">
                  <div />
                  <button type="button" className="btn btn-primary" onClick={() => goToStep(2)}>
                    Choose Room <i className="fas fa-arrow-right" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 2 */}
          <div className={`page-section ${step === 2 ? 'active' : ''}`} id="step-2">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <div className="step-badge">2</div> Choose Your Room
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Showing rooms for {fmtDate(checkin)} – {fmtDate(checkout)}
                </div>
              </div>
              <div className="panel-body">
                <div className="room-list">
                  {displayRooms.map((r) => {
                    const imgUrl = r.images && r.images.length > 0 ? r.images[0] : null;
                    return (
                    <div
                      key={r.slug ?? r.id}
                      className={`room-opt ${room === r.id ? 'sel' : ''} ${!r.avail ? 'unavail' : ''}`}
                      onClick={() => r.avail && selectRoomWithGallery(r)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && r.avail) {
                          e.preventDefault();
                          selectRoomWithGallery(r);
                        }
                      }}
                    >
                      <div className="room-thumb-wrap">
                        <button
                          type="button"
                          className="room-thumb room-thumb-img room-thumb-open-gallery"
                          style={{
                            backgroundImage: imgUrl ? 'url(' + imgUrl + ')' : undefined,
                          }}
                          aria-label={r.images?.length > 1 ? `View ${r.name} photo gallery` : `View ${r.name} photo`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.images?.length) openRoomPreview(r);
                          }}
                        />
                        {r.images?.length > 1 ? (
                          <span className="room-gallery-hint" aria-hidden>
                            <i className="fas fa-images" /> Gallery
                          </span>
                        ) : null}
                      </div>
                      <div className="room-info">
                        <div className="room-opt-name">{r.name}</div>
                        <div className="room-opt-desc">{r.desc}</div>
                        <div className="room-opt-tags">
                          {r.tags.map((t) => (
                            <span key={t} className="rot">
                              {t}
                            </span>
                          ))}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: !r.avail ? 'var(--red)' : r.onlyOneLeft ? '#e67e22' : 'var(--forest)' }}>
                          {!r.avail
                            ? 'Booked for your dates'
                            : r.onlyOneLeft
                              ? 'Only 1 left for your dates'
                              : 'Available for your dates'}
                        </div>
                      </div>
                      <div className="room-price-col">
                        <div>
                          <div className="rpc-price">R {formatNum(r.price)}</div>
                          <div className="rpc-sub">per night</div>
                          <div className="rpc-total">R {formatNum(r.price * nights)} total</div>
                        </div>
                        <button
                          type="button"
                          className={`btn-sel ${room === r.id ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.avail) selectRoomWithGallery(r);
                          }}
                        >
                          {room === r.id ? '✓ Selected' : 'Select'}
                        </button>
                      </div>
                    </div>
                  ); })}
                </div>
              </div>
              <div className="panel-footer">
                <div className="step-actions">
                  <button type="button" className="btn btn-outline" onClick={() => goToStep(1)}>
                    <i className="fas fa-arrow-left" /> Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => goToStep(3)}
                    disabled={!room}
                    style={!room ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    Guest Details <i className="fas fa-arrow-right" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 3 */}
          <div className={`page-section ${step === 3 ? 'active' : ''}`} id="step-3">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <div className="step-badge">3</div> Your Details
                </div>
              </div>
              <div className="panel-body guest-details-panel">
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest-d)', marginBottom: 6 }}>
                    Lead guest information
                  </div>
                  <p className="form-required-legend">
                    <span className="form-required">*</span> Required fields
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <div className="form-label">
                        First name <span className="form-required">*</span>
                      </div>
                      <input
                        type="text"
                        className={`form-control${detailsErrors.guestFname ? ' form-control--error' : ''}`}
                        placeholder="e.g. Sipho"
                        value={guestFname}
                        onChange={(e) => {
                          setGuestFname(e.target.value);
                          if (detailsErrors.guestFname) setDetailsErrors((d) => ({ ...d, guestFname: '' }));
                        }}
                        aria-invalid={!!detailsErrors.guestFname}
                        aria-describedby={detailsErrors.guestFname ? 'err-fname' : undefined}
                      />
                      {detailsErrors.guestFname ? (
                        <div id="err-fname" className="form-field-error" role="alert">
                          {detailsErrors.guestFname}
                        </div>
                      ) : null}
                    </div>
                    <div className="form-group">
                      <div className="form-label">Last name</div>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Dlamini"
                        value={guestLname}
                        onChange={(e) => setGuestLname(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <div className="form-label">
                        Email address <span className="form-required">*</span>
                      </div>
                      <input
                        type="email"
                        className={`form-control${detailsErrors.guestEmail ? ' form-control--error' : ''}`}
                        placeholder="sipho@email.com"
                        value={guestEmail}
                        onChange={(e) => {
                          setGuestEmail(e.target.value);
                          if (detailsErrors.guestEmail) setDetailsErrors((d) => ({ ...d, guestEmail: '' }));
                        }}
                        aria-invalid={!!detailsErrors.guestEmail}
                        aria-describedby={detailsErrors.guestEmail ? 'err-email' : undefined}
                      />
                      <div className="form-hint">Confirmation will be sent here</div>
                      {detailsErrors.guestEmail ? (
                        <div id="err-email" className="form-field-error" role="alert">
                          {detailsErrors.guestEmail}
                        </div>
                      ) : null}
                    </div>
                    <div className="form-group">
                      <div className="form-label">
                        Phone number <span className="form-required">*</span>
                      </div>
                      <input
                        type="tel"
                        className={`form-control${detailsErrors.guestPhone ? ' form-control--error' : ''}`}
                        placeholder="+27 82 456 7890"
                        value={guestPhone}
                        onChange={(e) => {
                          setGuestPhone(e.target.value);
                          if (detailsErrors.guestPhone) setDetailsErrors((d) => ({ ...d, guestPhone: '' }));
                        }}
                        aria-invalid={!!detailsErrors.guestPhone}
                        aria-describedby={detailsErrors.guestPhone ? 'err-phone' : undefined}
                      />
                      {detailsErrors.guestPhone ? (
                        <div id="err-phone" className="form-field-error" role="alert">
                          {detailsErrors.guestPhone}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <div className="form-label">ID / Passport Number</div>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Optional"
                        value={guestId}
                        onChange={(e) => setGuestId(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <div className="form-label">Country of Origin</div>
                      <select
                        className="form-control"
                        value={guestCountry}
                        onChange={(e) => setGuestCountry(e.target.value)}
                      >
                        <option value="ZA">South Africa</option>
                        <option value="ZW">Zimbabwe</option>
                        <option value="ZM">Zambia</option>
                        <option value="UK">United Kingdom</option>
                        <option value="US">United States</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
                <hr className="divider" style={{ margin: '20px 0', borderColor: 'var(--linen-d)' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest-d)', marginBottom: 14 }}>
                  Special Requests <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
                </div>
                <div className="req-chips">
                  {REQ_CHIPS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={`req-chip ${requests.includes(label) ? 'on' : ''}`}
                      onClick={() => toggleChip(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="form-group">
                  <div className="form-label">Additional Notes</div>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Any other requests or information we should know..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <hr className="divider" style={{ margin: '20px 0', borderColor: 'var(--linen-d)' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest-d)', marginBottom: 14 }}>
                  Estimated Arrival Time
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <div className="form-label">Arrival Time</div>
                    <select
                      className="form-control"
                      value={arrival}
                      onChange={(e) => setArrival(e.target.value)}
                    >
                      <option>Before 12:00</option>
                      <option>12:00 – 14:00</option>
                      <option>14:00 – 16:00</option>
                      <option>16:00 – 18:00</option>
                      <option>After 18:00</option>
                      <option>Not sure yet</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <div className="form-label">How did you hear about us?</div>
                    <select className="form-control">
                      <option>Google Search</option>
                      <option>Social Media</option>
                      <option>Word of Mouth</option>
                      <option>Booking.com</option>
                      <option>Airbnb</option>
                      <option>Travel Agent</option>
                      <option>Returning Guest</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="panel-footer">
                <div className="step-actions">
                  <button type="button" className="btn btn-outline" onClick={() => goToStep(2)}>
                    <i className="fas fa-arrow-left" /> Back
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => goToStep(4)}>
                    Review Booking <i className="fas fa-arrow-right" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4 */}
          <div className={`page-section ${step === 4 ? 'active' : ''}`} id="step-4">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <div className="step-badge">4</div> Review Your Booking
                </div>
              </div>
              <div className="panel-body">
                <div className="review-block">
                  <div className="review-block-header">Stay Details</div>
                  <div className="review-row">
                    <div className="rv-label">Booking Type</div>
                    <div className="rv-val">BnB stay</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Room</div>
                    <div className="rv-val">{roomName || '—'}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Check-in</div>
                    <div className="rv-val">{fmtDate(checkin)} · {DAYS[checkin.getDay()]}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Check-out</div>
                    <div className="rv-val">{fmtDate(checkout)} · {DAYS[checkout.getDay()]}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Duration</div>
                    <div className="rv-val">{nights} night{nights > 1 ? 's' : ''}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Guests</div>
                    <div className="rv-val">
                      {adults} Adult{adults > 1 ? 's' : ''}
                      {children > 0 ? `, ${children} Child${children > 1 ? 'ren' : ''}` : ''}
                    </div>
                  </div>
                </div>
                <div className="review-block">
                  <div className="review-block-header">Guest Details</div>
                  <div className="review-row">
                    <div className="rv-label">Name</div>
                    <div className="rv-val">{guestFname} {guestLname}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Email</div>
                    <div className="rv-val">{guestEmail}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Phone</div>
                    <div className="rv-val">{guestPhone}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Arrival Time</div>
                    <div className="rv-val">{arrival}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Special Requests</div>
                    <div className="rv-val">{requests.length > 0 ? requests.join(', ') : 'None'}</div>
                  </div>
                </div>
                <div className="review-block">
                  <div className="review-block-header">Pricing</div>
                  <div className="review-row">
                    <div className="rv-label">Room Rate</div>
                    <div className="rv-val">R {formatNum(roomPrice)}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Nights</div>
                    <div className="rv-val">{nights} night{nights > 1 ? 's' : ''}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Subtotal</div>
                    <div className="rv-val">R {formatNum(subtotal)}</div>
                  </div>
                  {policyDeposit > 0 && (
                    <div className="review-row">
                      <div className="rv-label">Deposit (due with this request)</div>
                      <div className="rv-val">R {formatNum(policyDeposit)}</div>
                    </div>
                  )}
                  <div className="review-row" style={{ background: 'rgba(45,80,22,.04)' }}>
                    <div className="rv-label" style={{ fontWeight: 700, color: 'var(--forest-d)' }}>
                      Total due
                    </div>
                    <div className="rv-val" style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 22, fontWeight: 700, color: 'var(--forest)' }}>
                      R {formatNum(total)}
                    </div>
                  </div>
                </div>
                <div className="booking-policies-review" id="policies">
                  <div className="booking-policies-review-title">ValleyCroft guest policies (BnB)</div>
                  <ul className="booking-policies-review-list">
                    {(bookingPolicy.policyLines || []).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="booking-policies-review-cancel">
                    <strong>Cancellation:</strong> {bookingPolicy.cancellationText}
                  </p>
                </div>
                <div className="terms-box">
                  <input
                    type="checkbox"
                    id="terms-check"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                  />
                  <label htmlFor="terms-check">
                    I have read and agree to ValleyCroft&apos;s guest policies and cancellation terms shown above{' '}
                    <span className="form-required">*</span>.
                  </label>
                </div>
              </div>
              <div className="panel-footer">
                <div className="step-actions">
                  <button type="button" className="btn btn-outline" onClick={() => goToStep(3)} disabled={submitting}>
                    <i className="fas fa-arrow-left" /> Back
                  </button>
                  <button type="button" className="btn btn-gold btn-lg" onClick={confirmBooking} disabled={submitting}>
                    {submitting ? <><i className="fas fa-spinner fa-spin" /> Submitting…</> : <><i className="fas fa-check-circle" /> Confirm Booking</>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 5 CONFIRMATION */}
          <div className={`page-section ${step === 5 ? 'active' : ''}`} id="step-5">
            <div className="panel">
              <div className="confetti-wrap">
                <div className="conf-icon">🌿</div>
                <div className="conf-title">Booking Confirmed!</div>
                <div className="conf-ref">
                  Your tracking code: <span>{confirmRef || '—'}</span>
                </div>
                <p className="conf-desc">
                  Thank you for choosing ValleyCroft. A confirmation email has been sent to <strong>{guestEmail}</strong>.
                  We look forward to welcoming you to the farm!
                </p>
              </div>
              <div className="panel-body" style={{ paddingTop: 0 }}>
                <div className="conf-next-steps">
                  <div className="conf-step">
                    <div className="conf-step-icon">💌</div>
                    <div className="conf-step-title">Check Your Email</div>
                    <div className="conf-step-desc">Your full booking confirmation has been sent to your inbox.</div>
                  </div>
                  <div className="conf-step">
                    <div className="conf-step-icon">🛫</div>
                    <div className="conf-step-title">Track Your Booking</div>
                    <div className="conf-step-desc">Use our tracking portal anytime to view status, make changes, or cancel.</div>
                  </div>
                </div>
                <div className="review-block">
                  <div className="review-block-header">Booking Summary</div>
                  <div className="review-row">
                    <div className="rv-label">Reference</div>
                    <div className="rv-val">{confirmRef || '—'}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Guest</div>
                    <div className="rv-val">{guestFname} {guestLname}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Room</div>
                    <div className="rv-val">{roomName || '—'}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Check-in</div>
                    <div className="rv-val">{fmtDate(checkin)}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Check-out</div>
                    <div className="rv-val">{fmtDate(checkout)}</div>
                  </div>
                  <div className="review-row">
                    <div className="rv-label">Total</div>
                    <div className="rv-val" style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 20, fontWeight: 700, color: 'var(--forest)' }}>
                      R {formatNum(total)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 24, flexWrap: 'wrap' }}>
                  <Link to="/booking-track" className="btn btn-primary">
                    <i className="fas fa-search" /> Track This Booking
                  </Link>
                  <button type="button" className="btn btn-outline" onClick={() => window.print()}>
                    <i className="fas fa-print" /> Print Confirmation
                  </button>
                  <Link to="/" className="btn btn-outline">
                    <i className="fas fa-home" /> Back to ValleyCroft
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="booking-sidebar">
          <div className="summary-card">
            <div className="summary-top">
              <div className="summary-title">Booking Summary</div>
              <div className="summary-ref">ValleyCroft Agro-Tourism</div>
            </div>
            <div className="summary-body">
              <div className="sum-row">
                <div className="sum-label">Type</div>
                <div className="sum-val">BnB stay</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Check-in</div>
                <div className="sum-val">{fmtDate(checkin)}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Check-out</div>
                <div className="sum-val">{fmtDate(checkout)}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Duration</div>
                <div className="sum-val">{nights} night{nights > 1 ? 's' : ''}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Guests</div>
                <div className="sum-val">
                  {adults} Adult{adults > 1 ? 's' : ''}
                  {children > 0 ? `, ${children} Child` : ''}
                </div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Room</div>
                <div className="sum-val">{room ? roomName : 'Not selected'}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Room Rate</div>
                <div className="sum-val">{room ? `R ${formatNum(roomPrice)} / night` : '—'}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Subtotal</div>
                <div className="sum-val">{room ? `R ${formatNum(subtotal)}` : '—'}</div>
              </div>
            </div>
            <div className="summary-total">
              <div className="sum-total-label">Total</div>
              <div className="sum-total-val">{room ? `R ${formatNum(total)}` : '—'}</div>
            </div>
            <div className="summary-note">
              <i className="fas fa-info-circle" />
              <span>Free cancellation up to 48 hours before check-in. Farm breakfast included daily.</span>
            </div>
          </div>
          <div style={{ background: 'rgba(45,80,22,.06)', border: '1px solid rgba(45,80,22,.15)', borderRadius: 12, padding: 16, marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest-d)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-shield-alt" style={{ color: 'var(--forest)' }} /> Your Booking is Safe
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              ✓ Instant confirmation<br />✓ Free cancellation 48h policy<br />✓ 24/7 guest support
            </div>
          </div>
          <div style={{ background: 'var(--linen)', borderRadius: 12, padding: 16, marginTop: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Need help with your booking?</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--forest)' }}>
              <i className="fas fa-phone" /> +27 11 234 5678
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>stay@valleycroft.com</div>
          </div>
        </div>
      </div>

      {errorModal.open ? (
        <div
          className="booking-modal-overlay"
          role="presentation"
          onClick={closeErrorModal}
          onKeyDown={(e) => e.key === 'Escape' && closeErrorModal()}
        >
          <div
            className="booking-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-error-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="booking-error-title" className="booking-modal-title">
              {errorModal.title}
            </h2>
            <div className="booking-modal-body">
              {errorModal.message.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <button type="button" className="btn btn-primary booking-modal-btn" onClick={closeErrorModal}>
              OK
            </button>
          </div>
        </div>
      ) : null}

      {roomGallery && roomGallery.images?.length > 0 ? (
        <div
          className="booking-modal-overlay booking-modal-overlay--gallery"
          role="presentation"
          onClick={() => setRoomGallery(null)}
        >
          <div
            className="room-gallery-shell"
            role="dialog"
            aria-modal="true"
            aria-label={`${roomGallery.name} photos`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="room-gallery-header">
              <div className="room-gallery-header-text">
                <span className="room-gallery-eyebrow">Photo tour</span>
                <h2 className="room-gallery-title">{roomGallery.name}</h2>
              </div>
              <button
                type="button"
                className="room-gallery-close"
                onClick={() => setRoomGallery(null)}
                aria-label="Close gallery"
              >
                <i className="fas fa-times" />
              </button>
            </header>
            <div className="room-gallery-viewport">
              <div className="room-gallery-stage-wrap">
                <div
                  className="room-gallery-stage"
                  style={{ backgroundImage: `url(${roomGallery.images[roomGallery.index]})` }}
                  role="img"
                  aria-label={`Photo ${roomGallery.index + 1} of ${roomGallery.images.length}`}
                />
                {roomGallery.images.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="room-gallery-nav room-gallery-prev"
                      aria-label="Previous photo"
                      onClick={() => gallerySetIndex(-1)}
                    >
                      <i className="fas fa-chevron-left" />
                    </button>
                    <button
                      type="button"
                      className="room-gallery-nav room-gallery-next"
                      aria-label="Next photo"
                      onClick={() => gallerySetIndex(1)}
                    >
                      <i className="fas fa-chevron-right" />
                    </button>
                    <div className="room-gallery-counter" aria-live="polite">
                      <span className="room-gallery-counter-inner">
                        {roomGallery.index + 1} <span className="room-gallery-counter-sep">/</span>{' '}
                        {roomGallery.images.length}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <footer className="room-gallery-footer">
              {roomGallery.previewOnly && roomGallery.room?.avail ? (
                <button
                  type="button"
                  className="btn btn-gold room-gallery-btn-primary"
                  onClick={() => {
                    applyRoomSelection(roomGallery.room);
                    setRoomGallery(null);
                  }}
                >
                  Select this room
                </button>
              ) : null}
              <button type="button" className="btn btn-outline room-gallery-btn-secondary" onClick={() => setRoomGallery(null)}>
                {roomGallery.previewOnly ? 'Close' : 'Done'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
