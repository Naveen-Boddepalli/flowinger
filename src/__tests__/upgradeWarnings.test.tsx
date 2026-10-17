import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { resetUpgradeWarnings } from '../devWarnings.ts';
import {
  FlowingerCore,
  type Node,
} from '../index.ts';

// What 1.1 says in development about what 2.0 changes — once a page each.

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 200, y: 100 }, width: 100, height: 40, data: {} },
];
let warn: ReturnType<typeof vi.spyOn>;
const said = (): string[] => warn.mock.calls.map((c: unknown[]) => String(c[0]));
const about = (word: string): string[] => said().filter((s) => s.includes(word));

beforeEach(() => {
  resetUpgradeWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(process.env, 'JEST_WORKER_ID');
});

describe('Jest', () => {
  it('is told nothing outside Jest', () => {
    render(<FlowingerCore nodes={nodes} />);
    expect(about('ES modules only')).toEqual([]);
  });

  it('is told, once, where it loads flowinger through require', () => {
    process.env.JEST_WORKER_ID = '1';
    render(<FlowingerCore nodes={nodes} />);
    render(<FlowingerCore nodes={nodes} />);
    // Only where the module is CommonJS (`__filename` is defined), which is what 2.0 stops shipping.
    const expected = typeof __filename === 'undefined' ? 0 : 1;
    expect(about('ES modules only')).toHaveLength(expected);
  });
});
