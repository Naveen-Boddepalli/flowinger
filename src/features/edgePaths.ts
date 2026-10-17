import type { Feature } from '../features.ts';

/**
 * The edge paths other than the bezier: `straight`, `smoothstep` and `step`. In 1.x the core draws them
 * itself and this does nothing; from 2.0 they come with it, so a `<FlowingerCore>` whose edges are all
 * beziers does not carry them. Name it now and nothing changes when they move. `<FlowingerCanvas>` and
 * `<ReactFlow>` have it.
 */
export const edgePathsFeature: Feature<Record<string, never>> = {
  name: 'edgePaths',
  install: () => ({}),
};
