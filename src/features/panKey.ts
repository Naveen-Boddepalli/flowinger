import type { Feature } from '../features.ts';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.ts';
import { useKeyPress } from '../useKeyPress.ts';

/**
 * Holding a key (`panActivationKeyCode` — React Flow's own default is `'Space'`, this has none) turns a drag
 * into a pan, even where `panOnDrag` is off or the press would have begun a selection box.
 *
 * A feature, not part of the core: listening for keys costs a canvas that only shows a graph about 0.6 kB
 * of gzip it would never use. The core asks the store whether the key is held at the moment of a press.
 */
export const panKeyFeature: Feature = {
  name: 'panKey',

  useCanvas({ store, props }) {
    const held = useKeyPress(props.panActivationKeyCode ?? null);
    useIsomorphicLayoutEffect(() => {
      store.setPanKeyHeld(held);
      return () => {
        store.setPanKeyHeld(false);
      };
    }, [store, held]);
    return held ? { style: { cursor: 'grab' } } : {};
  },
};
