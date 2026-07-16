import { useEffect } from 'react';

function isInViewport(el, marginBottom = 32) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.top < vh - marginBottom && rect.bottom > 0;
}

/**
 * Reveals elements with `.vc-reveal` / `.vc-photo-reveal` when they enter the viewport.
 * @param {string} [selector]
 * @param {import('react').DependencyList} [deps] Re-scan when content mounts (e.g. async lists).
 */
export default function useScrollReveal(
  selector = '.landing-main .vc-reveal, .landing-main .vc-photo-reveal',
  deps = []
) {
  useEffect(() => {
    const nodes = document.querySelectorAll(selector);
    if (!nodes.length) return undefined;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      nodes.forEach((el) => el.classList.add('is-inview'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-inview');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );

    nodes.forEach((el) => {
      if (isInViewport(el)) {
        el.classList.add('is-inview');
        return;
      }
      observer.observe(el);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);
}
