import type { Feature } from '../features.ts';
import { pathFor } from '../paths.ts';

/** What `edgePathsFeature` lends the edges: the path for an edge of any built-in `type`. */
export type EdgePathsApi = { pathFor: typeof pathFor };

/**
 * The edge paths other than the bezier: `straight`, `smoothstep` and `step`. Without it a `<FlowingerCore>` draws
 * every edge as a bezier, React Flow's default, and does not carry the others. `<FlowingerCanvas>` and
 * `<ReactFlow>` have it.
 */
export const edgePathsFeature: Feature<EdgePathsApi> = {
  name: 'edgePaths',
  install: () => ({ pathFor }),
};
