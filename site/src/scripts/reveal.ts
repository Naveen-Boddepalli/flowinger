// The fallback for the section reveal in styles/motion.css, for browsers without scroll-driven animations
// (Firefox, today). Only blocks that start below the fold are hidden, so nothing on screen at load blinks,
// and with JavaScript off or reduced motion asked for, everything simply shows.
const selector = '.fl-reveal, [data-has-hero] .sl-markdown-content > *';

if (
  !CSS.supports('animation-timeline: view()') &&
  matchMedia('(prefers-reduced-motion: no-preference)').matches &&
  'IntersectionObserver' in window
) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('fl-revealed');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  for (const element of document.querySelectorAll(selector)) {
    if (element.getBoundingClientRect().top <= window.innerHeight) continue;
    element.classList.add('fl-reveal-pending');
    observer.observe(element);
  }
}
