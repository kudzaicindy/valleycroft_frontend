import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createGuestBooking } from '@/api/guestBookings';
import { getRooms } from '@/api/rooms';
import './BookingPage.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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

const ROOMS = [
  {
    id: 'standard',
    price: 950,
    name: 'Standard Room',
    desc: 'Clean, comfortable farm room with countryside views. Perfect for solo travellers or couples wanting a relaxed stay.',
    tags: ['En-suite', 'TV', 'Kettle', 'WiFi', '2 Guests Max'],
    avail: true,
    images: [
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=600&q=80',
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80',
    ],
  },
  {
    id: 'garden',
    price: 1200,
    name: 'Garden View Room',
    desc: 'Wake up to sweeping valley garden views. Cozy interiors with local timber accents, crisp linen, and morning birdsong.',
    tags: ['En-suite', 'Smart TV', 'Kettle', 'Garden View', 'AC', '2 Guests'],
    avail: true,
    images: [
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=600&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80',
    ],
  },
  {
    id: 'loft',
    price: 1800,
    name: 'Loft Suite',
    desc: 'Two-level farmhouse suite with exposed beams, private loft bedroom, and a sun-drenched reading nook overlooking the valley.',
    tags: ['En-suite', 'Smart TV', 'Mountain View', 'AC', '3 Guests'],
    avail: true,
    images: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=600&q=80',
    ],
  },
  {
    id: 'heritage',
    price: 3200,
    name: 'Farm Heritage Suite',
    desc: 'Our most exclusive suite — a full heritage farmhouse with private stoep, outdoor braai area, and panoramic 360-degree farm views.',
    tags: ['Clawfoot Tub', 'Fireplace', 'Private Stoep', 'Braai', '4 Guests'],
    avail: true,
    onlyOneLeft: true,
    images: [
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80',
      'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=600&q=80',
    ],
  },
];

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

export default function BookingPage() {
  const location = useLocation();
  const today = new Date();
  const defaultCheckout = new Date(today);
  defaultCheckout.setDate(defaultCheckout.getDate() + 3);

  const [step, setStep] = useState(1);
  const [bookingType, setBookingType] = useState(() => (location.state?.bookingType || 'bnb'));
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
  const [carouselIndex, setCarouselIndex] = useState({});

  const checkInStr = toLocalDateStr(checkin);
  const checkOutStr = toLocalDateStr(checkout);
  const { data: roomsApi } = useQuery({
    queryKey: ['rooms', checkInStr, checkOutStr],
    queryFn: () => getRooms({ checkIn: checkInStr, checkOut: checkOutStr }),
    enabled: step >= 2 && !!checkInStr && !!checkOutStr,
  });
  const apiRoomsList = Array.isArray(roomsApi) ? roomsApi : (roomsApi?.data ?? []);
  const displayRooms = useMemo(() => {
    if (apiRoomsList.length === 0) return ROOMS;
    const defaultImages = ROOMS[0]?.images ?? [];
    return apiRoomsList.map((r) => {
      const staticMatch = ROOMS.find((s) => s.name === (r.name || '').trim() || s.id === (r._id || r.id));
      return {
        id: r._id ?? r.id,
        name: r.name ?? staticMatch?.name ?? 'Room',
        price: Number(r.rate ?? r.price ?? staticMatch?.price ?? 0),
        desc: r.description ?? staticMatch?.desc ?? '',
        tags: r.tags ?? staticMatch?.tags ?? [],
        images: r.images?.length ? r.images : (staticMatch?.images ?? defaultImages),
        avail: r.availableForDates !== false,
        bookedBy: r.bookedBy ?? [],
        onlyOneLeft: false,
      };
    });
  }, [apiRoomsList]);

  const setRoomCarouselIndex = (roomId, indexOrDelta) => {
    setCarouselIndex((prev) => {
      const current = prev[roomId] != null ? prev[roomId] : 0;
      const room = displayRooms.find((r) => r.id === roomId);
      const len = (room && room.images && room.images.length) ? room.images.length : 1;
      const next = typeof indexOrDelta === 'number' && indexOrDelta >= 0
        ? Math.min(indexOrDelta, len - 1)
        : (current + (indexOrDelta === -1 ? len - 1 : 1)) % len;
      return { ...prev, [roomId]: next };
    });
  };

  const nights = Math.max(1, Math.round((checkout - checkin) / (1000 * 60 * 60 * 24)));
  const subtotal = room ? roomPrice * nights : 0;
  const vat = Math.round(subtotal * 0.15);
  const total = subtotal + vat;

  function getNights() {
    return Math.max(1, Math.round((checkout - checkin) / (1000 * 60 * 60 * 24)));
  }

  function goToStep(n) {
    if (n === 3 && !room) {
      alert('Please select a room first.');
      return;
    }
    if (n === 4) {
      const f = guestFname.trim();
      const e = guestEmail.trim();
      const p = guestPhone.trim();
      if (!f || !e || !p) {
        alert('Please fill in your name, email, and phone number.');
        return;
      }
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectRoom(r) {
    setRoom(r.id);
    setRoomName(r.name);
    setRoomPrice(r.price);
  }

  function toggleChip(label) {
    setRequests((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  }

  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirmBooking() {
    if (!termsAccepted) {
      alert('Please accept the Terms & Conditions to proceed.');
      return;
    }
    setSubmitError(null);
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
      deposit: 0,
      source: 'website',
      notes: [notes.trim(), requests.length ? requests.join('; ') : ''].filter(Boolean).join(' ') || undefined,
    };
    try {
      const res = await createGuestBooking(payload);
      const trackingCode = (res && (res.trackingCode || res.data && res.data.trackingCode)) || ('VC-' + Date.now());
      setConfirmRef(trackingCode);
      setStep(5);
    } catch (err) {
      setSubmitError(err && err.message ? err.message : 'Could not submit booking. Please try again or contact us.');
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fas fa-lock" style={{ color: 'var(--gold-l)' }} /> Secure Booking
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fas fa-phone" style={{ color: 'var(--gold-l)' }} /> +27 11 234 5678
          </div>
          <Link
            to="/"
            style={{
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,.3)',
              color: 'rgba(255,255,255,.75)',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
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

      <div className="booking-body">
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
                <div className="form-group" style={{ marginBottom: 20 }}>
                  <div className="form-label">What are you booking?</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <button
                      type="button"
                      className={`type-card ${bookingType === 'bnb' ? 'active' : ''}`}
                      onClick={() => setBookingType('bnb')}
                    >
                      <div style={{ fontSize: 28, marginBottom: 6 }}>🏡</div>
                      <div className="type-card-title">BnB Accommodation</div>
                      <div className="type-card-sub">Overnight stay in our farm rooms</div>
                    </button>
                    <button
                      type="button"
                      className={`type-card ${bookingType === 'event' ? 'active' : ''}`}
                      onClick={() => setBookingType('event')}
                    >
                      <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
                      <div className="type-card-title">Event Venue</div>
                      <div className="type-card-sub">Weddings, corporate, celebrations</div>
                    </button>
                  </div>
                </div>
                <div className="dates-row">
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
                <div className="guests-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div className="form-label">Adults</div>
                    <select
                      className="form-control"
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                    >
                      <option value={1}>1 Adult</option>
                      <option value={2}>2 Adults</option>
                      <option value={3}>3 Adults</option>
                      <option value={4}>4 Adults</option>
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
                    <div className="form-label">Room Type</div>
                    <select className="form-control">
                      <option>Any Available</option>
                      <option>Garden View</option>
                      <option>Loft Suite</option>
                      <option>Heritage Suite</option>
                      <option>Standard</option>
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
                    const idx = (carouselIndex[r.id] != null ? carouselIndex[r.id] : 0) % (r.images && r.images.length ? r.images.length : 1);
                    const imgUrl = r.images && r.images.length > 0 ? r.images[idx] : null;
                    return (
                    <div
                      key={r.id}
                      className={`room-opt ${room === r.id ? 'sel' : ''} ${!r.avail ? 'unavail' : ''}`}
                      onClick={() => r.avail && selectRoom(r)}
                    >
                      <div className="room-thumb-wrap">
                        <div
                          className="room-thumb room-thumb-img"
                          style={{
                            backgroundImage: imgUrl ? 'url(' + imgUrl + ')' : undefined,
                          }}
                        />
                        {r.images && r.images.length > 1 && (
                          <>
                            <button
                              type="button"
                              className="room-carousel-btn room-carousel-prev"
                              aria-label="Previous image"
                              onClick={(e) => { e.stopPropagation(); setRoomCarouselIndex(r.id, -1); }}
                            >
                              <i className="fas fa-chevron-left" />
                            </button>
                            <button
                              type="button"
                              className="room-carousel-btn room-carousel-next"
                              aria-label="Next image"
                              onClick={(e) => { e.stopPropagation(); setRoomCarouselIndex(r.id, 1); }}
                            >
                              <i className="fas fa-chevron-right" />
                            </button>
                            <div className="room-carousel-dots">
                              {r.images.map((_, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  className={`room-carousel-dot ${(carouselIndex[r.id] != null ? carouselIndex[r.id] : 0) % r.images.length === i ? 'active' : ''}`}
                                  aria-label={`Go to image ${i + 1}`}
                                  onClick={(e) => { e.stopPropagation(); setRoomCarouselIndex(r.id, i); }}
                                />
                              ))}
                            </div>
                          </>
                        )}
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
                            ? (r.bookedBy?.length > 0
                              ? `Booked for your dates (by ${r.bookedBy.map((b) => b.guestName || 'Guest').join(', ')})`
                              : 'Booked for your dates')
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
                            if (r.avail) selectRoom(r);
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
              <div className="panel-body">
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest-d)', marginBottom: 14 }}>
                    Lead Guest Information
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <div className="form-label">First Name</div>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Sipho"
                        value={guestFname}
                        onChange={(e) => setGuestFname(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <div className="form-label">Last Name</div>
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
                      <div className="form-label">Email Address</div>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="sipho@email.com"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                      />
                      <div className="form-hint">Confirmation will be sent here</div>
                    </div>
                    <div className="form-group">
                      <div className="form-label">Phone Number</div>
                      <input
                        type="tel"
                        className="form-control"
                        placeholder="+27 82 456 7890"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                      />
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
                    <div className="rv-val">{bookingType === 'bnb' ? 'BnB Accommodation' : 'Event Venue'}</div>
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
                  <div className="review-row">
                    <div className="rv-label">VAT (15%)</div>
                    <div className="rv-val">R {formatNum(vat)}</div>
                  </div>
                  <div className="review-row" style={{ background: 'rgba(45,80,22,.04)' }}>
                    <div className="rv-label" style={{ fontWeight: 700, color: 'var(--forest-d)' }}>
                      Total Due
                    </div>
                    <div className="rv-val" style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 22, fontWeight: 700, color: 'var(--forest)' }}>
                      R {formatNum(total)}
                    </div>
                  </div>
                </div>
                <div className="terms-box">
                  <input
                    type="checkbox"
                    id="terms-check"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                  />
                  <label htmlFor="terms-check">
                    I agree to ValleyCroft's <a href="#">Terms & Conditions</a>, <a href="#">Privacy Policy</a>, and{' '}
                    <a href="#">Cancellation Policy</a>. I understand that cancellations within 48 hours of check-in
                    may incur a fee.
                  </label>
                </div>
              </div>
              {submitError && (
                <div className="card card--error" style={{ margin: '0 20px 12px' }}><div className="card-body">{submitError}</div></div>
              )}
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
                <div className="sum-val">{bookingType === 'bnb' ? 'BnB Stay' : 'Event Venue'}</div>
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
              <div className="sum-row">
                <div className="sum-label">VAT (15%)</div>
                <div className="sum-val">{room ? `R ${formatNum(vat)}` : '—'}</div>
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
    </div>
  );
}
