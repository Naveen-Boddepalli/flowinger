// Where each person sits. Collapsing a branch hides it — `useCollapsibleTree` sets `hidden` — but it does
// not move anything: the people left over would stay spread out around a gap. So the layout is run again
// over *what is shown*, and the tree closes up.
//
// d3-hierarchy's tidy tree, as in the `layouts` example: every node is the same size, so its `nodeSize`
// does the whole job. For nodes whose content decides their size, see the note at the top of that example's
// `layout.ts`.
import { stratify, tree } from 'd3-hierarchy';
import type { Person } from './people';

export const NODE_WIDTH = 188;
export const NODE_HEIGHT = 56;

export type Positions = Record<string, { x: number; y: number }>;

/** The top-left corner of every person in `shown`. A person whose manager is not shown cannot be placed. */
export function layoutShown(shown: Person[]): Positions {
  if (shown.length === 0) return {};
  const root = stratify<Person>()
    .id((p) => p.id)
    .parentId((p) => p.manager)(shown);
  // Room one node takes, centre to centre: across its siblings, then along the tree. Left to right, so a
  // wide tree is tall rather than wide — which is the shape of the page.
  const laid = tree<Person>().nodeSize([NODE_HEIGHT + 22, NODE_WIDTH + 84])(root);

  const positions: Positions = {};
  laid.each((n) => {
    // d3 reports the centre, `x` across the tree and `y` along it; left to right swaps them.
    positions[n.data.id] = { x: n.y - NODE_WIDTH / 2, y: n.x - NODE_HEIGHT / 2 };
  });
  return positions;
}
