import { ReactNode } from 'react';
import { scrollToTopSmooth, useScrollState } from '../lib/useScrollState';

type StickyBoardHeaderProps = {
  left: ReactNode;
  right: ReactNode;
  /** When true, left slot is replaced/prefixed by back-to-top when scrolled */
  showBackToTop?: boolean;
};

function BackToTopArrow() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5m0 0l-5 5m5-5l5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Fixed top nav: transparent at scrollY === 0, blurred dark when scrolled.
 * Optional minimal back-to-top arrow on the left when scrolled past ~150px.
 */
export default function StickyBoardHeader({
  left,
  right,
  showBackToTop = true
}: StickyBoardHeaderProps) {
  const { isScrolled, showBackToTop: showArrow } = useScrollState();

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5 transition-all duration-300 md:px-10 ${
        isScrolled
          ? 'border-b border-white/10 bg-black/80 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {showBackToTop && showArrow ? (
          <button
            type="button"
            onClick={scrollToTopSmooth}
            aria-label="Back to top"
            title="Back to top"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
          >
            <BackToTopArrow />
          </button>
        ) : null}
        <div className="min-w-0">{left}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">{right}</div>
    </header>
  );
}
