import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  type FlowingerInstance,
  type FlowingerProps,
  type Node,
} from '../index.ts';
import { NOT_IMPLEMENTED } from '../devWarnings.ts';

// A prop that is in the type, so code written for React Flow compiles, but that nothing reads is a lie
// to anyone who passes it. It is said three ways — the `@unimplemented` tag on its declaration, a
// development warning, and `docs/react-flow-coverage.md` — and these tests keep the first two the same.

const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, data: {} }];
const propsOf = (extra: Record<string, unknown>) => ({ nodes, ...extra }) as unknown as FlowingerProps;

type Spy = { mock: { calls: unknown[][] } };
const warnings = (warn: Spy) => warn.mock.calls.map((c) => String(c[0]));
const aboutUnimplemented = (warn: Spy) =>
  warnings(warn).filter((w) => w.includes('accepted so React Flow code compiles'));

/** The names under an `@unimplemented` tag inside one interface of `types.ts`. */
function taggedIn(interfaceName: string): string[] {
  const source = readFileSync(resolve('src/types.ts'), 'utf8');
  const start = source.search(new RegExp(`export interface ${interfaceName}[ <]`));
  expect(start, `${interfaceName} is declared in types.ts`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}\n', start);
  const body = source.slice(start, end);
  return [...body.matchAll(/@unimplemented[\s\S]*?\*\/\s*\n\s*(\w+)\??:/g)].map((m) => m[1] as string);
}

describe('accepted but not implemented', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is tagged `@unimplemented` on exactly the props that warn', () => {
    expect(taggedIn('FlowingerProps').sort()).toEqual(Object.keys(NOT_IMPLEMENTED).sort());
  });

  it('is not claimed by the engine: no source file but the declarations names these props', () => {
    // The tag is a promise that nothing reads the prop. If a prop gets an implementation, drop its tag
    // and its entry — this lists the files that mention it so the test says where to look.
    const root = `${resolve('src')}/`;
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = `${dir}${entry}`;
        if (entry === '__tests__') return [];
        return statSync(path).isDirectory() ? walk(`${path}/`) : /\.tsx?$/.test(entry) ? [path] : [];
      });
    const skipped = new Set(['types.ts', 'devWarnings.ts', 'reactFlowNames.ts']);
    const readers: string[] = [];
    for (const file of walk(root)) {
      if (skipped.has(file.slice(root.length))) continue;
      const text = readFileSync(file, 'utf8');
      for (const name of Object.keys(NOT_IMPLEMENTED)) {
        if (new RegExp(`\\b${name}\\b`).test(text)) readers.push(`${file.slice(root.length)}: ${name}`);
      }
    }
    expect(readers).toEqual([]);
  });

  describe.each(Object.keys(NOT_IMPLEMENTED) as (keyof FlowingerProps)[])('%s', (name) => {
    it('says so in development, naming the prop', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<FlowingerCore {...propsOf({ [name]: '__asked_for__' })} />);
      const said = aboutUnimplemented(warn);
      expect(said).toHaveLength(1);
      expect(said[0]).toContain(name);
    });

    it('is quiet when left out', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<FlowingerCore {...propsOf({})} />);
      expect(aboutUnimplemented(warn)).toEqual([]);
    });

    it.each(NOT_IMPLEMENTED[name] ?? [])('is quiet for %j, which is what happens anyway', (value) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<FlowingerCore {...propsOf({ [name]: value })} />);
      expect(aboutUnimplemented(warn)).toEqual([]);
    });
  });

  it('says it once, for all of them, and counts the ones given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FlowingerCanvas {...propsOf({ connectOnClick: true, debug: true, connectionRadius: 5 })} />);
    const said = aboutUnimplemented(warn);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/connectOnClick, connectionRadius, debug are accepted/);
  });

  it('says so for the handles a node declares, which nothing draws edges from', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withHandles: Node = {
      id: 'h',
      position: { x: 0, y: 0 },
      data: {},
      handles: [{ type: 'source', position: 'right' as never, x: 10, y: 10 }],
    };
    render(<FlowingerCanvas nodes={[withHandles]} />);
    expect(aboutUnimplemented(warn)[0]).toContain('nodes[].handles');
  });

  it('is tagged on Node.handles too', () => {
    expect(taggedIn('Node')).toContain('handles');
  });

  it('does not warn about anything a plain canvas is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FlowingerCanvas nodes={nodes} edges={[]} fitView />);
    expect(warnings(warn)).toEqual([]);
  });
});

describe('ease', () => {
  afterEach(() => vi.useRealTimers());

  function shown(container: HTMLElement): string {
    return container.querySelector<HTMLElement>('.flowinger-viewport')?.style.transform ?? '';
  }
  function mount() {
    let flow: FlowingerInstance | undefined;
    const view = render(
      <FlowingerCanvas
        nodes={nodes}
        onInit={(i) => {
          flow = i;
        }}
      />,
    );
    return { ...view, flow: () => flow as FlowingerInstance };
  }
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 50) act(() => vi.advanceTimersByTime(50));
  };

  it('shapes a viewport move: the move follows the curve it is given, and still lands on its target', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const { container, flow } = mount();
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => {
      done = flow().setViewport(
        { x: 100, y: 0, zoom: 1 },
        {
          duration: 300,
          ease: (t) => {
            seen.push(t);
            return 0; // goes nowhere until it lands
          },
        },
      );
    });
    run(150);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((t) => t >= 0 && t < 1)).toBe(true);
    expect(shown(container)).toBe('translate(0px, 0px) scale(1)');
    run(300);
    await expect(done).resolves.toBe(true);
    expect(shown(container)).toBe('translate(100px, 0px) scale(1)');
  });

  it('is ease-out cubic when none is given, so the move is past halfway by half the time', () => {
    vi.useFakeTimers();
    const { container, flow } = mount();
    act(() => {
      void flow().setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 1000 });
    });
    run(500);
    const x = Number(/translate\((-?[\d.]+)px/.exec(shown(container))?.[1]);
    expect(x).toBeGreaterThan(75); // ease-out cubic is 87.5 at t = 0.5; linear would be 50
    run(600);
    expect(shown(container)).toBe('translate(100px, 0px) scale(1)');
  });
});
