import type { CSSProperties } from 'react';

/** Read by screen readers and nothing else: on the page, and out of sight. */
export const HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  border: 0,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0px, 0px, 0px, 0px)',
  clipPath: 'inset(100%)',
};
