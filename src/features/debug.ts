import { useEffect } from 'react';
import type { Feature } from '../features.ts';
import type { EdgeChange, NodeChange } from '../types.ts';

/**
 * `debug`: every change a controlled flow is told of is logged to the console — `flowinger: node changes`
 * and `flowinger: edge changes` — before it is handed to `onNodesChange` / `onEdgesChange`.
 */
export const debugFeature: Feature = {
  name: 'debug',
  useCanvas({ store, props }) {
    const on = props.debug === true;
    useEffect(() => {
      if (!on) return;
      const nodes = Symbol('debug');
      const edges = Symbol('debug');
      store.onNodesChangeMiddlewareMap.set(nodes, (changes: NodeChange[]) => {
        console.log('flowinger: node changes', changes);
        return changes;
      });
      store.onEdgesChangeMiddlewareMap.set(edges, (changes: EdgeChange[]) => {
        console.log('flowinger: edge changes', changes);
        return changes;
      });
      return () => {
        store.onNodesChangeMiddlewareMap.delete(nodes);
        store.onEdgesChangeMiddlewareMap.delete(edges);
      };
    }, [store, on]);
    return undefined;
  },
};
