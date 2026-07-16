import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRooms, getRoomsPublicMedia } from '@/api/rooms';
import { FARM_STAYS, apiRowMatchesStay } from '@/content/farmStays';
import {
  isLandingStayCatalogRoom,
  mergeLandingCatalogRows,
  normalizePublicRoomsPayload,
} from '@/utils/publicRoomCatalog';
import { resolveRoomImageUrls } from '@/utils/roomImageUrl';
import { landingPriceLabelFromApi } from '@/utils/roomPricing';

function landingRoomCardDescription(room) {
  const prose = String(room.description || room.spaceDescription || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (prose) {
    return prose.length > 380 ? `${prose.slice(0, 377)}…` : prose;
  }
  return buildLandingRoomDescFromApi(room);
}

function buildLandingRoomDescFromApi(room) {
  const type = String(room.type || '').replace(/-/g, ' ');
  const cap = room.capacity != null && room.capacity !== '' ? `Sleeps up to ${Number(room.capacity)}` : '';
  const bed = String(room.bedConfig || room.beds || '').trim();
  const parts = [];
  const rt = String(room.roomType || '').trim();
  const sc = String(room.spaceCategory || '').trim();
  if (rt) parts.push(rt.replace(/\b\w/g, (c) => c.toUpperCase()));
  if (sc && sc.toLowerCase() !== rt.toLowerCase()) parts.push(sc.replace(/\b\w/g, (c) => c.toUpperCase()));
  if (type) parts.push(type.replace(/\b\w/g, (c) => c.toUpperCase()));
  if (cap) parts.push(cap);
  if (bed) parts.push(bed);
  if (room.bathroom) parts.push(String(room.bathroom));
  if (room.view) parts.push(String(room.view));
  if (room.floor != null && room.floor !== '') parts.push(`Floor ${room.floor}`);
  return parts.length ? parts.join(' · ') : 'Self-catering farm stay at Valley Croft.';
}

function landingAmenityTagsFromApi(room) {
  const a = room.amenities;
  if (Array.isArray(a) && a.length) {
    return a
      .slice(0, 12)
      .map((x) => (typeof x === 'string' ? x : x?.name || x?.label || String(x)))
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  const tags = [];
  const bed = room.bedConfig || room.beds;
  if (bed) tags.push(String(bed));
  if (room.capacity) tags.push(`${room.capacity} guests`);
  if (room.bathroom) tags.push(String(room.bathroom));
  if (room.view) tags.push(String(room.view));
  return tags.slice(0, 4);
}

function landingBedsLabelFromApi(room) {
  const bed = String(room.bedConfig || room.beds || '').trim();
  if (bed) return bed;
  if (room.capacity != null && room.capacity !== '') return `${room.capacity} guests`;
  return '';
}

const HOUSE1_IMAGE_PATHS = FARM_STAYS[0].images;
const HOUSE2_IMAGE_PATHS = FARM_STAYS[1].images;
const HOUSE3_IMAGE_PATHS = FARM_STAYS[2].images;

function vcRemotionEmbed() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('vc-remotion-ad');
}

function applyRoomRowProgress(grid, progress) {
  const p = Math.min(1, Math.max(0, progress));
  const adTrack = grid.querySelector('.rooms-grid-wide-adtrack');
  if (adTrack && grid.classList.contains('rooms-grid-wide--embed-ad')) {
    const max = Math.max(0, adTrack.scrollWidth - grid.clientWidth);
    adTrack.style.transform = `translate3d(-${Math.round(max * p)}px,0,0)`;
  } else {
    const max = Math.max(0, grid.scrollWidth - grid.clientWidth);
    grid.scrollLeft = Math.round(max * p);
  }
}

function RoomCardImageCarouselEmbed({ images, roomName, overlay }) {
  const slides = images?.length ? images : [];
  return (
    <div className="room-img room-img--carousel">
      <div className="room-img-track">
        {slides.map((src, i) => (
          <div key={src} className="room-img-slide" style={{ backgroundImage: `url("${src}")` }} role="img" aria-label={`${roomName} — photo ${i + 1}`} />
        ))}
      </div>
      <div className="room-img-floating">{overlay}</div>
    </div>
  );
}

const RoomCardImageCarouselEmbedMemo = memo(RoomCardImageCarouselEmbed, (a, b) => a.roomName === b.roomName && a.images === b.images);

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
      setActive(Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / w))));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [slides.length]);

  return (
    <div className="room-img room-img--carousel">
      <div className="room-img-track" ref={trackRef}>
        {slides.map((src, i) => (
          <div key={src} className="room-img-slide" style={{ backgroundImage: `url("${src}")` }} role="img" aria-label={`${roomName} — photo ${i + 1}`} />
        ))}
      </div>
      <div className="room-img-floating">{overlay}</div>
      {slides.length > 1 ? (
        <div className="room-carousel-dots" role="tablist" aria-label={`${roomName} photos`}>
          {slides.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === active} className={`room-carousel-dot ${i === active ? 'is-active' : ''}`} onClick={() => trackRef.current?.scrollTo({ left: i * trackRef.current.clientWidth, behavior: 'smooth' })} aria-label={`Photo ${i + 1}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoomCardImageCarousel(props) {
  return vcRemotionEmbed() ? <RoomCardImageCarouselEmbedMemo {...props} /> : <RoomCardImageCarouselInteractive {...props} />;
}

function RoomCard({ room, onBook }) {
  return (
    <div className="room-card-pub" data-animate>
      <RoomCardImageCarousel
        images={room.gallery}
        roomName={room.name}
        overlay={
          <>
            {room.tag === 'Popular' ? <div className="room-guest-badge">Guest favourite</div> : null}
            <div className={`room-tag room-tag--${room.tag.toLowerCase()}`}>{room.tag}</div>
            <div className={`room-avail ${room.avail}`}>{room.avail === 'yes' ? 'Available' : room.availText || 'Unavailable'}</div>
          </>
        }
      />
      <div className="room-info">
        <div className="room-name">{room.name}</div>
        {room.bedsLabel ? <div className="room-beds">{room.bedsLabel}</div> : null}
        <div className="room-meta-line">
          <span className="room-meta-price">{room.price}</span>
          <span className="room-meta-sep" aria-hidden>·</span>
          <span className="room-meta-rating"><i className="fas fa-star" aria-hidden /> {Number(room.rating).toFixed(2)}</span>
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
          <button type="button" className="btn-book-room" onClick={() => onBook(room.roomId)}>Book</button>
        </div>
      </div>
    </div>
  );
}

export default function RoomCatalogSection() {
  const navigate = useNavigate();

  const { data: catalogMediaRaw } = useQuery({
    queryKey: ['landing-room-catalog-media'],
    queryFn: () => getRoomsPublicMedia(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: catalogDetailRaw } = useQuery({
    queryKey: ['landing-room-catalog-detail'],
    queryFn: () => getRooms(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const catalogApiRooms = useMemo(() => {
    const mediaList = normalizePublicRoomsPayload(catalogMediaRaw);
    const detailList = normalizePublicRoomsPayload(catalogDetailRaw);
    const merged = mergeLandingCatalogRows(mediaList, detailList).filter(isLandingStayCatalogRoom);
    return [...merged].sort((a, b) => {
      const na = Number.isFinite(Number(a.order)) ? Number(a.order) : 999;
      const nb = Number.isFinite(Number(b.order)) ? Number(b.order) : 999;
      if (na !== nb) return na - nb;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [catalogMediaRaw, catalogDetailRaw]);

  useEffect(() => {
    const onMsg = (e) => {
      if (window.parent === window || e.source !== window.parent) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      const grid = document.querySelector('#accommodation .rooms-grid-wide');
      if (!grid) return;
      if (d.type === 'VC_ROOM_SCROLL' && typeof d.progress === 'number') {
        document.documentElement.classList.add('vc-remotion-ad');
        applyRoomRowProgress(grid, d.progress);
      } else if (d.type === 'VC_ROOM_AD') {
        document.documentElement.classList.add('vc-remotion-ad');
        if (typeof d.rowProgress === 'number') applyRoomRowProgress(grid, d.rowProgress);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const rooms = useMemo(() => {
    const tags = ['Popular', 'Cosy', 'Premium'];
    const ratings = [4.92, 4.89, 4.95];
    if (catalogApiRooms.length > 0) {
      return catalogApiRooms.map((apiRow, idx) => {
        const id = String(apiRow._id ?? apiRow.id ?? idx);
        const stay = FARM_STAYS.find((s) => apiRowMatchesStay(apiRow, s));
        const stayIdx = stay ? FARM_STAYS.indexOf(stay) : -1;
        const fallbackImgs = stayIdx === 0 ? HOUSE1_IMAGE_PATHS : stayIdx === 1 ? HOUSE2_IMAGE_PATHS : stayIdx === 2 ? HOUSE3_IMAGE_PATHS : [];
        const gallery = resolveRoomImageUrls(apiRow.images || []).length ? resolveRoomImageUrls(apiRow.images || []) : resolveRoomImageUrls(fallbackImgs);
        return {
          roomId: id,
          tag: tags[idx % tags.length],
          avail: apiRow.isAvailable === false ? 'no' : 'yes',
          availText: apiRow.isAvailable === false ? 'Not listed for booking' : '',
          name: String(apiRow.name || 'Room').trim() || 'Room',
          bedsLabel: landingBedsLabelFromApi(apiRow),
          desc: landingRoomCardDescription(apiRow),
          amenities: landingAmenityTagsFromApi(apiRow),
          price: landingPriceLabelFromApi(apiRow),
          sub: 'per night',
          rating: ratings[idx % ratings.length],
          gallery,
        };
      });
    }
    return FARM_STAYS.map((stay, idx) => {
      const imgs = [HOUSE1_IMAGE_PATHS, HOUSE2_IMAGE_PATHS, HOUSE3_IMAGE_PATHS][idx];
      const apiRoom = catalogApiRooms.find((row) => apiRowMatchesStay(row, stay));
      const gallery = resolveRoomImageUrls(apiRoom?.images || []).length ? resolveRoomImageUrls(apiRoom?.images || []) : resolveRoomImageUrls(imgs);
      return {
        roomId: apiRoom ? String(apiRoom._id ?? apiRoom.id ?? '') : stay.slug,
        tag: tags[idx],
        avail: apiRoom?.isAvailable === false ? 'no' : 'yes',
        availText: apiRoom?.isAvailable === false ? 'Not listed for booking' : '',
        name: stay.name,
        bedsLabel: stay.bedsShort,
        desc: stay.desc,
        amenities: stay.tags.slice(0, 4),
        price: `R ${stay.price.toLocaleString('en-ZA')}`,
        sub: 'per night',
        rating: ratings[idx],
        gallery,
      };
    });
  }, [catalogApiRooms]);

  const goBook = (roomId) => {
    navigate('/booking', { state: { bookingType: 'bnb', adults: 2, children: 0, ...(roomId ? { preferredRoomId: roomId } : {}) } });
  };

  const cards = rooms.map((room) => <RoomCard key={room.roomId || room.name} room={room} onBook={goBook} />);

  return (
    <section className="section" id="accommodation">
      <div className="section-center section-center--accom" data-animate>
        <div className="eyebrow">Where you&apos;ll stay</div>
        <h2 className="section-heading">Our farm houses</h2>
        <p className="section-desc">
          Self-catering stays surrounded by open lawns, pool days, and the quiet rhythm of farm life.
        </p>
      </div>
      <div className="landing-m-accom-head">
        <h2 className="landing-m-accom-title">Our farm houses</h2>
      </div>
      {vcRemotionEmbed() ? (
        <div className="rooms-grid rooms-grid-wide rooms-grid-wide--embed-ad">
          <div className="rooms-grid-wide-adtrack">{cards}</div>
        </div>
      ) : (
        <div className="rooms-grid rooms-grid-wide">{cards}</div>
      )}
      <div style={{ textAlign: 'center', marginTop: 32 }} data-animate>
        <Link to="/booking" className="btn-view-all-rooms">
          <i className="fas fa-calendar-alt" /> Check dates &amp; book
        </Link>
      </div>
    </section>
  );
}
