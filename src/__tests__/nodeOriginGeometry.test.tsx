import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useFlowingerStore } from '../context.ts';
import {
  FlowingerCanvas,
  FlowingerCore,
  FlowingerProvider,
  NodeResizer,
  panKeyFeature,
  useReactFlow,
  type Edge,
  type FlowingerInstance,
  type Node,
  type NodeChange,
  type NodeProps,
} from '../index.ts';

// `nodeOrigin` says where on a node its `position` is: [0, 0] its top-left corner, [0.5, 0.5] its centre. The
// branch's first version applied that to what it drew and to bounds, and nowhere else. These are the places
// it left out: a size that arrives after the first render, a child inside a parent with an origin, hit
// testing, resizing, the server render, and a canvas whose origin changes.

const at = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

const transformOf = (root: ParentNode, id: string): string =>
  (root.querySelector(`[data-id="${id}"]`) as HTMLElement).style.transform;

const pointer = (extra: Record<string, number>) => ({ pointerId: 1, button: 0, ...extra });

describe('a size that arrives after the first render', () => {
  it('moves a node whose origin depends on it — the position is never made from a size that has changed', () => {
    let store: ReturnType<typeof useFlowingerStore> | undefined;
    const Grab = () => {
      store = useFlowingerStore();
      return null;
    };
    // No declared size: until it is measured, the node is the 150 x 40 fallback.
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={[{ id: 'a', position: { x: 300, y: 200 }, data: {} }]} nodeOrigin={[0.5, 0.5]}>
          <Grab />
        </FlowingerCanvas>
      </FlowingerProvider>,
    );
    expect(transformOf(container, 'a')).toBe('translate(225px, 180px)'); // 300 - 75, 200 - 20

    // The browser measures it: 200 x 100. The node is re-placed, not left where the fallback put it.
    act(() => store?.setSize('a', 200, 100));
    expect(transformOf(container, 'a')).toBe('translate(200px, 150px)'); // 300 - 100, 200 - 50
  });

  it('leaves a node with no origin alone when it is measured', () => {
    let store: ReturnType<typeof useFlowingerStore> | undefined;
    const Grab = () => {
      store = useFlowingerStore();
      return null;
    };
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={[at('a', 40, 30)]}>
          <Grab />
        </FlowingerCanvas>
      </FlowingerProvider>,
    );
    act(() => store?.setSize('a', 300, 90));
    expect(transformOf(container, 'a')).toBe('translate(40px, 30px)');
  });
});

describe('a child inside a parent that has an origin', () => {
  it('sits relative to the parent\'s top-left corner, not to its position', () => {
    // Parent 200 x 100 centred on (400, 300): its top-left is (300, 250). A child at (10, 20) is at (310, 270).
    const nodes: Node[] = [
      at('parent', 400, 300, { width: 200, height: 100, origin: [0.5, 0.5] }),
      at('child', 10, 20, { parentId: 'parent', origin: [0, 0] }),
    ];
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    expect(transformOf(container, 'parent')).toBe('translate(300px, 250px)');
    expect(transformOf(container, 'child')).toBe('translate(310px, 270px)');
  });

  it('applies the canvas\'s origin to the child too: its own corner is where its position says, less its share', () => {
    // Canvas origin [0.5, 0.5]. Parent 200 x 100 at (400, 300) -> top-left (300, 250). Child 100 x 40 at (50, 30)
    // relative: its top-left is (300 + 50 - 50, 250 + 30 - 20) = (300, 260).
    const nodes: Node[] = [at('parent', 400, 300, { width: 200, height: 100 }), at('child', 50, 30, { parentId: 'parent' })];
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeOrigin={[0.5, 0.5]} />);
    expect(transformOf(container, 'parent')).toBe('translate(300px, 250px)');
    expect(transformOf(container, 'child')).toBe('translate(300px, 260px)');
  });

  it('keeps an edge to the child on the child\'s drawn box', () => {
    const nodes: Node[] = [
      at('parent', 400, 300, { width: 200, height: 100, origin: [0.5, 0.5] }),
      at('child', 10, 20, { parentId: 'parent', origin: [0, 0] }),
      at('other', 310, 500, { origin: [0, 0] }),
    ];
    const edges: Edge[] = [{ id: 'e', source: 'child', target: 'other' }];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    const d = container.querySelector('[data-testid="rf__edge-e"] .react-flow__edge-path')?.getAttribute('d') ?? '';
    // Unmeasured, an unnamed handle is the middle of the side the edge leaves by: child's bottom is
    // y = 270 + 40 = 310, its middle x = 310 + 50 = 360.
    expect(d.startsWith('M 360.00 310.00')).toBe(true);
  });
});

describe('what asks where a node is', () => {
  it('finds intersections by the drawn box, not by the position', () => {
    let flow: FlowingerInstance | undefined;
    const Grab = () => {
      flow = useReactFlow();
      return null;
    };
    // a: 100 x 40 centred on (100, 100) -> box x 50..150. b: top-left at (140, 90) -> x 140..240: they touch.
    // Raw positions (100 vs 140) would put a's box at 100..200 and report the same here, so use c, clear of
    // the raw box but inside the drawn one: top-left (60, 90), 20 wide -> 60..80, inside a's 50..150 only
    // when a is drawn about its centre.
    const nodes: Node[] = [
      at('a', 100, 100, { origin: [0.5, 0.5] }),
      at('c', 60, 90, { width: 20, height: 20, origin: [0, 0] }),
      at('far', 600, 600, { origin: [0, 0] }),
    ];
    render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes}>
          <Grab />
        </FlowingerCanvas>
      </FlowingerProvider>,
    );
    const hits = flow?.getIntersectingNodes({ id: 'a' }).map((n) => n.id);
    expect(hits).toEqual(['c']);
  });

  it('frames the drawn boxes with fitView and getNodesBounds', () => {
    let flow: FlowingerInstance | undefined;
    const Grab = () => {
      flow = useReactFlow();
      return null;
    };
    render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={[at('a', 100, 100), at('b', 300, 200)]} nodeOrigin={[0.5, 0.5]}>
          <Grab />
        </FlowingerCanvas>
      </FlowingerProvider>,
    );
    // a: 50..150 x 80..120; b: 250..350 x 180..220.
    expect(flow?.getNodesBounds(['a', 'b'])).toEqual({ x: 50, y: 80, width: 300, height: 140 });
  });
});

describe('resizing a node that has an origin', () => {
  it('keeps the box where it was dragged: the position follows the origin, not the top-left', () => {
    const changes: NodeChange[] = [];
    const Resizable = ({ id }: NodeProps) => <NodeResizer isVisible minWidth={10} minHeight={10} data-n={id} />;
    const { container } = render(
      <FlowingerCanvas
        nodes={[at('a', 400, 300, { width: 100, height: 40, origin: [0.5, 0.5], type: 'r' })]}
        nodeTypes={{ r: Resizable }}
        onNodesChange={(c) => changes.push(...c)}
      />,
    );
    // The right-hand handle, dragged 40 to the right: the box is x 350..450 -> 350..490, so the centre — the
    // position — moves from 400 to 420. (Reading `next.x` as the position would have left it at 350.)
    const handle = container.querySelector('.react-flow__resize-control.right') as HTMLElement | null;
    expect(handle, 'the right-hand resize control').not.toBeNull();
    fireEvent.pointerDown(handle!, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(handle!, pointer({ clientX: 40, clientY: 0 }));
    fireEvent.pointerUp(handle!, pointer({ clientX: 40, clientY: 0 }));
    const position = changes.find((c) => c.type === 'position');
    expect(position).toMatchObject({ id: 'a', position: { x: 420, y: 300 } });
  });
});

describe('the canvas\'s origin changing', () => {
  it('moves every node that has none of its own', () => {
    const nodes = [at('a', 300, 200), at('own', 300, 200, { origin: [0, 0] })];
    const { container, rerender } = render(<FlowingerCanvas nodes={nodes} />);
    expect(transformOf(container, 'a')).toBe('translate(300px, 200px)');
    rerender(<FlowingerCanvas nodes={nodes} nodeOrigin={[0.5, 0.5]} />);
    expect(transformOf(container, 'a')).toBe('translate(250px, 180px)');
    expect(transformOf(container, 'own')).toBe('translate(300px, 200px)');
  });
});

describe('nodeDragThreshold', () => {
  const dragBy = (container: ParentNode, id: string, dx: number) => {
    const el = container.querySelector(`[data-id="${id}"]`) as HTMLElement;
    fireEvent.pointerDown(el, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(el, pointer({ clientX: dx, clientY: 0 }));
    fireEvent.pointerUp(el, pointer({ clientX: dx, clientY: 0 }));
  };

  it('is the engine\'s own 3 px until it is given', () => {
    const { container } = render(<FlowingerCanvas nodes={[at('a', 0, 0)]} nodesDraggable />);
    dragBy(container, 'a', 2);
    expect(transformOf(container, 'a')).toBe('translate(0px, 0px)');
    dragBy(container, 'a', 5);
    expect(transformOf(container, 'a')).toBe('translate(5px, 0px)');
  });

  it('is what it says — and 0 means no threshold, not the default', () => {
    const { container } = render(<FlowingerCanvas nodes={[at('a', 0, 0)]} nodesDraggable nodeDragThreshold={0} />);
    dragBy(container, 'a', 1);
    expect(transformOf(container, 'a')).toBe('translate(1px, 0px)');
  });

  it('can be larger than the default', () => {
    const { container } = render(<FlowingerCanvas nodes={[at('a', 0, 0)]} nodesDraggable nodeDragThreshold={20} />);
    dragBy(container, 'a', 10);
    expect(transformOf(container, 'a')).toBe('translate(0px, 0px)');
    dragBy(container, 'a', 25);
    expect(transformOf(container, 'a')).toBe('translate(25px, 0px)');
  });
});

describe('panActivationKeyCode', () => {
  const press = (key: string) => fireEvent.keyDown(document, { key, code: key });
  const viewportOf = (container: ParentNode) => (container.querySelector('.flowinger-viewport') as HTMLElement).style.transform;

  it('is off by default: Space does not turn a drag into a pan when panning by drag is off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<FlowingerCanvas nodes={[]} panOnDrag={false} />);
    const pane = container.querySelector('.flowinger') as HTMLElement;
    press('Space');
    fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 160, clientY: 120 }));
    fireEvent.pointerUp(pane, pointer({ clientX: 160, clientY: 120 }));
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
    warn.mockRestore();
  });

  it('is a feature: a core without it does nothing and says so, and with it the key pans', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bare = render(<FlowingerCore nodes={[]} panOnDrag={false} panActivationKeyCode="Space" />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('panActivationKeyCode'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('panKeyFeature'));
    const barePane = bare.container.querySelector('.flowinger') as HTMLElement;
    act(() => {
      press('Space');
    });
    fireEvent.pointerDown(barePane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(barePane, pointer({ clientX: 160, clientY: 120 }));
    expect(viewportOf(bare.container)).toBe('translate(0px, 0px) scale(1)');
    bare.unmount();
    warn.mockRestore();

    const { container } = render(
      <FlowingerCore nodes={[]} panOnDrag={false} panActivationKeyCode="Space" features={[panKeyFeature]} />,
    );
    const pane = container.querySelector('.flowinger') as HTMLElement;
    act(() => {
      press('Space');
    });
    fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 160, clientY: 120 }));
    expect(viewportOf(container)).toBe('translate(60px, 20px) scale(1)');
  });

  it('shows a grab cursor while it is held, and takes it away when it is let go', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} panOnDrag={false} panActivationKeyCode="Space" />);
    const pane = container.querySelector('.flowinger') as HTMLElement;
    expect(pane.style.cursor).toBe('');
    act(() => {
      press('Space');
    });
    expect(pane.style.cursor).toBe('grab');
    act(() => {
      fireEvent.keyUp(document, { key: 'Space', code: 'Space' });
    });
    expect(pane.style.cursor).toBe('');
  });

  it('turns a drag into a pan while the key is held, when asked for', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} panOnDrag={false} panActivationKeyCode="Space" />);
    const pane = container.querySelector('.flowinger') as HTMLElement;
    act(() => {
      press('Space');
    });
    fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 160, clientY: 120 }));
    expect(viewportOf(container)).toBe('translate(60px, 20px) scale(1)');
  });
});
