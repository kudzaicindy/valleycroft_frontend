import { useState, useEffect, useMemo } from 'react';

const RAIL_WIDE = 196;
const RAIL_NARROW = 72;

/** Rail width for fixed sidebar + root padding: mobile always narrow; desktop follows collapse. */
export function useDashboardRailPx(sidebarCollapsed) {
  const [narrowViewport, setNarrowViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const fn = () => setNarrowViewport(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  return useMemo(
    () => (narrowViewport ? RAIL_NARROW : sidebarCollapsed ? RAIL_NARROW : RAIL_WIDE),
    [narrowViewport, sidebarCollapsed]
  );
}
