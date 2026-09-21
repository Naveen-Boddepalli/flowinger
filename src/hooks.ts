import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { applyEdgeChanges, applyNodeChanges } from './changes.ts';
import type { Edge, EdgeChange, Node, NodeChange } from './types.ts';

/**
 * State for a controlled flow: the nodes, their setter, and the `onNodesChange`
 * that keeps them up to date. Pass the first and the third to the canvas.
 */
export function useNodesState<N extends Node = Node>(
  initial: N[] | (() => N[]),
): [N[], Dispatch<SetStateAction<N[]>>, (changes: NodeChange<N>[]) => void] {
  const [nodes, setNodes] = useState(initial);
  const onNodesChange = useCallback((changes: NodeChange<N>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);
  return [nodes, setNodes, onNodesChange];
}

/** The edge counterpart of `useNodesState`. */
export function useEdgesState<E extends Edge = Edge>(
  initial: E[] | (() => E[]),
): [E[], Dispatch<SetStateAction<E[]>>, (changes: EdgeChange<E>[]) => void] {
  const [edges, setEdges] = useState(initial);
  const onEdgesChange = useCallback((changes: EdgeChange<E>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);
  return [edges, setEdges, onEdgesChange];
}
