import type { Feature } from '../features.ts';
import { colorModeFeature } from './colorMode.ts';
import { cullingFeature } from './culling.ts';
import { boxSelectFeature } from './boxSelect.tsx';
import { connectFeature } from './connect.tsx';
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
  boxSelectFeature,
  colorModeFeature,
  connectFeature,
  cullingFeature,
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
