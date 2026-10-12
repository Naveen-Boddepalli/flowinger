import { useEffect } from 'react';
import { isEditable } from './pointer.ts';
import type { KeyCode } from './types.ts';

/** The modifier flags a pointer or wheel event carries — all that is needed to know a modifier is held. */
export interface Modifiers {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const MODIFIER = {
  control: 'ctrlKey',
  ctrl: 'ctrlKey',
  shift: 'shiftKey',
  alt: 'altKey',
  option: 'altKey',
  meta: 'metaKey',
  cmd: 'metaKey',
  command: 'metaKey',
} as const;

/** The `key` and `code` (lower-cased) of every key that is down, for a code that names more than a modifier. */
const down = new Set<string>();
let watchers = 0;

const parts = (code: string): string[] => (code === '+' ? ['+'] : code.split('+').filter((p) => p !== ''));
const lower = (part: string) => part.toLowerCase();

/**
 * Whether a key code — a key (`'Shift'`, `'z'`, `'Space'`), a combination (`'Meta+z'`) or a list of them, any
 * of which counts — is held, as an event says: a modifier from the event's own flags, which are right at the
 * moment of the gesture; any other key from the keys {@link useKeyTracking} has seen go down. `null` and
 * `undefined` are never held. Matches `KeyboardEvent.key` or `.code`, ignoring case.
 */
export function isKeyHeld(code: KeyCode | null | undefined, e: Modifiers): boolean {
  if (code == null) return false;
  return (typeof code === 'string' ? [code] : code).some((combo) =>
    parts(combo).every((part) => {
      const flag = MODIFIER[lower(part) as keyof typeof MODIFIER];
      return flag ? e[flag] : down.has(lower(part));
    }),
  );
}

/** Whether a code names a key that is not a modifier, and so has to be tracked to be known. */
const needsTracking = (code: KeyCode | null | undefined): boolean =>
  code != null &&
  (typeof code === 'string' ? [code] : code).some((combo) => parts(combo).some((p) => !(lower(p) in MODIFIER)));

/**
 * Keeps track of which keys are down, while a canvas has a key code that needs it. One set of listeners on
 * the window for every canvas; none at all when the codes are only modifiers.
 */
export function useKeyTracking(...codes: (KeyCode | null | undefined)[]): void {
  const needed = codes.some(needsTracking);
  useEffect(() => {
    if (!needed || typeof window === 'undefined') return;
    const names = (e: KeyboardEvent) => [e.key.toLowerCase(), e.code.toLowerCase()];
    const press = (e: KeyboardEvent) => {
      // Typing in a field is not holding a key for a gesture.
      if (!isEditable(e.target ?? window)) for (const n of names(e)) down.add(n);
    };
    const release = (e: KeyboardEvent) => {
      for (const n of names(e)) down.delete(n);
    };
    const reset = () => {
      down.clear();
    };
    watchers++;
    window.addEventListener('keydown', press);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', press);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', reset);
      if (--watchers === 0) down.clear();
    };
  }, [needed]);
}
