import { FlowingerCore } from './FlowingerCore.tsx';
import { allFeatures } from './features/index.ts';
import type { FlowingerProps } from './types.ts';

/**
 * The whole canvas — every feature, and what a React Flow app expects of `<ReactFlow>`. An app that
 * needs less imports {@link FlowingerCore} and names the features it does need, and pays only for those.
 */
export function FlowingerCanvas(props: FlowingerProps) {
  return <FlowingerCore {...props} features={props.features ? [...allFeatures, ...props.features] : allFeatures} />;
}
