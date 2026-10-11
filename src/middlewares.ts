import { useEffect, useState } from 'react';
import { useFlowingerStore } from './context.ts';
import type { Edge, EdgeChange, Node, NodeChange } from './types.ts';

/**
 * Registers a middleware function to transform node changes.
 *
 * @param fn - Middleware function. Should be memoized with useCallback to avoid re-registration.
 */
export function experimental_useOnNodesChangeMiddleware<NodeType extends Node = Node>(
  fn: (changes: NodeChange<NodeType>[]) => NodeChange<NodeType>[],
): void {
  const store = useFlowingerStore();
  const [symbol] = useState(() => Symbol());

  useEffect(() => {
    store.onNodesChangeMiddlewareMap.set(symbol, fn as (changes: NodeChange[]) => NodeChange[]);
  }, [store, fn, symbol]);

  useEffect(() => {
    return () => {
      store.onNodesChangeMiddlewareMap.delete(symbol);
    };
  }, [store, symbol]);
}

/**
 * Registers a middleware function to transform edge changes.
 *
 * @param fn - Middleware function. Should be memoized with useCallback to avoid re-registration.
 */
export function experimental_useOnEdgesChangeMiddleware<EdgeType extends Edge = Edge>(
  fn: (changes: EdgeChange<EdgeType>[]) => EdgeChange<EdgeType>[],
): void {
  const store = useFlowingerStore();
  const [symbol] = useState(() => Symbol());

  useEffect(() => {
    store.onEdgesChangeMiddlewareMap.set(symbol, fn as (changes: EdgeChange[]) => EdgeChange[]);
  }, [store, fn, symbol]);

  useEffect(() => {
    return () => {
      store.onEdgesChangeMiddlewareMap.delete(symbol);
    };
  }, [store, symbol]);
}
