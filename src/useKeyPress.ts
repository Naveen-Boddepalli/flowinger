import { useEffect, useState } from 'react';
import { MODIFIER, parts as partsOf, type Modifiers } from './keys.ts';
import { isEditable } from './pointer.ts';

export interface UseKeyPressOptions {
  /** Where to listen. Default `document`. */
  target?: Document | HTMLElement | Window | null;
  /** Whether a combination with Ctrl, ⌘ or Alt still counts inside a text field. Default true. */
  actInsideInputWithModifier?: boolean;
}

/** The modifiers a combination needs (as the event flags that say they are held), and the key that completes it. */
interface Combo extends Modifiers {
  key: string;
}

type Flag = keyof Modifiers;
const FLAGS: Flag[] = ['ctrlKey', 'shiftKey', 'altKey', 'metaKey'];
const flagOf = (name: string): Flag | undefined => MODIFIER[name as keyof typeof MODIFIER];

/** `'Meta+s'` → the modifiers it needs and the key that completes it. A lone `'+'` is the plus key. */
function parse(code: string): Combo {
  const combo: Combo = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, key: '' };
  const parts = partsOf(code);
  const last = parts.pop() ?? '';
  for (const part of parts) {
    const flag = flagOf(part.toLowerCase());
    if (flag) combo[flag] = true;
  }
  combo.key = last.toLowerCase();
  return combo;
}

const matches = (e: KeyboardEvent, c: Combo): boolean => {
  // A blank key matches nothing — not even a soft keyboard's event, whose `code` is blank too.
  if (c.key === '') return false;
  if (e.key.toLowerCase() !== c.key && e.code.toLowerCase() !== c.key) return false;
  // Exactly the modifiers asked for — `s` is not `Meta+s` — bar the one a modifier key is itself.
  const own = flagOf(c.key);
  return FLAGS.every((flag) => (c[flag] || own === flag) === e[flag]);
};

/**
 * Whether a key (or a combination — `'Meta+s'`, `'Shift+ArrowUp'`) is held. Give
 * a list and any of them counts; `null` never matches. Matches `KeyboardEvent.key`
 * or `.code`, ignoring case. False on the server, and on losing focus — a key
 * released in another window is not seen.
 */
export function useKeyPress(
  keyCode: string | readonly string[] | null,
  { target, actInsideInputWithModifier = true }: UseKeyPressOptions = {},
): boolean {
  const [pressed, setPressed] = useState(false);
  const listKey = keyCode === null ? null : typeof keyCode === 'string' ? keyCode : keyCode.join('\u0000');

  useEffect(() => {
    if (listKey === null) return;
    const combos = listKey.split('\u0000').map(parse);
    const el = target === undefined ? document : target;
    if (!el) return;

    const down = (event: Event) => {
      const e = event as KeyboardEvent;
      const modified = e.ctrlKey || e.metaKey || e.altKey;
      // Typing in a field is not a shortcut — unless it is a modified one, and the caller allows that.
      if (isEditable(e.target ?? el) && !(actInsideInputWithModifier && modified)) return;
      if (combos.some((c) => matches(e, c))) setPressed(true);
    };
    const up = (event: Event) => {
      const e = event as KeyboardEvent;
      const key = e.key.toLowerCase();
      const code = e.code.toLowerCase();
      // Released: the key that completes a combination, or one of the modifiers it needed.
      const released = combos.some((c) => {
        const flag = flagOf(key);
        return key === c.key || code === c.key || (flag !== undefined && c[flag]);
      });
      if (released) setPressed(false);
    };
    const blur = () => {
      setPressed(false);
    };
    el.addEventListener('keydown', down);
    el.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('keydown', down);
      el.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      setPressed(false);
    };
  }, [listKey, target, actInsideInputWithModifier]);

  return pressed;
}
