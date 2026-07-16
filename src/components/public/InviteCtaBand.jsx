import { Link } from 'react-router-dom';

/**
 * @param {{
 *   eyebrow?: string,
 *   title: string,
 *   desc: string,
 *   primaryLabel: string,
 *   primaryTo: string,
 *   secondaryLabel?: string,
 *   secondaryTo?: string,
 *   image?: string,
 * }} props
 */
export default function InviteCtaBand({
  eyebrow = 'You are welcome here',
  title,
  desc,
  primaryLabel,
  primaryTo,
  secondaryLabel,
  secondaryTo,
  image,
}) {
  return (
    <section className="invite-cta-band">
      {image ? (
        <div className="invite-cta-band-bg" style={{ backgroundImage: `url("${image}")` }} aria-hidden="true" />
      ) : null}
      <div className="invite-cta-band-overlay" aria-hidden="true" />
      <div className="invite-cta-band-inner">
        <p className="invite-cta-eyebrow">{eyebrow}</p>
        <h2 className="invite-cta-title">{title}</h2>
        <p className="invite-cta-desc">{desc}</p>
        <div className="invite-cta-actions">
          <Link to={primaryTo} className="btn-cta btn-cta-primary">
            {primaryLabel}
          </Link>
          {secondaryLabel && secondaryTo ? (
            <Link to={secondaryTo} className="btn-cta btn-cta-secondary">
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
