import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect`, except on the server, where React 18 warns that it "does
 * nothing" and every version skips it anyway. Everything this package does in a
 * layout effect is a DOM measurement or attachment, so `useEffect` — which
 * also never runs on the server — is the right stand-in there.
 */
export const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
