import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicSiteShell from '@/components/public/PublicSiteShell';
import StayImageCarousel from '@/components/public/StayImageCarousel';
import useScrollReveal from '@/hooks/useScrollReveal';
import useStayCatalog from '@/hooks/useStayCatalog';
import { useFoodAddOns } from '@/hooks/useFoodAddOns';
import {
  IMG_GRAZING_BOARD,
  IMG_PICNIC_COUPLE,
  IMG_PICNIC_WIDE,
} from '@/content/farmLifeMedia';
import '@/pages/LandingPage.css';

const ADDON_IMAGES = {
  breakfast: [IMG_GRAZING_BOARD],
  picnic: [IMG_PICNIC_WIDE, IMG_PICNIC_COUPLE],
};

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function StaysPage() {
  const { stays } = useStayCatalog();
  const { options: foodAddOnOptions } = useFoodAddOns();
  const [activeSlug, setActiveSlug] = useState('');

  const addOns = useMemo(
    () => foodAddOnOptions.filter((o) => o.isActive !== false),
    [foodAddOnOptions]
  );

  useScrollReveal(undefined, [stays.length, addOns.length]);

  useEffect(() => {
    if (!stays.length) return undefined;
    setActiveSlug(stays[0].slug);

    const nodes = [
      ...stays.map((s) => document.getElementById(s.slug)),
      document.getElementById('food-addons'),
    ].filter(Boolean);

    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveSlug(visible.target.id);
      },
      { rootMargin: '-30% 0px -45% 0px', threshold: [0, 0.25, 0.5] }
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [stays]);

  const bookState = (roomId) => ({
    bookingType: 'bnb',
    adults: 2,
    children: 0,
    preferredRoomId: roomId,
  });

  return (
    <PublicSiteShell animateKey="stays">
      <main className="landing-main landing-main--stays vc-stay-page">
        <header className="vc-stay-page-head">
          <p className="vc-stay-page-label">Valleycroft · Hekpoort</p>
          <h1>Farm stays</h1>
          <p className="vc-stay-page-intro">
            Self-catering houses on the farm — pool, braai, and open skies.
          </p>
        </header>

        <nav className="vc-stay-subnav" aria-label="Farm houses">
          {stays.map((stay) => (
            <button
              key={stay.slug}
              type="button"
              className={`vc-stay-subnav-link${activeSlug === stay.slug ? ' is-active' : ''}`}
              onClick={() => scrollToSection(stay.slug)}
            >
              {stay.name}
            </button>
          ))}
          {addOns.length > 0 ? (
            <button
              type="button"
              className={`vc-stay-subnav-link${activeSlug === 'food-addons' ? ' is-active' : ''}`}
              onClick={() => scrollToSection('food-addons')}
            >
              Add-ons
            </button>
          ) : null}
          <Link to="/booking-track" className="vc-stay-subnav-link vc-stay-subnav-link--muted">
            Track booking
          </Link>
        </nav>

        <div className="vc-stay-list">
          {stays.map((stay, i) => (
            <section
              key={stay.roomId}
              id={stay.slug}
              className={`vc-stay-editorial${i % 2 === 1 ? ' vc-stay-editorial--reverse' : ''}`}
            >
              <div className="vc-stay-editorial-copy">
                <h2 className="vc-stay-editorial-name">{stay.name}</h2>
                <p className="vc-stay-editorial-meta">{stay.metaLine}</p>
                <p className="vc-stay-editorial-desc">{stay.desc}</p>
                <p className="vc-stay-editorial-foot">Pool &amp; braai access included · Free WiFi · Self-catering</p>

                <Link
                  to="/booking"
                  state={bookState(stay.roomId)}
                  className="vc-stay-book-btn"
                >
                  Book a room
                </Link>
              </div>

              <div className="vc-stay-editorial-media">
                <StayImageCarousel
                  images={stay.gallery}
                  label={stay.name}
                  variant="editorial"
                />
              </div>
            </section>
          ))}
        </div>

        <section className="vc-stay-addons-wrap" id="food-addons">
          <header className="vc-stay-addons-head">
            <div className="vc-stay-addons-head-bg" aria-hidden="true">
              <img src={IMG_PICNIC_WIDE} alt="" loading="lazy" />
            </div>
            <div className="vc-stay-addons-head-inner">
              <p className="vc-stay-page-label">Optional extras</p>
              <h2 className="vc-stay-extras-title">Food &amp; picnics</h2>
              <p className="vc-stay-addons-intro">
                Add a farm breakfast or curated picnic when you book — we handle the setup, you enjoy the moment.
              </p>
            </div>
          </header>

          {addOns.map((addon, i) => {
            const images = ADDON_IMAGES[addon.id] || [IMG_GRAZING_BOARD];
            return (
              <article
                key={addon.id}
                id={`addon-${addon.id}`}
                className={`vc-stay-editorial vc-stay-editorial--addon${i % 2 === 1 ? ' vc-stay-editorial--reverse' : ''}`}
              >
                <div className="vc-stay-editorial-copy">
                  <h2 className="vc-stay-editorial-name">{addon.label}</h2>
                  <p className="vc-stay-editorial-meta">
                    {addon.perNight ? 'Per person, each morning' : 'Per person, one-time'} · optional add-on
                  </p>
                  <p className="vc-stay-editorial-desc">{addon.description}</p>

                  <Link
                    to="/booking"
                    state={bookState('')}
                    className="vc-stay-book-btn"
                  >
                    Add when you book
                  </Link>
                </div>

                <div className="vc-stay-editorial-media">
                  <StayImageCarousel
                    images={images}
                    label={addon.label}
                    variant="editorial"
                  />
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </PublicSiteShell>
  );
}
