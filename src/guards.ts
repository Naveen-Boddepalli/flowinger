import type { Edge, Node } from './types.ts';

/** Whether a thing from a list of nodes and edges is a node. */
export const isNode = <N extends Node = Node>(element: unknown): element is N =>
  typeof element === 'object' &&
  element !== null &&
  'id' in element &&
  'position' in element &&
  !('source' in element) &&
  !('target' in element);

/** Whether it is an edge. */
export const isEdge = <E extends Edge = Edge>(element: unknown): element is E =>
  typeof element === 'object' && element !== null && 'id' in element && 'source' in element && 'target' in element;
