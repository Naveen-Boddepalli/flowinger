import type { Edge, Node, ReactFlowJsonObject, Viewport } from 'flowinger';

/** What this app writes: `instance.toObject()` with a version, so a later format can read an older file. */
export type FlowFile = ReactFlowJsonObject & { version: 1 };

export function toFlowFile(flow: ReactFlowJsonObject): FlowFile {
  return {
    version: 1,
    // Selection is a moment, not part of the graph: a restored file starts with nothing selected.
    nodes: flow.nodes.map(({ selected: _selected, dragging: _dragging, ...node }) => node),
    edges: flow.edges.map(({ selected: _selected, ...edge }) => edge),
    viewport: flow.viewport,
  };
}

export function stringifyFlow(flow: FlowFile): string {
  return JSON.stringify(flow, null, 2);
}

/**
 * Reads a file somebody else may have written — pasted, opened, or left in storage by an older version —
 * and says what is wrong with it rather than handing the canvas something it cannot draw. It checks the
 * fields the canvas needs (ids, positions, the ends of each edge) and keeps everything else as it is.
 */
export function parseFlow(text: string): { flow: FlowFile } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { error: `Not JSON: ${(error as Error).message}` };
  }
  if (!isObject(value)) return { error: 'Expected an object with "nodes" and "edges".' };
  if (value.version !== undefined && value.version !== 1) return { error: `Unknown version ${String(value.version)}.` };
  if (!Array.isArray(value.nodes)) return { error: '"nodes" must be a list.' };
  if (!Array.isArray(value.edges)) return { error: '"edges" must be a list.' };

  const ids = new Set<string>();
  for (const [i, node] of value.nodes.entries()) {
    if (!isObject(node) || typeof node.id !== 'string') return { error: `Node ${i}: needs a string "id".` };
    if (ids.has(node.id)) return { error: `Node "${node.id}" appears twice.` };
    ids.add(node.id);
    if (!isObject(node.position) || !isNumber(node.position.x) || !isNumber(node.position.y)) {
      return { error: `Node "${node.id}": needs "position": { "x": number, "y": number }.` };
    }
    if (node.data !== undefined && !isObject(node.data)) return { error: `Node "${node.id}": "data" must be an object.` };
  }
  for (const [i, edge] of value.edges.entries()) {
    if (!isObject(edge) || typeof edge.id !== 'string') return { error: `Edge ${i}: needs a string "id".` };
    for (const end of ['source', 'target'] as const) {
      if (typeof edge[end] !== 'string') return { error: `Edge "${edge.id}": needs a string "${end}".` };
      if (!ids.has(edge[end])) return { error: `Edge "${edge.id}": ${end} "${edge[end]}" is not a node.` };
    }
  }

  const viewport = isObject(value.viewport) && isNumber(value.viewport.x) && isNumber(value.viewport.y) && isNumber(value.viewport.zoom) && value.viewport.zoom > 0
    ? (value.viewport as unknown as Viewport)
    : { x: 0, y: 0, zoom: 1 };
  const nodes = (value.nodes as Node[]).map((node) => ({ ...node, data: node.data ?? {} }));
  return { flow: { version: 1, nodes, edges: value.edges as Edge[], viewport } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
