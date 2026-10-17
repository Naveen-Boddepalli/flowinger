import type { Feature } from '../features.ts';
import { a11yFeature } from './a11y.tsx';
import { colorModeFeature } from './colorMode.ts';
import { cullingFeature } from './culling.ts';
import { boxSelectFeature } from './boxSelect.tsx';
import { connectFeature } from './connect.tsx';
import { debugFeature } from './debug.ts';
import { deleteFeature } from './delete.ts';
import { dragFeature } from './drag.ts';
import { edgeLabelsFeature } from './edgeLabels.tsx';
import { edgePathsFeature } from './edgePaths.ts';
import { editingFeature } from './editing.ts';
import { eventsFeature } from './events.ts';
import { panKeyFeature } from './panKey.ts';
import { reconnectFeature } from './reconnect.tsx';
import { selectionFeature } from './selection.ts';
import { selectionRectFeature } from './selectionRect.tsx';
import { smoothFeature } from './smooth.ts';
import { stackingFeature } from './stacking.ts';
import { zoomKeyFeature } from './zoomKey.ts';

export {
  a11yFeature,
  boxSelectFeature,
  colorModeFeature,
  connectFeature,
  cullingFeature,
  debugFeature,
  deleteFeature,
  dragFeature,
  edgeLabelsFeature,
  edgePathsFeature,
  editingFeature,
  eventsFeature,
  panKeyFeature,
  reconnectFeature,
  selectionFeature,
  selectionRectFeature,
  smoothFeature,
  stackingFeature,
  zoomKeyFeature,
};

/** Every feature: what `<FlowingerCanvas>` (and `ReactFlow`) has. */
export const allFeatures: readonly Feature[] = [
  selectionFeature,
  // Before drag: a move is announced as the place the node was.
  a11yFeature,
  debugFeature,
  cullingFeature,
  deleteFeature,
  editingFeature,
  eventsFeature,
  edgeLabelsFeature,
  edgePathsFeature,
  dragFeature,
  connectFeature,
  reconnectFeature,
  boxSelectFeature,
  selectionRectFeature,
  stackingFeature,
  smoothFeature,
  zoomKeyFeature,
  colorModeFeature,
  panKeyFeature,
];
