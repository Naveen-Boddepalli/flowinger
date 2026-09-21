import type { Feature } from '../features.ts';
import { cullingFeature } from './culling.ts';
import { boxSelectFeature } from './boxSelect.tsx';
import { connectFeature } from './connect.tsx';
import { deleteFeature } from './delete.ts';
import { dragFeature } from './drag.ts';
import { editingFeature } from './editing.ts';
import { reconnectFeature } from './reconnect.tsx';
import { selectionFeature } from './selection.ts';

export {
  boxSelectFeature,
  connectFeature,
  cullingFeature,
  deleteFeature,
  dragFeature,
  editingFeature,
  reconnectFeature,
  selectionFeature,
};

/** Every feature: what `<FlowingerCanvas>` (and `ReactFlow`) has. */
export const allFeatures: readonly Feature[] = [
  selectionFeature,
  cullingFeature,
  deleteFeature,
  editingFeature,
  dragFeature,
  connectFeature,
  reconnectFeature,
  boxSelectFeature,
];
