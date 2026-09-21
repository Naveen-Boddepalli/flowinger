import type { Feature } from '../features.ts';
import { cullingFeature } from './culling.ts';
import { deleteFeature } from './delete.ts';
import { editingFeature } from './editing.ts';

export { cullingFeature, deleteFeature, editingFeature };

/** Every feature: what `<FlowingerCanvas>` (and `ReactFlow`) has. */
export const allFeatures: readonly Feature[] = [cullingFeature, deleteFeature, editingFeature];
