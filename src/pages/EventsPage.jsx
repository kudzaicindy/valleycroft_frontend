import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaBed,
  FaCalendarCheck,
  FaCar,
  FaCoffee,
  FaFire,
  FaLeaf,
  FaMusic,
  FaThLarge,
} from 'react-icons/fa';
import PublicSiteShell from '@/components/public/PublicSiteShell';
import useScrollReveal from '@/hooks/useScrollReveal';
import {
  IMG_BARN_TABLE_END,
  IMG_BARN_TABLE_SIDE,
  IMG_BARN_VENUE,
  IMG_GARDEN_TABLE,
  IMG_GAZEBO,
  IMG_GRAZING_BOARD,
  IMG_PICNIC_COUPLE,
  IMG_TABLE_CLOSEUP,
  IMG_WEDDING_ARCH,
  IMG_WEDDING_POOL,
} from '@/content/farmLifeMedia';
import '@/pages/LandingPage.css';

const NAV_SECTIONS = [
  { id: 'weddings', label: 'Weddings' },
  { id: 'celebrations', label: 'Celebrations' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'picnics', label: 'Picnics' },
  { id: 'retreats', label: 'Retreats' },
  { id: 'food', label: 'Food' },
];

const WEDDING_INCLUDED = [
  {
    Icon: FaBed,
    text: 'Optional on-site accommodation in our farm cottages — ideal for the wedding party the night before.',
  },
  {
    Icon: FaCalendarCheck,
    text: 'Two planning meetings with our events coordinator, plus a shared list of trusted local suppliers.',
  },
  {
    Icon: FaFire,
    text: 'Fire pit and outdoor bar set-up on request when the weather allows — perfect for evening ambience.',
  },
  {
    Icon: FaLeaf,
    text: 'Seasonal flowers, fruit and greenery from the farm where available — styled simply and beautifully.',
  },
  {
    Icon: FaCoffee,
    text: 'Tea and coffee service for your ceremony and reception windows.',
  },
  {
    Icon: FaMusic,
    text: 'PA sound system in the barn and gazebo for background music and speeches.',
  },
  {
    Icon: FaThLarge,
    text: 'Tables, chairs, and basic table linen for your chosen layout.',
  },
  {
    Icon: FaCar,
    text: 'On-site parking for guests across the farm grounds.',
  },
];

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function EventEditorial({ reverse, image, imageAlt, title, meta, children }) {
  return (
    <article className={`vc-stay-editorial${reverse ? ' vc-stay-editorial--reverse' : ''}`}>
      <div className="vc-stay-editorial-copy">
        <h3 className="vc-stay-editorial-name">{title}</h3>
        {meta ? <p className="vc-stay-editorial-meta">{meta}</p> : null}
        {children}
      </div>
      <div
        className={`vc-stay-editorial-media vc-event-editorial-media vc-photo-reveal${reverse ? ' vc-photo-reveal--from-left' : ' vc-photo-reveal--from-right'}`}
      >
        <img src={image} alt={imageAlt} loading="lazy" />
      </div>
    </article>
  );
}

export default function EventsPage() {
  const [activeSection, setActiveSection] = useState('weddings');

  useScrollReveal();

  useEffect(() => {
    const nodes = NAV_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveSection(visible.target.id);
      },
      { rootMargin: '-28% 0px -48% 0px', threshold: [0, 0.2, 0.45] }
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <PublicSiteShell animateKey="events">
      <main className="landing-main landing-main--venues vc-event-page">
        <div className="vc-event-hero vc-photo-reveal vc-photo-reveal--hero">
          <img src={IMG_GARDEN_TABLE} alt="Long table set for a celebration on the farm" />
        </div>

        <nav className="vc-stay-subnav vc-event-subnav" aria-label="Event categories">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`vc-stay-subnav-link${activeSection === s.id ? ' is-active' : ''}`}
              onClick={() => scrollToSection(s.id)}
            >
              {s.label}
            </button>
          ))}
          <Link to="/event-enquiry" className="vc-stay-subnav-link vc-stay-subnav-link--muted">
            Send enquiry
          </Link>
        </nav>

        <section id="weddings" className="vc-event-section">
          <header className="vc-event-section-head">
            <h2 className="vc-event-section-title">Weddings</h2>
            <p className="vc-event-section-intro">
              Say &ldquo;I do&rdquo; under the trees, celebrate in the barn, and let your guests wander
              the lawns — Valleycroft is a working farm with room to breathe.
            </p>
          </header>

          <EventEditorial
            image={IMG_WEDDING_ARCH}
            imageAlt="Wedding ceremony in the garden"
            title="Ceremony"
            meta="Garden & gazebo · up to 300+ guests"
          >
            <p className="vc-stay-editorial-desc">
              Exchange vows in the garden or beneath the gazebo, with wide lawns and mountain views
              as your backdrop. We help you find the right spot for your guest count and season.
            </p>
            <Link to="/event-enquiry?type=wedding" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>

          <EventEditorial
            reverse
            image={IMG_BARN_VENUE}
            imageAlt="Reception in the barn"
            title="The Barn"
            meta="Indoor reception · up to 40 guests"
          >
            <p className="vc-stay-editorial-desc">
              Long-table dinners, speeches, and dancing in our rustic barn — weather-proof and
              warmly lit for evening celebrations.
            </p>
            <Link to="/event-enquiry?type=wedding" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>

          <div className="vc-event-included">
            <h3 className="vc-event-included-title">Included in your wedding package</h3>
            <div className="vc-event-included-grid">
              {WEDDING_INCLUDED.map(({ Icon, text }) => (
                <article key={text} className="vc-event-included-card">
                  <span className="vc-event-included-icon" aria-hidden>
                    <Icon />
                  </span>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="celebrations" className="vc-event-section vc-event-section--alt">
          <header className="vc-event-section-head">
            <h2 className="vc-event-section-title">Celebrations</h2>
            <p className="vc-event-section-intro">
              Birthdays, anniversaries, christenings, and milestone gatherings — from intimate
              lunches to full-farm parties on the lawns and around the pool.
            </p>
          </header>

          <EventEditorial
            image={IMG_GAZEBO}
            imageAlt="Garden celebration under the gazebo"
            title="Garden & gazebo"
            meta="Outdoor · flexible layout"
          >
            <p className="vc-stay-editorial-desc">
              Open-air dining and cocktails under the trees. Ideal for summer afternoons and
              relaxed family celebrations.
            </p>
            <Link to="/event-enquiry?type=celebration" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>

          <EventEditorial
            reverse
            image={IMG_WEDDING_POOL}
            imageAlt="Poolside celebration on the lawns"
            title="Lawns & pool"
            meta="Outdoor · large groups"
          >
            <p className="vc-stay-editorial-desc">
              Wide lawns and a pool terrace for bigger groups — bring your own DJ, food trucks, or
              let us coordinate catering on your behalf.
            </p>
            <Link to="/event-enquiry?type=celebration" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>
        </section>

        <section id="meetings" className="vc-event-section">
          <header className="vc-event-section-head">
            <h2 className="vc-event-section-title">Business meetings</h2>
            <p className="vc-event-section-intro">
              Step away from the boardroom — host strategy sessions, workshops, and client days on
              the farm, with fresh air and good coffee between sessions.
            </p>
          </header>

          <EventEditorial
            image={IMG_BARN_TABLE_SIDE}
            imageAlt="Meeting setup in the barn"
            title="The Barn"
            meta="Indoor · up to 40 delegates"
          >
            <p className="vc-stay-editorial-desc">
              A quiet, weather-proof space for presentations, breakaways, and working lunches.
              Tables can be arranged boardroom-style or classroom-style to suit your agenda.
            </p>
            <Link to="/event-enquiry?type=corporate" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>

          <EventEditorial
            reverse
            image={IMG_GAZEBO}
            imageAlt="Outdoor meeting space in the garden"
            title="Garden sessions"
            meta="Outdoor · breakout & networking"
          >
            <p className="vc-stay-editorial-desc">
              Take brainstorming sessions outside under the trees, or host a standing networking
              lunch on the lawns. Ideal paired with a half-day in the barn.
            </p>
            <Link to="/event-enquiry?type=corporate" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>
        </section>

        <section id="picnics" className="vc-event-section vc-event-section--alt">
          <header className="vc-event-section-head">
            <h2 className="vc-event-section-title">Picnics</h2>
            <p className="vc-event-section-intro">
              Curated farm picnics on the lawns — grazing boards, fresh produce, and a laid-back
              afternoon with friends and family.
            </p>
          </header>

          <EventEditorial
            image={IMG_PICNIC_COUPLE}
            imageAlt="Picnic on the farm"
            title="Farm picnic"
            meta="Per person · one-time"
          >
            <p className="vc-stay-editorial-desc">
              We set the scene on the lawns with blankets, boards, and seasonal bites. Perfect for
              proposals, small gatherings, or a slow Sunday with your people.
            </p>
            <Link to="/event-enquiry?type=picnic" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>
        </section>

        <section id="retreats" className="vc-event-section">
          <header className="vc-event-section-head">
            <h2 className="vc-event-section-title">Retreats</h2>
            <p className="vc-event-section-intro">
              Take over the farm for a team off-site, wellness weekend, or creative residency —
              accommodation, venues, and wide-open space in one place.
            </p>
          </header>

          <EventEditorial
            image={IMG_BARN_TABLE_END}
            imageAlt="Farm retreat dinner in the barn"
            title="Full farm hire"
            meta="Multi-day · exclusive use"
          >
            <p className="vc-stay-editorial-desc">
              Combine our cottages, barn, and outdoor spaces for a private retreat. We tailor
              layouts, meals, and activities to your group.
            </p>
            <Link to="/event-enquiry?type=retreat" className="vc-event-text-link">
              Enquire now
            </Link>
          </EventEditorial>
        </section>

        <section id="food" className="vc-event-section vc-event-food">
          <header className="vc-event-section-head">
            <h2 className="vc-event-section-title">Food</h2>
            <p className="vc-event-section-intro">
              Fresh, seasonal produce sits at the heart of every Valleycroft table. Our style leans
              towards simplicity — generously styled platters and family-style service your guests
              can help themselves to.
            </p>
          </header>

          <div className="vc-event-food-hero vc-photo-reveal">
            <img src={IMG_GRAZING_BOARD} alt="Farm grazing board" loading="lazy" />
          </div>

          <div className="vc-event-food-cols">
            <div className="vc-event-food-col">
              <h3>Family-style meal</h3>
              <p>
                Seasonal salads with farm-baked bread, followed by a choice of mains — grilled
                meats, vegetarian options, and sides served to the table for everyone to share.
              </p>
            </div>
            <div className="vc-event-food-col">
              <h3>Dessert</h3>
              <p>
                A dessert station with cakes, fruit, and sweet bites — revealed when you are ready,
                or kept simple with a single showstopper if you prefer.
              </p>
            </div>
            <div className="vc-event-food-col">
              <h3>Drinks</h3>
              <p>
                We can coordinate cordials, iced teas, and bar service with trusted local suppliers.
                Bring your own wine or let us quote a full drinks package for your event.
              </p>
            </div>
          </div>

          <div className="vc-event-food-cta">
            <img src={IMG_TABLE_CLOSEUP} alt="" className="vc-event-food-thumb" loading="lazy" />
            <div>
              <p>Every menu is built around your date, guest count, and the season on the farm.</p>
              <Link to="/event-enquiry" className="vc-event-text-link">
                Discuss catering →
              </Link>
            </div>
          </div>
        </section>

        <section className="vc-event-footer-cta">
          <h2>Let&apos;s plan your day</h2>
          <p>Share your date and guest count — we will send a quote within one business day.</p>
          <div className="vc-event-footer-btns">
            <Link to="/event-enquiry" className="vc-stay-book-btn">
              Send enquiry
            </Link>
            <Link to="/stays" className="vc-stay-book-btn vc-stay-book-btn--outline">
              Book farm stays
            </Link>
          </div>
        </section>
      </main>
    </PublicSiteShell>
  );
}
