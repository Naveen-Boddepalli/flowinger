import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { useFlowingerStore } from '../context.ts';
import { EdgeLabelHost } from '../EdgeLabelRenderer.tsx';
import type { EdgeAdornmentProps, Feature } from '../features.ts';
import type { Edge, HandleType } from '../types.ts';
import { connectFeature } from './connect.tsx';

const RADIUS = 8;

export interface ReconnectApi {
  /**
   * Begins dragging one end of an edge to another handle: the *other* end stays
   * where it is, and the drag is a connection from it — so it snaps, is vetoed and
   * cancelled just like one — which on release is reported as a reconnection.
   */
  startReconnect: (edge: Edge, end: HandleType, at: PointerEvent) => void;
}

/**
 * The two handles on a selected edge's ends. Drawn in the layer above the nodes
 * (as HTML, in graph space), where a node cannot cover them, and nowhere on the
 * server, where that layer does not exist.
 */
function ReconnectAdornment({ edge, selected, selectable, reconnectable, source, target }: EdgeAdornmentProps) {
  const store = useFlowingerStore();
  const host = useContext(EdgeLabelHost);
  const canReconnect = reconnectable && selectable && selected;
  const ends = {
    source: canReconnect && edge.reconnectable !== false && edge.reconnectable !== 'target',
    target: canReconnect && edge.reconnectable !== false && edge.reconnectable !== 'source',
  };
  if (!host || (!ends.source && !ends.target)) return null;
  const anchor = (end: HandleType, at: { x: number; y: number }) => (
    <div
      key={end}
      className={`flowinger-reconnect-anchor react-flow__edgeupdater react-flow__edgeupdater-${end} nodrag nopan`}
      data-edge={edge.id}
      data-end={end}
      style={{
        position: 'absolute',
        left: at.x - RADIUS,
        top: at.y - RADIUS,
        width: RADIUS * 2,
        height: RADIUS * 2,
        boxSizing: 'border-box',
        borderRadius: '50%',
        border: '2px solid var(--flowinger-selected, #38bdf8)',
        background: 'var(--flowinger-surface, #1e293b)',
        cursor: 'grab',
        pointerEvents: 'all',
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Neither the canvas (a pan) nor the edge (a click that would reselect it) takes this press.
        e.stopPropagation();
        e.preventDefault();
        store.api(reconnectFeature).startReconnect(edge, end, e.nativeEvent);
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    />
  );
  return createPortal(
    <>
      {ends.source && anchor('source', source)}
      {ends.target && anchor('target', target)}
    </>,
    host,
  );
}

/**
 * Reconnecting: drag an end of a selected edge to another handle (`onReconnect`, `onReconnectStart`,
 * `onReconnectEnd`, `edgesReconnectable`, and an edge's own `reconnectable`). Nothing is edited for you —
 * swap the edge for the new connection with `reconnectEdge`.
 */
export const reconnectFeature: Feature<ReconnectApi> = {
  name: 'reconnect',
  needs: [connectFeature],
  install(ctx) {
    const { beginConnection } = ctx.api(connectFeature);
    const startReconnect: ReconnectApi['startReconnect'] = (edge, end, at) => {
      const fixed: HandleType = end === 'source' ? 'target' : 'source';
      const nodeId = end === 'source' ? edge.target : edge.source;
      const record = ctx.findHandle(nodeId, end === 'source' ? edge.targetHandle : edge.sourceHandle, fixed);
      if (record) beginConnection(nodeId, record, at, { edge, end });
    };
    return { startReconnect };
  },
  EdgeAdornment: ReconnectAdornment,
};
