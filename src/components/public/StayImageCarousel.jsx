import { useEffect, useRef, useState } from 'react';

/**
 * Swipeable photo carousel with optional editorial arrow controls.
 * @param {{
 *   images: string[],
 *   label: string,
 *   className?: string,
 *   variant?: 'default' | 'editorial',
 * }} props
 */
export default function StayImageCarousel({ images, label, className = '', variant = 'default' }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const slides = images?.length ? images : [];
  const isEditorial = variant === 'editorial';

  useEffect(() => {
    const el = trackRef.current;
    if (!el || slides.length <= 1) return undefined;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setActive(Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / w))));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [slides.length]);

  const goTo = (index) => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.min(slides.length - 1, Math.max(0, index));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  if (!slides.length) {
    return <div className={`stay-carousel stay-carousel--empty ${className}`.trim()} aria-hidden="true" />;
  }

  return (
    <div className={`stay-carousel${isEditorial ? ' stay-carousel--editorial' : ''} ${className}`.trim()}>
      <div className="stay-carousel-track" ref={trackRef}>
        {slides.map((src, i) => (
          isEditorial ? (
            <div key={`${src}-${i}`} className="stay-carousel-slide stay-carousel-slide--img">
              <img
                src={src}
                alt={`${label} — photo ${i + 1} of ${slides.length}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </div>
          ) : (
            <div
              key={`${src}-${i}`}
              className="stay-carousel-slide"
              style={{ backgroundImage: `url("${src}")` }}
              role="img"
              aria-label={`${label} — photo ${i + 1} of ${slides.length}`}
            />
          )
        ))}
      </div>
      {slides.length > 1 && isEditorial ? (
        <div className="stay-carousel-arrows" aria-hidden="true">
          <button
            type="button"
            className="stay-carousel-arrow"
            aria-label="Previous photo"
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          >
            <i className="fas fa-chevron-left" />
          </button>
          <button
            type="button"
            className="stay-carousel-arrow"
            aria-label="Next photo"
            disabled={active === slides.length - 1}
            onClick={() => goTo(active + 1)}
          >
            <i className="fas fa-chevron-right" />
          </button>
        </div>
      ) : null}
      {slides.length > 1 && !isEditorial ? (
        <div className="stay-carousel-dots" role="tablist" aria-label={`${label} photos`}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Photo ${i + 1}`}
              className={`stay-carousel-dot${i === active ? ' is-active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
