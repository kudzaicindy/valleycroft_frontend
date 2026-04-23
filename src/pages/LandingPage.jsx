import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRooms } from '@/api/rooms';
import { FARM_STAYS, quickBookNameBySlug } from '@/content/farmStays';
import { resolveRoomImageUrl, resolveRoomImageUrls } from '@/utils/roomImageUrl';
import './LandingPage.css';

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function findApiRoomForQuickBookHouse(apiList, houseVal) {
  if (!apiList?.length || houseVal === 'any') return null;
  let r = apiList.find((x) => String(x._id ?? x.id) === houseVal);
  if (r) return r;
  const name = quickBookNameBySlug(houseVal);
  if (name) {
    r = apiList.find((x) => (x.name || '').trim() === name);
    if (r) return r;
    const stay = FARM_STAYS.find((s) => s.slug === houseVal);
    if (stay?.legacyNames?.length) {
      return apiList.find((x) => stay.legacyNames.some((ln) => (x.name || '').trim() === ln));
    }
  }
  return null;
}

const HOUSE1_IMAGE_PATHS = FARM_STAYS[0].images;
const HOUSE2_IMAGE_PATHS = FARM_STAYS[1].images;
const HOUSE3_IMAGE_PATHS = FARM_STAYS[2].images;

/** Chandelier-lit rustic walkway entrance (grounds / arrival). */
const VALLEYCROFT_ENTRANCE_WALKWAY = encodeURI('/WhatsApp Image 2026-04-15 at 09.24.26.jpeg');
const VALLEYCROFT_POOL_BRAAI_IMAGE = encodeURI('/WhatsApp Image 2026-04-15 at 09.24.26 (1).jpeg');

/**
 * April 2026 — outdoors only: lawns, pool, patios, pavilion, house exteriors (not barn interior).
 */
const FARM_SURROUNDINGS_PHOTOS = [
  VALLEYCROFT_ENTRANCE_WALKWAY,
  '/PHOTO-2026-04-10-10-38-28.jpg',
  '/PHOTO-2026-04-10-10-38-30.jpg',
  '/PHOTO-2026-04-10-10-38-30_1.jpg',
  '/PHOTO-2026-04-10-10-38-30_2.jpg',
  '/PHOTO-2026-04-10-10-38-30_3.jpg',
  '/PHOTO-2026-04-10-10-38-31.jpg',
  '/PHOTO-2026-04-10-10-38-31_1.jpg',
  '/PHOTO-2026-04-10-10-38-31_2.jpg',
  '/PHOTO-2026-04-10-10-38-31_3.jpg',
  '/PHOTO-2026-04-10-10-38-32.jpg',
  '/PHOTO-2026-04-10-10-38-32_1.jpg',
  '/PHOTO-2026-04-10-10-38-32_2.jpg',
  '/PHOTO-2026-04-10-10-38-32_3.jpg',
  '/PHOTO-2026-04-10-10-38-33.jpg',
  '/PHOTO-2026-04-10-10-38-33_1.jpg',
  '/PHOTO-2026-04-10-10-38-33_2.jpg',
  '/PHOTO-2026-04-10-10-38-33_3.jpg',
  '/PHOTO-2026-04-10-10-38-33_4.jpg',
];

/** Rustic barn interior — communal dining / event space (long table, hay panels). */
const FARM_BARN_INTERIOR_PHOTOS = [
  '/PHOTO-2026-04-10-10-38-44.jpg',
  '/PHOTO-2026-04-10-10-38-45.jpg',
  '/PHOTO-2026-04-10-10-38-45_1.jpg',
  '/PHOTO-2026-04-10-10-38-45_2.jpg',
  '/PHOTO-2026-04-10-10-38-46.jpg',
];

const FARM_PREVIEW_GROUNDS = VALLEYCROFT_ENTRANCE_WALKWAY;
const FARM_PREVIEW_BARN = '/PHOTO-2026-04-10-10-38-44.jpg';

function vcRemotionEmbed() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('vc-remotion-ad');
}

/** Horizontal “scroll” for farm cards: transform vs scrollLeft (embed uses transform only). */
function applyRoomRowProgress(grid, progress) {
  const p = Math.min(1, Math.max(0, progress));
  const adTrack = grid.querySelector('.rooms-grid-wide-adtrack');
  if (adTrack && grid.classList.contains('rooms-grid-wide--embed-ad')) {
    const max = Math.max(0, adTrack.scrollWidth - grid.clientWidth);
    const x = Math.round(max * p);
    const t = `translate3d(-${x}px,0,0)`;
    if (adTrack.style.transform !== t) adTrack.style.transform = t;
  } else {
    const max = Math.max(0, grid.scrollWidth - grid.clientWidth);
    const next = Math.round(max * p);
    if (grid.scrollLeft !== next) grid.scrollLeft = next;
  }
}

/**
 * Remotion: parent sets .room-img-track scrollLeft via postMessage every frame.
 * No useState/useEffect here — avoids scroll listeners, dot updates, and memo-defeating churn from `overlay` identity.
 */
function RoomCardImageCarouselEmbed({ images, roomName, overlay }) {
  const slides = images?.length ? images : [];
  return (
    <div className="room-img room-img--carousel">
      <div className="room-img-track">
        {slides.map((src, i) => (
          <div
            key={src}
            className="room-img-slide"
            style={{ backgroundImage: `url("${src}")` }}
            role="img"
            aria-label={`${roomName} — photo ${i + 1} of ${slides.length}`}
          />
        ))}
      </div>
      <div className="room-img-floating">{overlay}</div>
    </div>
  );
}

const RoomCardImageCarouselEmbedMemo = memo(
  RoomCardImageCarouselEmbed,
  (a, b) => a.roomName === b.roomName && a.images === b.images
);

function RoomCardImageCarouselInteractive({ images, roomName, overlay }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const slides = images?.length ? images : [];

  useEffect(() => {
    const el = trackRef.current;
    if (!el || slides.length <= 1) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const i = Math.round(el.scrollLeft / w);
      setActive(Math.min(Math.max(i, 0), slides.length - 1));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [slides.length]);

  const goTo = (i) => {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth;
    el.scrollTo({ left: i * w, behavior: 'smooth' });
  };

  return (
    <div className="room-img room-img--carousel">
      <div className="room-img-track" ref={trackRef}>
        {slides.map((src, i) => (
          <div
            key={src}
            className="room-img-slide"
            style={{ backgroundImage: `url("${src}")` }}
            role="img"
            aria-label={`${roomName} — photo ${i + 1} of ${slides.length}`}
          />
        ))}
      </div>
      <div className="room-img-floating">
        {overlay}
      </div>
      {slides.length > 1 ? (
        <div className="room-carousel-dots" role="tablist" aria-label={`${roomName} photos`}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`room-carousel-dot ${i === active ? 'is-active' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Photo ${i + 1} of ${slides.length}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoomCardImageCarousel(props) {
  return vcRemotionEmbed() ? <RoomCardImageCarouselEmbedMemo {...props} /> : <RoomCardImageCarouselInteractive {...props} />;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [bookingType, setBookingType] = useState('bnb');
  const [modalOpen, setModalOpen] = useState(false);
  const [farmGalleryOpen, setFarmGalleryOpen] = useState(false);
  const [bookingContext, setBookingContext] = useState({ name: '', type: 'room' });
  const [qbCheckIn, setQbCheckIn] = useState(() => ymdLocal(new Date()));
  const [qbCheckOut, setQbCheckOut] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return ymdLocal(t);
  });
  const [qbHouse, setQbHouse] = useState('any');
  const guestsRef = useRef(null);
  const trackRefRef = useRef(null);
  const trackEmailRef = useRef(null);
  const roomsSectionRef = useRef(null);
  const [messageModal, setMessageModal] = useState({ open: false, title: '', message: '' });

  const todayMin = useMemo(() => ymdLocal(new Date()), []);

  const bnbDatesValid =
    bookingType === 'bnb' && qbCheckIn && qbCheckOut && qbCheckOut > qbCheckIn;

  const { data: roomsRaw, isSuccess, isError, isFetching } = useQuery({
    queryKey: ['landing-rooms-avail', qbCheckIn, qbCheckOut],
    queryFn: () => getRooms({ checkIn: qbCheckIn, checkOut: qbCheckOut }),
    enabled: bnbDatesValid,
    retry: 1,
  });

  const landingApiRooms = useMemo(() => {
    const raw = roomsRaw;
    return Array.isArray(raw) ? raw : (raw?.data ?? []);
  }, [roomsRaw]);

  const landingAvail = useMemo(() => {
    if (!bnbDatesValid || !isSuccess || isError || landingApiRooms.length === 0) {
      return { known: false, blocked: false, message: '' };
    }
    if (qbHouse === 'any') {
      const someOpen = landingApiRooms.some((r) => r.availableForDates !== false);
      if (!someOpen) {
        return {
          known: true,
          blocked: true,
          message:
            'These dates are not available for a BnB stay. Please choose different check-in and check-out dates.',
        };
      }
      return { known: true, blocked: false, message: '' };
    }
    const target = findApiRoomForQuickBookHouse(landingApiRooms, qbHouse);
    if (target && target.availableForDates === false) {
      return {
        known: true,
        blocked: true,
        message:
          'The house you selected is not available for these dates. Please change the dates or choose another property.',
      };
    }
    return { known: true, blocked: false, message: '' };
  }, [bnbDatesValid, isSuccess, isError, landingApiRooms, qbHouse]);

  const onQbCheckInChange = (e) => {
    const v = e.target.value;
    setQbCheckIn(v);
    setQbCheckOut((co) => {
      if (!v || !co) return co;
      if (co <= v) {
        const [y, mo, d] = v.split('-').map(Number);
        const n = new Date(y, mo - 1, d + 1);
        return ymdLocal(n);
      }
      return co;
    });
  };

  const selectType = (type) => setBookingType(type);

  const scrollToHash = (hash) => {
    const el = hash && document.querySelector(hash);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goToBooking = () => {
    const checkIn = qbCheckIn.trim();
    const checkOut = qbCheckOut.trim();
    if (bookingType === 'bnb' && landingAvail.known && landingAvail.blocked) {
      setMessageModal({
        open: true,
        title: 'Dates not available',
        message: landingAvail.message,
      });
      return;
    }
    const guestsVal = guestsRef.current?.value ?? '2';
    const houseVal = qbHouse;
    let adults = 2;
    let children = 0;
    const g = String(guestsVal);
    if (g === '1') adults = 1;
    else if (g === '2') adults = 2;
    else if (g === '3') adults = 3;
    else if (g === '4') adults = 4;
    else if (g === '5+') {
      adults = 6;
    }
    const preferredRoomId = houseVal && houseVal !== 'any' ? houseVal : undefined;
    navigate('/booking', {
      state: {
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        bookingType,
        adults,
        children,
        ...(preferredRoomId ? { preferredRoomId } : {}),
      },
    });
  };

  const openBookingModal = (name, type = 'room') => {
    setBookingContext({ name, type });
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const openFarmGallery = () => setFarmGalleryOpen(true);
  const closeFarmGallery = () => setFarmGalleryOpen(false);

  const closeNav = () => setNavOpen(false);

  const scrollToRooms = () => {
    roomsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const trackBooking = () => {
    const ref = trackRefRef.current?.value?.trim();
    const email = trackEmailRef.current?.value?.trim();
    if (!ref || !email) {
      setMessageModal({
        open: true,
        title: 'Missing details',
        message: 'Please enter both your booking reference and email address.',
      });
      return;
    }
    navigate(`/booking-track?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`);
  };

  useEffect(() => {
    document.body.classList.toggle('landing-nav-open', navOpen);
    return () => document.body.classList.remove('landing-nav-open');
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!farmGalleryOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setFarmGalleryOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [farmGalleryOpen]);

  useEffect(() => {
    if (!farmGalleryOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [farmGalleryOpen]);

  /**
   * Remotion ad: parent drives (1) horizontal scroll on `.rooms-grid-wide` and
   * (2) each house card’s `.room-img-track` gallery — not the whole page.
   */
  useEffect(() => {
    const onMsg = (e) => {
      if (window.parent === window) return;
      if (e.source !== window.parent) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;

      const grid = document.querySelector('#accommodation .rooms-grid-wide');
      if (!grid) return;

      if (d.type === 'VC_ROOM_SCROLL' && typeof d.progress === 'number') {
        document.documentElement.classList.add('vc-remotion-ad');
        applyRoomRowProgress(grid, d.progress);
        return;
      }

      if (d.type === 'VC_ROOM_AD') {
        document.documentElement.classList.add('vc-remotion-ad');
        if (typeof d.rowProgress === 'number') {
          applyRoomRowProgress(grid, d.rowProgress);
        }
        if (typeof d.activeCard === 'number' && d.activeCard >= 0 && typeof d.gallerySlide === 'number') {
          const cards = grid.querySelectorAll('.room-card-pub');
          const card = cards[d.activeCard];
          const track = card?.querySelector('.room-img-track');
          if (track && track.clientWidth > 0) {
            const w = track.clientWidth;
            const slideCount = Math.max(1, Math.round(track.scrollWidth / w));
            const maxIdx = slideCount - 1;
            const idx = Math.min(maxIdx, Math.max(0, Math.round(d.gallerySlide)));
            const next = Math.round(idx * w);
            if (track.scrollLeft !== next) track.scrollLeft = next;
          }
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (document.documentElement.classList.contains('vc-remotion-ad')) {
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll('[data-animate]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const aboutStrip = [
    { title: 'BnB Stays', desc: 'Comfortable farm accommodation', img: resolveRoomImageUrl(HOUSE1_IMAGE_PATHS[0]) },
    { title: 'Event Venue Hire', desc: 'Weddings, functions & retreats', img: FARM_BARN_INTERIOR_PHOTOS[0] },
    { title: 'Working Farm', desc: 'Authentic agro-tourism experiences', img: '/PHOTO-2026-04-10-10-38-30_2.jpg' },
    { title: 'South Africa', desc: 'In the heart of the countryside', img: '/PHOTO-2026-04-10-10-38-33_1.jpg' },
  ];

  const experienceItems = [
    { title: 'Sunrise & Farm Walks', desc: 'Start the day with valley views and a guided farm walk.', img: '/PHOTO-2026-04-10-10-38-32_3.jpg' },
    { title: 'Nature & Wildlife', desc: 'Birdlife, gardens and the rhythm of the seasons.', img: '/PHOTO-2026-04-10-10-38-31_2.jpg' },
    { title: 'Pool & Summer Days', desc: 'Take a dip and unwind by the water between farm walks and sundowners.', img: VALLEYCROFT_POOL_BRAAI_IMAGE },
    { title: 'Braai & Gatherings', desc: 'Evening braais and fireside gatherings under the stars.', img: VALLEYCROFT_POOL_BRAAI_IMAGE },
  ];

  const rooms = FARM_STAYS.map((stay, idx) => {
    const tags = ['Popular', 'Cosy', 'Premium'];
    const ratings = [4.92, 4.89, 4.95];
    const imgs = [HOUSE1_IMAGE_PATHS, HOUSE2_IMAGE_PATHS, HOUSE3_IMAGE_PATHS][idx];
    const gallery = resolveRoomImageUrls(imgs);
    return {
      tag: tags[idx],
      avail: 'yes',
      name: stay.name,
      bedsLabel: stay.bedsShort,
      desc: stay.desc,
      amenities: stay.tags.slice(0, 4),
      price: `R ${stay.price.toLocaleString('en-ZA')}`,
      sub: 'per night',
      rating: ratings[idx],
      img: gallery[0] || '',
      gallery,
      isEvent: false,
    };
  });

  const events = [
    { icon: '💍', name: 'Weddings', desc: 'Exchange vows in our enchanting garden or vineyard-view terrace. Catering for up to 200 guests with full coordination support.', features: ['Up to 200 guests', 'In-house catering available', 'Overnight accommodation for wedding party', 'Scenic photo backdrops throughout'], price: 'From R 28,000', sub: 'Full day venue hire', link: '/booking?type=wedding' },
    { icon: '🏢', name: 'Corporate Events', desc: 'Team retreats, strategy sessions, product launches. Escape the city for a productive day surrounded by nature.', features: ['20–120 delegates', 'AV equipment included', 'Catering & tea stations', 'Overnight delegate packages'], price: 'From R 8,500', sub: 'Half-day from R 5,000', link: '/booking?type=corporate' },
    { icon: '🎂', name: 'Private Celebrations', desc: 'Birthdays, anniversaries, family reunions. Our garden venue creates magical memories for every occasion.', features: ['Up to 80 guests', 'Entertainment area', 'Bar & catering options', 'Ample parking'], price: 'From R 6,500', sub: 'Venue hire per day', link: '/booking?type=celebration' },
    { icon: '🌿', name: 'Farm Retreats', desc: 'Full-farm buyout for extended groups. Combine accommodation, activities, and venue hire for an immersive farm experience.', features: ['Full-farm exclusive access', 'Farm activities included', 'All 3 farm houses', 'Dedicated host'], price: 'From R 18,000', sub: 'Per night, full farm', link: '/booking?type=retreat' },
  ];

  const testimonials = [
    { stars: '★★★★★', text: '"An absolutely magical experience. Willow Cottage was breathtaking — we woke up to birds singing and the most incredible farm views. Breakfast was unforgettable."', author: 'SN', name: 'Sipho Nkosi', date: '3 February 2026 · Willow Cottage', avatarBg: 'var(--forest)' },
    { stars: '★★★★★', text: '"We hosted our company strategy day here and it was perfect. The team was relaxed, focused, and inspired by the environment. We\'ll be back every quarter."', author: 'LV', name: 'Lerato van Wyk', date: '18 January 2026 · Corporate Event', avatarBg: 'var(--gold)' },
    { stars: '★★★★★', text: '"Our wedding was beyond anything we could have dreamed of. The staff were incredible and every detail was handled perfectly. Our guests still talk about it."', author: 'TM', name: 'Thabo & Mercy', date: '12 December 2025 · Wedding', avatarBg: 'var(--sage)' },
  ];

  const accommodationRoomCards = rooms.map((room) => (
    <div key={room.name} className="room-card-pub" data-animate>
      <RoomCardImageCarousel
        images={room.gallery?.length ? room.gallery : [room.img]}
        roomName={room.name}
        overlay={
          <>
            {room.tag === 'Popular' ? (
              <div className="room-guest-badge">Guest favourite</div>
            ) : null}
            <div className={`room-tag room-tag--${room.tag.toLowerCase()}`}>{room.tag}</div>
            <div className={`room-avail ${room.avail}`}>{room.avail === 'yes' ? 'Available' : room.availText}</div>
            <button
              type="button"
              className="room-wishlist"
              aria-label="Save listing"
              onClick={(e) => e.stopPropagation()}
            >
              <i className="far fa-heart" aria-hidden />
            </button>
          </>
        }
      />
      <div className="room-info">
        <div className="room-name">{room.name}</div>
        {room.bedsLabel ? <div className="room-beds">{room.bedsLabel}</div> : null}
        <div className="room-meta-line">
          <span className="room-meta-price">{room.price}</span>
          <span className="room-meta-sep" aria-hidden>·</span>
          <span className="room-meta-rating"><i className="fas fa-star" aria-hidden /> {room.rating != null ? Number(room.rating).toFixed(2) : '4.9'}</span>
        </div>
        <p className="room-desc">{room.desc}</p>
        <div className="room-amenities">
          {room.amenities.map((a) => (
            <span key={a} className="amenity-tag">{a}</span>
          ))}
        </div>
        <div className="room-footer">
          <div>
            <div className="room-price">{room.price}</div>
            <div className="room-price-sub">{room.sub}</div>
          </div>
          <button type="button" className="btn-book-room" onClick={() => openBookingModal(room.name, room.isEvent ? 'event' : 'room')}>
            {room.isEvent ? 'Enquire' : 'Book'}
          </button>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="landing-page">
      <nav className={`landing-nav ${navOpen ? 'nav-is-open' : ''}`.trim()} aria-label="Primary">
        <a href="#" className="nav-brand" onClick={closeNav}>
          <div className="nav-icon"><i className="fas fa-leaf" /></div>
          <div>
            <div className="nav-name">ValleyCroft</div>
            <div className="nav-sub">Agro-Tourism</div>
          </div>
        </a>
        <div className="nav-links">
          <a href="#accommodation" className="nav-link">Accommodation</a>
          <a href="#events" className="nav-link">Events & Venues</a>
          <a href="#about" className="nav-link">About the Farm</a>
          <a href="#experience" className="nav-link">Experience</a>
          <a href="#contact" className="nav-link">Contact</a>
        </div>
        <div className="nav-actions">
          <Link to="/login" className="btn-nav btn-outline-nav"><i className="fas fa-sign-in-alt" style={{ fontSize: '11px' }} /> Login</Link>
          <Link to="/booking-track" className="btn-nav btn-outline-nav"><i className="fas fa-search" style={{ fontSize: '11px' }} /> Track Booking</Link>
          <Link to="/booking" className="btn-nav btn-gold-nav"><i className="fas fa-calendar-check" style={{ fontSize: '11px' }} /> Book Now</Link>
        </div>
        <button
          type="button"
          className="nav-menu-toggle"
          aria-expanded={navOpen}
          aria-controls="landing-nav-drawer"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setNavOpen((o) => !o)}
        >
          <i className={navOpen ? 'fas fa-times' : 'fas fa-bars'} aria-hidden />
        </button>
      </nav>
      <div
        className={`nav-drawer-backdrop ${navOpen ? 'open' : ''}`}
        onClick={closeNav}
        role="presentation"
      />
      <div
        id="landing-nav-drawer"
        className={`nav-drawer ${navOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
      >
        <a href="#accommodation" className="nav-drawer-link" onClick={closeNav}>
          Accommodation
        </a>
        <a href="#events" className="nav-drawer-link" onClick={closeNav}>
          Events &amp; Venues
        </a>
        <a href="#about" className="nav-drawer-link" onClick={closeNav}>
          About the Farm
        </a>
        <a href="#experience" className="nav-drawer-link" onClick={closeNav}>
          Experience
        </a>
        <a href="#contact" className="nav-drawer-link" onClick={closeNav}>
          Contact
        </a>
        <a href="#track" className="nav-drawer-link" onClick={closeNav}>
          Track booking
        </a>
        <div className="nav-drawer-actions">
          <Link to="/login" className="btn-nav btn-outline-nav nav-drawer-btn" onClick={closeNav}>
            <i className="fas fa-sign-in-alt" style={{ fontSize: '11px' }} /> Login
          </Link>
          <Link to="/booking-track" className="btn-nav btn-outline-nav nav-drawer-btn" onClick={closeNav}>
            <i className="fas fa-search" style={{ fontSize: '11px' }} /> Track booking
          </Link>
          <Link to="/booking" className="btn-nav btn-gold-nav nav-drawer-btn" onClick={closeNav}>
            <i className="fas fa-calendar-check" style={{ fontSize: '11px' }} /> Book now
          </Link>
        </div>
      </div>

      <main className="landing-main">
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-eyebrow">South Africa · Working Farm & BnB</div>
            <h1 className="hero-headline">Where the <em>Land</em><br />Comes to Life</h1>
            <p className="hero-desc">Experience authentic farm living at ValleyCroft Agro-Tourism. Luxurious BnB rooms, unforgettable event venues, and the warmth of South African countryside hospitality.</p>
            <div className="hero-trust">
              <div className="hero-trust-item"><i className="fas fa-star" /> 4.9 / 5 Rating</div>
              <div className="hero-trust-item"><i className="fas fa-check-circle" /> Instant Confirmation</div>
              <div className="hero-trust-item"><i className="fas fa-shield-alt" /> Secure Booking</div>
            </div>
          </div>
          <div className="quick-book" data-animate>
            <div className="qb-title">Check Availability</div>
            <div className="qb-sub">Find your perfect stay at ValleyCroft</div>
            <div className="qb-group">
              <div className="qb-label">Booking Type</div>
              <div className="qb-type-grid">
                <button type="button" className={`qb-type-btn ${bookingType === 'bnb' ? 'active' : ''}`} onClick={() => selectType('bnb')}><i className="fas fa-bed" />BnB</button>
                <button type="button" className={`qb-type-btn ${bookingType === 'event' ? 'active' : ''}`} onClick={() => selectType('event')}><i className="fas fa-glass-cheers" />Event Hire</button>
              </div>
            </div>
            <div className="qb-row">
              <div className="qb-group">
                <div className="qb-label">Check-in Date</div>
                <input
                  type="date"
                  className="qb-input"
                  id="qbCheckin"
                  min={todayMin}
                  value={qbCheckIn}
                  onChange={onQbCheckInChange}
                />
              </div>
              <div className="qb-group">
                <div className="qb-label">Check-out Date</div>
                <input
                  type="date"
                  className="qb-input"
                  id="qbCheckout"
                  min={qbCheckIn || todayMin}
                  value={qbCheckOut}
                  onChange={(e) => setQbCheckOut(e.target.value)}
                />
              </div>
            </div>
            {bookingType === 'bnb' && bnbDatesValid && isFetching ? (
              <div className="qb-availability qb-availability--checking" aria-live="polite">
                <i className="fas fa-spinner fa-spin" aria-hidden /> Checking availability for these dates…
              </div>
            ) : null}
            {bookingType === 'bnb' && landingAvail.blocked ? (
              <div className="qb-availability qb-availability--bad" role="alert">
                {landingAvail.message}
              </div>
            ) : null}
            <div className="qb-row">
              <div className="qb-group">
                <div className="qb-label">Guests</div>
                <select className="qb-input" ref={guestsRef} defaultValue="2" aria-label="Number of guests">
                  <option value="1">1 Guest</option>
                  <option value="2">2 Guests</option>
                  <option value="3">3 Guests</option>
                  <option value="4">4 Guests</option>
                  <option value="5+">5+ Guests</option>
                </select>
              </div>
              <div className="qb-group">
                <div className="qb-label">House</div>
                <select
                  className="qb-input"
                  value={qbHouse}
                  onChange={(e) => setQbHouse(e.target.value)}
                  aria-label="Preferred house"
                >
                  <option value="any">Any house</option>
                  {FARM_STAYS.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name} ({s.bedsShort})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="btn-book-now"
              onClick={goToBooking}
              disabled={bookingType === 'bnb' && landingAvail.blocked}
            >
              <i className="fas fa-search" /> Check Availability & Book
            </button>
            <div className="qb-track-link">Already booked? <Link to="/booking-track">Track your reservation →</Link></div>
          </div>
        </div>
      </section>

      <div className="features-strip">
        <div className="feature-item"><i className="fas fa-check-circle" /> Instant Confirmation</div>
        <div className="feature-item"><i className="fas fa-shield-alt" /> Secure Payment</div>
        <div className="feature-item"><i className="fas fa-clock" /> 24/7 Guest Support</div>
        <div className="feature-item"><i className="fas fa-undo" /> Free Cancellation 48h</div>
        <div className="feature-item"><i className="fas fa-wifi" /> Free WiFi Throughout</div>
        <div className="feature-item"><i className="fas fa-person-swimming" /> Swimming pool</div>
        <div className="feature-item"><i className="fas fa-utensils" /> Farm Breakfast Included</div>
      </div>

      <div className="about-strip" id="about">
        {aboutStrip.map((item) => (
          <div key={item.title} className="about-strip-item" data-animate>
            <div className="about-strip-img" style={{ backgroundImage: `url("${item.img}")` }} />
            <div className="about-strip-text">
              <div className="about-strip-title">{item.title}</div>
              <div className="about-strip-desc">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="quick-actions" id="book">
        <div className="quick-actions-inner">
          <div className="section-center" data-animate>
            <div className="eyebrow">Book & Enquire</div>
            <h2 className="section-heading">How can we help?</h2>
          </div>
          <div className="quick-actions-grid">
            <button type="button" className="quick-action-card" onClick={scrollToRooms} data-animate>
              <i className="fas fa-bed" />
              <h3>Book BnB</h3>
              <p>Choose a room and reserve your dates</p>
            </button>
            <button type="button" className="quick-action-card" onClick={() => openBookingModal('Event Hire', 'event')} data-animate>
              <i className="fas fa-glass-cheers" />
              <h3>Book Event Hire</h3>
              <p>Weddings, corporate events & celebrations</p>
            </button>
            <a href="mailto:admin@valleycroft.com" className="quick-action-card" data-animate>
              <i className="fas fa-envelope" />
              <h3>Contact Admin</h3>
              <p>Questions? Get in touch</p>
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="accommodation" ref={roomsSectionRef}>
        <div className="section-center section-center--accom" data-animate>
          <div className="eyebrow">Where You&apos;ll Stay</div>
          <h2 className="section-heading">Our farm houses</h2>
          <p className="section-desc">Three houses on the farm — each with its own character, from cosy Studio Flier to the spacious Blue House.</p>
        </div>
        <div className="landing-m-accom-head">
          <h2 className="landing-m-accom-title">Available farm houses</h2>
          <button
            type="button"
            className="landing-m-accom-more"
            aria-label="Scroll to house listings"
            onClick={() => {
              document.querySelector('#accommodation .rooms-grid-wide')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }}
          >
            <i className="fas fa-chevron-right" aria-hidden />
          </button>
        </div>
        {vcRemotionEmbed() ? (
          <div className="rooms-grid rooms-grid-wide rooms-grid-wide--embed-ad">
            <div className="rooms-grid-wide-adtrack">{accommodationRoomCards}</div>
          </div>
        ) : (
          <div className="rooms-grid rooms-grid-wide">{accommodationRoomCards}</div>
        )}
        <div style={{ textAlign: 'center', marginTop: 32 }} data-animate>
          <Link to="/booking" className="btn-view-all-rooms">
            <i className="fas fa-calendar-alt" /> View All Rooms & Availability
          </Link>
        </div>
      </section>

      <section className="experience-farm-section" id="experience">
        <div className="section-center" data-animate>
          <div className="eyebrow">On the farm</div>
          <h2 className="section-heading">What to expect at Valley Croft</h2>
          <p className="section-desc">
            Sunrise walks, pool days, braais under the stars — plus our welcoming entrance, lawns, pavilion, and rustic barn for gatherings. Open the gallery for the full photo tour.
          </p>
        </div>
        <div className="experience-grid">
          {experienceItems.map((exp) => (
            <div
              key={exp.title}
              className="experience-card"
              data-animate
              id={exp.title === 'Pool & Summer Days' ? 'm-pool-spotlight' : undefined}
            >
              <div className="experience-img" style={{ backgroundImage: `url("${exp.img}")` }} />
              <div className="experience-content">
                <h3 className="experience-title">{exp.title}</h3>
                <p className="experience-desc">{exp.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="farm-gallery-inner" data-animate>
          <p className="experience-farm-bridge" id="surroundings-barn">
            Arrival, grounds &amp; barn
          </p>
          <div className="farm-preview-row">
            <article className="farm-preview-card">
              <div
                className="farm-preview-visual"
                style={{ backgroundImage: `url("${FARM_PREVIEW_GROUNDS}")` }}
                role="img"
                aria-label="Rustic covered entrance with chandelier, tiled path and barrel planters at ValleyCroft"
              />
              <div className="farm-preview-body">
                <h3 className="farm-preview-title">Arrival &amp; grounds</h3>
                <p className="farm-preview-desc">
                  Chandelier-lit walkway and gardens — plus pool, fire pit, lawns, and pavilion in the gallery.
                </p>
              </div>
            </article>
            <article className="farm-preview-card">
              <div
                className="farm-preview-visual"
                style={{ backgroundImage: `url("${FARM_PREVIEW_BARN}")` }}
                role="img"
                aria-label="Rustic barn interior with long wooden communal table"
              />
              <div className="farm-preview-body">
                <h3 className="farm-preview-title">Barn interior</h3>
                <p className="farm-preview-desc">A long hand-built table, straw-panel walls, and space for gatherings and celebrations.</p>
              </div>
            </article>
          </div>

          <div className="farm-gallery-actions">
            <button type="button" className="btn-view-farm-gallery" onClick={openFarmGallery}>
              <i className="fas fa-images" aria-hidden />
              View gallery
            </button>
            <p className="farm-gallery-hint">{FARM_SURROUNDINGS_PHOTOS.length + FARM_BARN_INTERIOR_PHOTOS.length} photos</p>
          </div>
        </div>
      </section>

      <section className="events-section" id="events">
        <div className="events-inner">
          <div data-animate>
            <div className="eyebrow" style={{ color: 'var(--gold-l)' }}>Celebrate in Style</div>
            <h2 className="section-heading" style={{ color: 'var(--white)' }}>Events &amp; Venue Hire</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.65)', maxWidth: 540, lineHeight: 1.7 }}>From intimate garden gatherings to grand celebrations — ValleyCroft&apos;s venues offer unmatched beauty in the heart of South Africa&apos;s countryside.</p>
          </div>
          <div className="events-grid">
            {events.slice(0, 3).map((event) => (
              <div key={event.name} className="event-card" data-animate>
                <div className="event-icon">{event.icon}</div>
                <div className="event-name">{event.name}</div>
                <p className="event-desc">{event.desc}</p>
                <div className="event-features">
                  {event.features.map((f) => (
                    <div key={f} className="event-feat"><i className="fas fa-check" /> {f}</div>
                  ))}
                </div>
                <div><div className="event-price">{event.price}</div><div className="event-price-sub">{event.sub}</div></div>
                <Link to={event.link} className="btn-event">Enquire & Book</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="testimonials">
        <div className="testimonials-inner">
          <div className="section-center" data-animate>
            <div className="eyebrow">Guest Reviews</div>
            <h2 className="section-heading">What Our Guests Say</h2>
          </div>
          <div className="testi-grid">
            {testimonials.map((t) => (
              <div key={t.name} className="testi-card" data-animate>
                <div className="testi-stars">{t.stars}</div>
                <p className="testi-text">{t.text}</p>
                <div className="testi-author">
                  <div className="testi-avatar" style={{ background: t.avatarBg }}>{t.author}</div>
                  <div>
                    <div className="testi-name">{t.name}</div>
                    <div className="testi-date">{t.date}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="cta-track-row">
        <div className="cta-banner">
          <div className="cta-inner">
            <h2 className="cta-heading">Ready to escape to the farm?</h2>
            <p className="cta-desc">Book your stay or enquire about your next event.</p>
            <div className="cta-buttons">
              <Link to="/booking" className="btn-cta btn-cta-primary"><i className="fas fa-calendar-check" /> Book Your Stay</Link>
              <a href="#book" className="btn-cta btn-cta-secondary">Enquire</a>
            </div>
          </div>
        </div>

        <div className="track-banner" id="track">
          <div className="track-inner">
            <div className="track-left">
              <h3 className="track-title">Track Your Booking</h3>
              <p className="track-desc">Enter your booking reference number and email address to view your reservation status, make changes, or download your confirmation.</p>
            </div>
            <div className="track-form">
              <div className="track-input-wrap">
                <div className="track-label">Booking Reference</div>
                <input type="text" className="track-input" ref={trackRefRef} placeholder="e.g. VC-2026-089" />
              </div>
              <div className="track-input-wrap">
                <div className="track-label">Your Email</div>
                <input type="email" className="track-input" ref={trackEmailRef} placeholder="you@email.com" />
              </div>
              <button type="button" className="btn-track" onClick={trackBooking}><i className="fas fa-search" /> Track Booking</button>
            </div>
          </div>
        </div>
      </div>

      </main>

      <div
        className={`modal-backdrop farm-gallery-modal-backdrop ${farmGalleryOpen ? 'open' : ''}`}
        onClick={closeFarmGallery}
        role="presentation"
      >
        <div
          className="farm-gallery-modal-box"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="farm-gallery-modal-title"
        >
          <button type="button" className="modal-close" onClick={closeFarmGallery} aria-label="Close gallery">
            <i className="fas fa-times" />
          </button>
          <h3 id="farm-gallery-modal-title" className="farm-gallery-modal-title">
            ValleyCroft — photo gallery
          </h3>
          <p className="farm-gallery-modal-lead">
            Outdoors includes the entrance walkway, pool, lawns, and patios; barn photos are the interior event space — labels match what you see.
          </p>
          <div className="farm-gallery-modal-scroll">
            <h4 className="farm-gallery-modal-subhead">Grounds &amp; outdoors</h4>
            <div className="farm-gallery-modal-grid">
              {FARM_SURROUNDINGS_PHOTOS.map((src, i) => (
                <div
                  key={src}
                  className="farm-gallery-modal-cell"
                  style={{ backgroundImage: `url("${src}")` }}
                  role="img"
                  aria-label={`Outdoors, photo ${i + 1}`}
                />
              ))}
            </div>
            <h4 className="farm-gallery-modal-subhead farm-gallery-modal-subhead--barn">Barn interior</h4>
            <div className="farm-gallery-modal-grid">
              {FARM_BARN_INTERIOR_PHOTOS.map((src, i) => (
                <div
                  key={src}
                  className="farm-gallery-modal-cell"
                  style={{ backgroundImage: `url("${src}")` }}
                  role="img"
                  aria-label={`Barn interior, photo ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`modal-backdrop ${messageModal.open ? 'open' : ''}`}
        onClick={() => setMessageModal({ open: false, title: '', message: '' })}
        role="presentation"
      >
        <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="landing-msg-title">
          <button
            type="button"
            className="modal-close"
            onClick={() => setMessageModal({ open: false, title: '', message: '' })}
            aria-label="Close"
          >
            <i className="fas fa-times" />
          </button>
          <h3 id="landing-msg-title" className="modal-title">
            {messageModal.title}
          </h3>
          <p className="modal-desc">{messageModal.message}</p>
          <button
            type="button"
            className="btn-modal-primary"
            onClick={() => setMessageModal({ open: false, title: '', message: '' })}
          >
            OK
          </button>
        </div>
      </div>

      <div className={`modal-backdrop ${modalOpen ? 'open' : ''}`} onClick={closeModal} role="presentation">
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="modal-close" onClick={closeModal} aria-label="Close"><i className="fas fa-times" /></button>
          <h3 className="modal-title">Book {bookingContext.name}</h3>
          <p className="modal-desc">
            {bookingContext.type === 'event'
              ? 'Send us your event details and we\'ll get back with availability and a quote.'
              : 'Choose your dates and we\'ll confirm your stay. Farm breakfast included.'}
          </p>
          <Link to="/booking" className="btn-modal-primary">Continue to booking</Link>
          <p className="modal-contact">Or contact us: <a href="mailto:stay@valleycroft.com">stay@valleycroft.com</a> · <a href="tel:+27112345678">+27 11 234 5678</a></p>
        </div>
      </div>

      <footer id="contact">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg,var(--gold),var(--gold-l))', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--forest-d)' }}><i className="fas fa-leaf" /></div>
              </div>
              <div className="footer-brand-name">ValleyCroft</div>
              <p className="footer-brand-desc">A working farm offering authentic BnB accommodation and premier event venue hire in the heart of South Africa&apos;s countryside.</p>
              <div className="footer-socials" style={{ marginTop: 20 }}>
                <a href="#" className="social-btn"><i className="fab fa-facebook-f" /></a>
                <a href="#" className="social-btn"><i className="fab fa-instagram" /></a>
                <a href="#" className="social-btn"><i className="fab fa-whatsapp" /></a>
                <a href="#" className="social-btn"><i className="fab fa-tripadvisor" /></a>
              </div>
            </div>
            <div>
              <div className="footer-col-title">Accommodation</div>
              <Link to="/booking" className="footer-link">Book a house</Link>
              <Link to="/booking" className="footer-link">Willow Cottage (2 bed)</Link>
              <Link to="/booking" className="footer-link">Studio Flier (1 bed)</Link>
              <Link to="/booking" className="footer-link">The Blue House</Link>
              <Link to="/booking" className="footer-link">Farm Retreat</Link>
            </div>
            <div>
              <div className="footer-col-title">Events</div>
              <Link to="/booking?type=wedding" className="footer-link">Weddings</Link>
              <Link to="/booking?type=corporate" className="footer-link">Corporate Days</Link>
              <Link to="/booking?type=celebration" className="footer-link">Celebrations</Link>
              <Link to="/booking?type=retreat" className="footer-link">Farm Retreats</Link>
            </div>
            <div>
              <div className="footer-col-title">Guest Services</div>
              <Link to="/booking" className="footer-link">Make a Booking</Link>
              <Link to="/booking-track" className="footer-link">Track Reservation</Link>
              <a href="#contact" className="footer-link">Contact Us</a>
              <div style={{ marginTop: 20 }}>
                <div className="footer-col-title">Contact</div>
                <div className="footer-link">📞 +27 11 234 5678</div>
                <div className="footer-link">✉️ stay@valleycroft.com</div>
                <div className="footer-link">📍 Midrand, Gauteng, SA</div>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copy">© 2026 ValleyCroft Agro-Tourism. All rights reserved. · Developed by Chynae Digital Solutions</div>
          </div>
        </div>
      </footer>

      <nav className="landing-m-bottom-nav" aria-label="Mobile quick links">
        <button type="button" className="landing-m-bottom-item landing-m-bottom-item--active" onClick={() => scrollToHash('#accommodation')}>
          <i className="fas fa-compass" aria-hidden />
          <span>Explore</span>
        </button>
        <Link to="/booking" className="landing-m-bottom-item">
          <i className="fas fa-calendar-check" aria-hidden />
          <span>Book</span>
        </Link>
        <button type="button" className="landing-m-bottom-item" onClick={() => scrollToHash('#events')}>
          <i className="fas fa-glass-cheers" aria-hidden />
          <span>Events</span>
        </button>
        <Link to="/booking-track" className="landing-m-bottom-item">
          <i className="fas fa-suitcase" aria-hidden />
          <span>Trips</span>
        </Link>
        <Link to="/login" className="landing-m-bottom-item">
          <i className="fas fa-user-circle" aria-hidden />
          <span>Log in</span>
        </Link>
      </nav>
    </div>
  );
}
