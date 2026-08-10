import { useEffect, useState } from 'react';

/**
 * Tracks page scroll for sticky headers / back-to-top affordances.
 */
export function useScrollState(options?: { blurAt?: number; backToTopAt?: number }) {
  const blurAt = options?.blurAt ?? 20;
  const backToTopAt = options?.backToTopAt ?? 150;
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const read = () => {
      const y =
        typeof window !== 'undefined'
          ? window.scrollY || document.documentElement.scrollTop || 0
          : 0;
      setScrollY(y);
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, []);

  return {
    scrollY,
    isScrolled: scrollY > blurAt,
    showBackToTop: scrollY > backToTopAt
  };
}

export function scrollToTopSmooth() {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
