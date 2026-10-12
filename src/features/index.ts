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
import { editingFeature } from './editing.ts';
import { eventsFeature } from './events.ts';
import { panKeyFeature } from './panKey.ts';
import { reconnectFeature } from './reconnect.tsx';
import { selectionFeature } from './selection.ts';
import { selectionRectFeature } from './selectionRect.tsx';
import { stackingFeature } from './stacking.ts';

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
  editingFeature,
  eventsFeature,
  panKeyFeature,
  reconnectFeature,
  selectionFeature,
  selectionRectFeature,
  stackingFeature,
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
  dragFeature,
  connectFeature,
  reconnectFeature,
  boxSelectFeature,
  selectionRectFeature,
  stackingFeature,
  colorModeFeature,
  panKeyFeature,
];
