import { useEffect } from 'react';

/** iOS and Android only autoplay inline video when muted is a real property, not just an attribute. */
export function primeInlineVideo(video) {
  if (!video) return;
  video.defaultMuted = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('x5-playsinline', 'true');
  video.setAttribute('x5-video-player-type', 'h5');
}

export function playInlineVideo(video) {
  primeInlineVideo(video);
  const attempt = video.play();
  if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
}

/**
 * Keep a muted inline video playing on phones.
 * Retries after the first tap and when the page becomes visible again.
 */
export default function useInlineVideo(videoRef, { active = true } = {}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const play = () => {
      if (reduced.matches) return;
      playInlineVideo(video);
    };
    const pause = () => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    };

    if (reduced.matches) {
      pause();
      video.removeAttribute('autoplay');
      return undefined;
    }

    play();
    video.addEventListener('loadeddata', play);
    video.addEventListener('canplay', play);

    const onVisible = () => {
      if (document.visibilityState === 'visible') play();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('touchstart', play, { passive: true, once: true });
    window.addEventListener('click', play, { once: true });
    reduced.addEventListener('change', play);

    return () => {
      video.removeEventListener('loadeddata', play);
      video.removeEventListener('canplay', play);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('touchstart', play);
      window.removeEventListener('click', play);
      reduced.removeEventListener('change', play);
      pause();
    };
  }, [videoRef, active]);
}
