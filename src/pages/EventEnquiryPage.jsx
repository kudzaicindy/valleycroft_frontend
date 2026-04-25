import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createPublicEnquiry } from '@/api/enquiries';
import { getRooms, getRoomsPublicMedia } from '@/api/rooms';
import { FARM_STAYS } from '@/content/farmStays';
import { pickRoomNightlyRate } from '@/utils/guestBookingErrors';
import { mergeLandingCatalogRows, normalizePublicEventVenuesPayload } from '@/utils/publicRoomCatalog';
import { resolveRoomImageUrls } from '@/utils/roomImageUrl';
import './BookingPage.css';
import './EventEnquiryPage.css';

const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'corporate', label: 'Corporate / team day' },
  { value: 'celebration', label: 'Private celebration' },
  { value: 'retreat', label: 'Retreat / buyout' },
  { value: 'other', label: 'Other' },
];

const MAIL = 'stay@valleycroft.com';

function skipRoomsApiInEmbed() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains('vc-remotion-ad')) return true;
  try {
    return new URLSearchParams(window.location.search).get('vc_embed') === '1';
  } catch {
    return false;
  }
}

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtVenueRate(n) {
  const x = Number(n) || 0;
  if (x <= 0) return 'Price on request';
  return `From R ${x.toLocaleString('en-ZA', { maximumFractionDigits: 0 })} / night`;
}

/**
 * Inline carousel for venue photos; opens full gallery at the active slide.
 * @param {{ images: string[], venueName: string, onOpenGallery: (index: number) => void }} props
 */
function VenuePhotoCarousel({ images, venueName, onOpenGallery }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);
  const len = images?.length ?? 0;

  useEffect(() => {
    setIndex(0);
  }, [images]);

  const go = useCallback(
    (delta) => {
      if (len <= 0) return;
      setIndex((i) => (i + delta + len) % len);
    },
    [len]
  );

  const onTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (e) => {
      const start = touchStartX.current;
      touchStartX.current = null;
      if (start == null || len <= 1) return;
      const end = e.changedTouches[0]?.clientX;
      if (end == null) return;
      const dx = end - start;
      if (dx > 48) go(-1);
      else if (dx < -48) go(1);
    },
    [len, go]
  );

  if (!len) {
    return (
      <div
        className="event-venue-carousel event-venue-carousel--empty"
        role="img"
        aria-label={`${venueName} (no photos yet)`}
      />
    );
  }

  const slidePct = 100 / len;

  return (
    <div
      className="event-venue-carousel"
      aria-roledescription="carousel"
      aria-label={`${venueName} photos`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="event-venue-carousel-viewport"
        role="button"
        tabIndex={0}
        aria-label={`Open full gallery for ${venueName} (photo ${index + 1} of ${len})`}
        onClick={() => onOpenGallery(index)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenGallery(index);
          }
        }}
      >
        <div
          className="event-venue-carousel-track"
          style={{
            width: `${len * 100}%`,
            transform: `translateX(-${index * slidePct}%)`,
          }}
        >
          {images.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="event-venue-carousel-slide"
              style={{ flex: `0 0 ${slidePct}%`, backgroundImage: `url(${src})` }}
              aria-hidden={i !== index}
            />
          ))}
        </div>
      </div>

      {len > 1 ? (
        <>
          <button
            type="button"
            className="event-venue-carousel-nav event-venue-carousel-nav--prev"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
          >
            <i className="fas fa-chevron-left" />
          </button>
          <button
            type="button"
            className="event-venue-carousel-nav event-venue-carousel-nav--next"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
          >
            <i className="fas fa-chevron-right" />
          </button>
          <div className="event-venue-carousel-dots" role="tablist" aria-label="Photos">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Photo ${i + 1}`}
                className={`event-venue-carousel-dot ${i === index ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
              />
            ))}
          </div>
          <span className="event-venue-carousel-count" aria-hidden>
            {index + 1}/{len}
          </span>
        </>
      ) : null}
    </div>
  );
}

export default function EventEnquiryPage() {
  const [searchParams] = useSearchParams();
  const [eventType, setEventType] = useState('other');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [message, setMessage] = useState('');
  const [createdId, setCreatedId] = useState('');
  const [venueGallery, setVenueGallery] = useState(null);

  const gallerySetIndex = useCallback((delta) => {
    setVenueGallery((g) => {
      if (!g || !g.images?.length) return g;
      const len = g.images.length;
      const next = (g.index + delta + len) % len;
      return { ...g, index: next };
    });
  }, []);

  const openVenueGallery = useCallback((v, startIndex = 0) => {
    if (!v?.images?.length) return;
    const n = Number(startIndex);
    const i = Number.isFinite(n) ? Math.floor(n) : 0;
    const clamped = Math.max(0, Math.min(v.images.length - 1, i));
    setVenueGallery({ name: v.name, images: v.images, index: clamped });
  }, []);

  useEffect(() => {
    if (!venueGallery) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setVenueGallery(null);
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        gallerySetIndex(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        gallerySetIndex(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [venueGallery, gallerySetIndex]);

  const enquiryMutation = useMutation({
    mutationFn: (body) => createPublicEnquiry(body),
    onSuccess: (data) => {
      const id = String(data?._id ?? data?.id ?? data?.enquiryId ?? data?.enquiry?._id ?? '');
      setCreatedId(id);
    },
  });

  useEffect(() => {
    const t = (searchParams.get('type') || '').toLowerCase();
    if (EVENT_TYPES.some((o) => o.value === t)) setEventType(t);
  }, [searchParams]);

  const typeLabel = useMemo(
    () => EVENT_TYPES.find((o) => o.value === eventType)?.label || 'Event',
    [eventType]
  );

  const skipRoomsApi = skipRoomsApiInEmbed();
  const today = useMemo(() => new Date(), []);
  const checkInStr = useMemo(() => toLocalDateStr(today), [today]);
  const checkOutStr = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 3);
    return toLocalDateStr(d);
  }, [today]);

  const { data: roomsMediaRaw, isPending: venuesMediaPending } = useQuery({
    queryKey: ['event-enquiry-rooms-catalog-media'],
    queryFn: () => getRoomsPublicMedia(),
    enabled: !skipRoomsApi,
  });

  const { data: roomsApi, isPending: venuesDetailPending } = useQuery({
    queryKey: ['event-enquiry-rooms', checkInStr, checkOutStr],
    queryFn: () => getRooms({ checkIn: checkInStr, checkOut: checkOutStr }),
    enabled: !skipRoomsApi,
  });

  const eventVenues = useMemo(() => {
    const mediaList = normalizePublicEventVenuesPayload(roomsMediaRaw);
    const detailList = normalizePublicEventVenuesPayload(roomsApi);
    const merged = mergeLandingCatalogRows(mediaList, detailList);
    const defaultImages = FARM_STAYS[0]?.images ?? [];
    const imgs = (list) => resolveRoomImageUrls(list?.length ? list : defaultImages);
    return merged.map((api) => {
      const price = pickRoomNightlyRate(api, undefined);
      const rawDesc =
        String(api.description || api.spaceDescription || '').trim() || 'Event venue hire at ValleyCroft.';
      const desc = rawDesc.length > 180 ? `${rawDesc.slice(0, 180)}…` : rawDesc;
      const resolved = imgs(api.images?.length ? api.images : defaultImages).filter(Boolean);
      const image = resolved[0] || '';
      return {
        id: String(api._id ?? api.id ?? ''),
        name: String(api.name || 'Venue').trim() || 'Venue',
        desc,
        price,
        image,
        images: resolved,
        capacity: api.capacity,
      };
    }).filter((v) => v.id);
  }, [roomsMediaRaw, roomsApi]);

  const venuesLoading = !skipRoomsApi && (venuesMediaPending || venuesDetailPending);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    enquiryMutation.mutate({
      guestName: name.trim(),
      guestEmail: email.trim(),
      guestPhone: phone.trim() || undefined,
      eventType: typeLabel,
      eventDate: eventDate.trim() || undefined,
      guestCount: guestCount.trim() ? Number(guestCount) : undefined,
      message: message.trim() || undefined,
    });
  }

  const mailtoFallbackHref = useMemo(() => {
    const lines = [
      `Event type: ${typeLabel}`,
      eventDate ? `Preferred date(s): ${eventDate}` : null,
      guestCount ? `Approx. guests: ${guestCount}` : null,
      '',
      message.trim() || '(No additional message)',
    ]
      .filter(Boolean)
      .join('\n');
    const subject = encodeURIComponent(`Event enquiry — ${typeLabel}`);
    const body = encodeURIComponent(
      `Name: ${name.trim()}\nEmail: ${email.trim()}\nPhone: ${phone.trim() || '—'}\n\n${lines}`
    );
    return `mailto:${MAIL}?subject=${subject}&body=${body}`;
  }, [typeLabel, eventDate, guestCount, message, name, email, phone]);

  return (
    <div className="booking-page event-enquiry-page">
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
            <i className="fas fa-envelope-open-text" style={{ color: 'var(--gold-l)' }} /> Event enquiry
          </div>
          <div className="booking-header-phone">
            <i className="fas fa-phone" /> +27 11 234 5678
          </div>
          <Link to="/booking" className="booking-header-back">
            BnB booking
          </Link>
          <Link to="/" className="booking-header-back">
            ← Back to Site
          </Link>
        </div>
      </header>

      <div className="steps-bar">
        <div className="steps-inner event-enquiry-steps-inner event-enquiry-steps-inner--single">
          <div className="step active">
            <div className="step-num">1</div>
            <div className="step-label">Event enquiry</div>
          </div>
        </div>
      </div>

      <div className="booking-body">
        <div className="booking-main">
          <div className="page-section active">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <div className="step-badge">1</div>
                  Venue hire enquiry
                </div>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="panel-body">
                  <p className="event-enquiry-lead">
                    Tell us about your wedding, corporate day, celebration, or retreat. We&apos;ll reply with availability
                    and a tailored quote — there is no instant checkout on this page.
                  </p>

                  <div className="event-venues-section">
                    <h3 className="event-venues-heading">Our event spaces</h3>
                    <p className="event-venues-sub">
                      Photos and guide rates from our live catalog (BnB rooms are not shown here). Final quotes depend
                      on your date, setup, and guest count.
                    </p>
                    {skipRoomsApi ? (
                      <p className="event-venues-empty">Catalog preview is unavailable in this embedded view.</p>
                    ) : venuesLoading ? (
                      <p className="event-venues-empty">Loading venues…</p>
                    ) : eventVenues.length === 0 ? (
                      <p className="event-venues-empty">
                        No event venues are listed in the catalog yet. Describe your needs below and we&apos;ll advise
                        on spaces and pricing.
                      </p>
                    ) : (
                      <div className="event-venues-grid">
                        {eventVenues.map((v) => (
                          <article key={v.id} className="event-venue-card">
                            <div className="event-venue-card-visual">
                              <VenuePhotoCarousel
                                images={v.images}
                                venueName={v.name}
                                onOpenGallery={(i) => openVenueGallery(v, i)}
                              />
                            </div>
                            <div className="event-venue-card-body">
                              <div className="event-venue-card-title">{v.name}</div>
                              {v.capacity != null ? (
                                <div className="event-venue-card-cap">Up to {v.capacity} guests</div>
                              ) : null}
                              <p className="event-venue-card-desc">{v.desc}</p>
                              <div className="event-venue-card-actions">
                                <div className="event-venue-card-price">{fmtVenueRate(v.price)}</div>
                                {v.images?.length ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm event-venue-album-btn"
                                    onClick={() => openVenueGallery(v)}
                                  >
                                    <i className="fas fa-images" />{' '}
                                    {v.images.length > 1 ? 'View album' : 'View photo'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ev-type">
                      Type of event
                    </label>
                    <select
                      id="ev-type"
                      className="form-control"
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                    >
                      {EVENT_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="ev-name">
                        Your name *
                      </label>
                      <input
                        id="ev-name"
                        className="form-control"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoComplete="name"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ev-email">
                        Email *
                      </label>
                      <input
                        id="ev-email"
                        type="email"
                        className="form-control"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ev-phone">
                      Phone
                    </label>
                    <input
                      id="ev-phone"
                      className="form-control"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="ev-date">
                        Preferred date or range
                      </label>
                      <input
                        id="ev-date"
                        className="form-control"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        placeholder="e.g. 15 March 2026"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ev-guests">
                        Approx. guests
                      </label>
                      <input
                        id="ev-guests"
                        className="form-control"
                        value={guestCount}
                        onChange={(e) => setGuestCount(e.target.value)}
                        placeholder="e.g. 80"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ev-msg">
                      Details &amp; questions
                    </label>
                    <textarea
                      id="ev-msg"
                      className="form-control"
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Catering, decor, schedule, accessibility…"
                    />
                  </div>
                  {enquiryMutation.isSuccess ? (
                    <div className="event-enquiry-success" role="status">
                      <i className="fas fa-check-circle" aria-hidden />
                      <span>
                        Thank you — your enquiry was received. We typically reply within 1–2 business days.
                        {createdId ? (
                          <>
                            {' '}
                            <span className="event-enquiry-ref">Reference: {createdId}</span>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {enquiryMutation.isError ? (
                    <div className="event-enquiry-mailto-hint" role="alert">
                      <i className="fas fa-exclamation-circle" aria-hidden />
                      <span>
                        {enquiryMutation.error?.message || 'Something went wrong.'} You can still email us at{' '}
                        <a href={mailtoFallbackHref}>{MAIL}</a> with the same details.
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="panel-footer event-enquiry-panel-footer">
                  <div className="step-actions">
                    <Link to="/" className="btn btn-outline">
                      <i className="fas fa-home" /> Home
                    </Link>
                    <button
                      type="submit"
                      className="btn btn-gold btn-lg"
                      disabled={enquiryMutation.isPending || enquiryMutation.isSuccess}
                    >
                      <i className="fas fa-paper-plane" />{' '}
                      {enquiryMutation.isPending ? 'Sending…' : 'Submit enquiry'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        <aside className="booking-sidebar">
          <div className="summary-card">
            <div className="summary-top">
              <div className="summary-title">Enquiry summary</div>
              <div className="summary-ref">We respond within 1–2 business days</div>
            </div>
            <div className="summary-body">
              <div className="sum-row">
                <div className="sum-label">Event type</div>
                <div className="sum-val">{typeLabel}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Preferred dates</div>
                <div className="sum-val">{eventDate.trim() || '—'}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Guests</div>
                <div className="sum-val">{guestCount.trim() || '—'}</div>
              </div>
              <div className="sum-row">
                <div className="sum-label">Contact</div>
                <div className="sum-val">{name.trim() || email.trim() ? `${name.trim()}${email.trim() ? ` · ${email.trim()}` : ''}` : '—'}</div>
              </div>
            </div>
            <div className="summary-note">
              <i className="fas fa-info-circle" />
              <span>
                Your enquiry is sent securely to our team. If the form fails, use the email link in the error message
                or write to {MAIL}.
              </span>
            </div>
          </div>

          <div className="event-enquiry-side-card">
            <div className="event-enquiry-side-card-title">
              <i className="fas fa-glass-cheers" aria-hidden /> Venue hire
            </div>
            <p className="event-enquiry-side-card-text">
              Weddings, corporate days, celebrations and farm buyouts — decor and events management can be arranged.
            </p>
          </div>

          <div className="event-enquiry-help-card">
            <div className="event-enquiry-help-label">Need help?</div>
            <div className="event-enquiry-help-phone">
              <i className="fas fa-phone" /> +27 11 234 5678
            </div>
            <div className="event-enquiry-help-email">{MAIL}</div>
          </div>
        </aside>
      </div>

      {venueGallery && venueGallery.images?.length > 0 ? (
        <div
          className="booking-modal-overlay booking-modal-overlay--gallery"
          role="presentation"
          onClick={() => setVenueGallery(null)}
        >
          <div
            className="room-gallery-shell"
            role="dialog"
            aria-modal="true"
            aria-label={`${venueGallery.name} photos`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="room-gallery-header">
              <div className="room-gallery-header-text">
                <span className="room-gallery-eyebrow">Photo album</span>
                <h2 className="room-gallery-title">{venueGallery.name}</h2>
              </div>
              <button
                type="button"
                className="room-gallery-close"
                onClick={() => setVenueGallery(null)}
                aria-label="Close album"
              >
                <i className="fas fa-times" />
              </button>
            </header>
            <div className="room-gallery-viewport">
              <div className="room-gallery-stage-wrap">
                <div
                  className="room-gallery-stage"
                  style={{ backgroundImage: `url(${venueGallery.images[venueGallery.index]})` }}
                  role="img"
                  aria-label={`Photo ${venueGallery.index + 1} of ${venueGallery.images.length}`}
                />
                {venueGallery.images.length > 1 ? (
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
                        {venueGallery.index + 1} <span className="room-gallery-counter-sep">/</span>{' '}
                        {venueGallery.images.length}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <footer className="room-gallery-footer">
              <button type="button" className="btn btn-outline room-gallery-btn-secondary" onClick={() => setVenueGallery(null)}>
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
