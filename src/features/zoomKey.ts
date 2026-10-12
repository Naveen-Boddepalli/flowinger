import type { Feature } from '../features.ts';
import { isKeyHeld, useKeyTracking } from '../keys.ts';

/**
 * `zoomActivationKeyCode`: holding the key makes the wheel zoom. A modifier is read from the event itself;
 * any other key is tracked while it is down, on one set of listeners for the page, and only while a canvas has
 * a code that needs it. (The selection keys — `selectionKeyCode`, `multiSelectionKeyCode` — and
 * `panActivationKeyCode` bring their own.)
 */
export const zoomKeyFeature: Feature = {
  name: 'zoomKey',
  keyHeld: isKeyHeld,
  useCanvas({ props }) {
    useKeyTracking(props.zoomActivationKeyCode);
    return undefined;
  },
};
