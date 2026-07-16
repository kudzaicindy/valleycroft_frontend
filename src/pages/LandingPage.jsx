import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicSiteShell, { useFarmGallery } from '@/components/public/PublicSiteShell';
import useScrollReveal from '@/hooks/useScrollReveal';
import {
  IMG_ACCOMMODATION,
  IMG_BARN_VENUE,
  IMG_ENTRANCE_WALKWAY,
  IMG_FARM_EXTERIOR,
  IMG_FARM_GROUNDS,
  IMG_GAZEBO,
  IMG_PICNIC_COUPLE,
  LANDING_VIDEO,
} from '@/content/farmLifeMedia';
import '@/pages/LandingPage.css';

const storySections = [
  {
    id: 'about',
    eyebrow: 'Hekpoort · Gauteng',
    title: 'A farm made for slowing down',
    paragraphs: [
      'Valley Croft is where mornings feel unhurried and evenings gather around the fire. Stay with us, host your celebration, or simply breathe in the countryside.',
      'About forty-five minutes from Johannesburg — open skies, pool and braai, and the kind of welcome that feels genuinely personal.',
    ],
    cta: { label: 'Discover the farm', href: '#stays' },
    img: IMG_FARM_GROUNDS,
    reverse: false,
    tone: 'cream',
  },
  {
    id: 'stays',
    eyebrow: 'Farm stays',
    title: 'Wake up on the land',
    paragraphs: [
      'Self-catering farm houses with WiFi, pool access, and mornings that belong to you. This is our accommodation — one glimpse of where you might stay.',
      'Every house and booking detail lives on our stays page — including breakfast and picnic add-ons.',
    ],
    cta: { label: 'View stays & book', to: '/stays' },
    img: IMG_ACCOMMODATION,
    reverse: true,
    tone: 'white',
  },
  {
    id: 'events',
    eyebrow: 'Celebrations',
    title: 'Your day, under open skies',
    paragraphs: [
      'Weddings, retreats, and private gatherings in the garden, barn, and across the lawns — with room for intimate groups or three hundred guests.',
      'Tell us your date and vision. We will help you shape a celebration that feels unmistakably Valleycroft.',
    ],
    cta: { label: 'Explore events', to: '/events' },
    img: IMG_GAZEBO,
    reverse: false,
    tone: 'cream',
  },
  {
    id: 'barn',
    eyebrow: 'The barn',
    title: 'Gather in our rustic barn',
    paragraphs: [
      'Our barn is where long tables, candlelight, and celebration come together — a characterful indoor space for dinners, receptions, and events whatever the weather.',
      'Dressed for a wedding or set for a party, the barn brings everyone under one roof.',
    ],
    cta: { label: 'Host in the barn', to: '/events' },
    img: IMG_BARN_VENUE,
    reverse: true,
    tone: 'cream',
  },
  {
    id: 'lifestyle',
    eyebrow: 'Everyday magic',
    title: 'Picnics by the pool',
    paragraphs: [
      'Curated picnics beside the water, garden walks, and starlit braais — this is the rhythm we love, and the one we hope you take home with you.',
      'Set for two or a whole group, our poolside picnics turn an afternoon into a memory.',
    ],
    cta: { label: 'Open photo gallery', action: 'gallery' },
    img: IMG_PICNIC_COUPLE,
    reverse: false,
    tone: 'white',
  },
];

function HeroWelcomeText() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      setPhase(3);
      return undefined;
    }
    const timers = [
      setTimeout(() => setPhase(1), 700),
      setTimeout(() => setPhase(2), 2600),
      setTimeout(() => setPhase(3), 4400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="hero-welcome-wrap">
      <h1 className="hero-welcome hero-welcome--vc" aria-live="polite">
        <span className={`hero-welcome-line${phase >= 1 ? ' is-visible' : ''}`}>Welcome to our farm</span>
        <span className={`hero-welcome-brand${phase >= 2 ? ' is-visible' : ''}`}>Valleycroft</span>
      </h1>
      <p className={`hero-welcome-tagline${phase >= 3 ? ' is-visible' : ''}`}>
        Hekpoort · pool · braai · mornings that feel unhurried
      </p>
      <div className={`hero-welcome-actions${phase >= 3 ? ' is-visible' : ''}`}>
        <Link to="/stays" className="hero-welcome-btn hero-welcome-btn--primary">Plan your visit</Link>
        <a href="#about" className="hero-welcome-btn hero-welcome-btn--ghost">Explore the farm</a>
      </div>
      <a
        href="#about"
        className={`hero-scroll-cue${phase >= 3 ? ' is-visible' : ''}`}
        aria-label="Scroll to discover the farm"
      >
        <span>Discover</span>
        <i className="fas fa-chevron-down" aria-hidden="true" />
      </a>
    </div>
  );
}

function StoryCta({ cta, onGallery }) {
  if (cta.action === 'gallery') {
    return (
      <button type="button" className="vc-story-cta" onClick={onGallery}>
        {cta.label} <i className="fas fa-arrow-right" aria-hidden="true" />
      </button>
    );
  }
  if (cta.to) {
    return (
      <Link to={cta.to} className="vc-story-cta">
        {cta.label} <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <a href={cta.href} className="vc-story-cta">
      {cta.label} <i className="fas fa-arrow-right" aria-hidden="true" />
    </a>
  );
}

function LandingContent() {
  const heroVideoRef = useRef(null);
  const { openFarmGallery } = useFarmGallery();
  useScrollReveal();

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (mq.matches) {
        video.pause();
        video.removeAttribute('autoplay');
      } else {
        video.setAttribute('autoplay', '');
        video.play().catch(() => {});
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <main className="landing-main landing-main--home">
      <section className="hero hero--clear-video vc-hero">
        <div className="hero-bg hero-bg--video">
          <video
            ref={heroVideoRef}
            className="hero-video"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
          >
            <source src={LANDING_VIDEO} type="video/mp4" />
          </video>
        </div>
        <div className="hero-content hero-content--welcome hero-content--plain">
          <HeroWelcomeText />
        </div>
      </section>

      {storySections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className={`vc-story-row vc-story-row--${section.tone}${section.reverse ? ' vc-story-row--reverse' : ''} vc-reveal`}
        >
          <div
            className={`vc-story-media-wrap vc-photo-reveal${section.reverse ? ' vc-photo-reveal--from-left' : ' vc-photo-reveal--from-right'}`}
          >
            <img
              className="vc-story-media"
              src={section.img}
              alt={section.title}
              loading="lazy"
            />
          </div>
          <div className="vc-story-copy">
            <p className="vc-story-eyebrow">{section.eyebrow}</p>
            <h2 className="vc-story-title">{section.title}</h2>
            {section.paragraphs.map((text) => (
              <p key={text.slice(0, 28)} className="vc-story-body">
                {text}
              </p>
            ))}
            <StoryCta cta={section.cta} onGallery={openFarmGallery} />
          </div>
        </section>
      ))}

      <section className="vc-paths vc-reveal" id="glimpses">
        <p className="vc-paths-lead">Two ways to experience the farm</p>
        <div className="vc-paths-grid">
          <Link
            to="/stays"
            className="vc-path-card"
            style={{ backgroundImage: `url("${IMG_FARM_EXTERIOR}")` }}
          >
            <div className="vc-path-card-inner">
              <span className="vc-path-tag">Stay</span>
              <h3>Farm houses</h3>
              <p>Book dates, choose your house, add breakfast or a picnic.</p>
            </div>
          </Link>
          <Link
            to="/events"
            className="vc-path-card"
            style={{ backgroundImage: `url("${IMG_GAZEBO}")` }}
          >
            <div className="vc-path-card-inner">
              <span className="vc-path-tag">Celebrate</span>
              <h3>Events &amp; weddings</h3>
              <p>Garden, barn and lawns for gatherings large and small.</p>
            </div>
          </Link>
        </div>
      </section>

      <section className="vc-guest-note vc-reveal" id="stories">
        <div className="vc-guest-note-inner">
          <div className="vc-guest-note-mark" aria-hidden="true">
            <img src="/Valley_Croft_Farm-removebg-preview.png" alt="" className="vc-guest-note-logo" />
          </div>
          <blockquote className="vc-guest-note-text">
            It felt like the world slowed down — birdsong, open skies, and evenings we still talk about.
          </blockquote>
          <p className="vc-guest-note-attr">A guest at Valley Croft</p>
        </div>
      </section>

      <section className="vc-home-close vc-reveal">
        <div
          className="vc-home-close-bg"
          style={{ backgroundImage: `url("${IMG_ENTRANCE_WALKWAY}")` }}
          aria-hidden="true"
        />
        <div className="vc-home-close-inner">
          <h2>We would love to welcome you</h2>
          <p>Stays, celebrations, and quiet escapes — about forty-five minutes from Johannesburg.</p>
          <div className="vc-home-close-actions">
            <Link to="/stays" className="vc-home-close-btn vc-home-close-btn--primary">Farm stays</Link>
            <Link to="/events" className="vc-home-close-btn">Events &amp; venues</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LandingPage() {
  return (
    <PublicSiteShell animateKey="home">
      <LandingContent />
    </PublicSiteShell>
  );
}
