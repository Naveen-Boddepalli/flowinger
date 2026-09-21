import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { EdgeLabelHost } from './EdgeLabelRenderer.tsx';
import { useFlowingerStore } from './context.ts';
import type { Edge, HandleType, XYPosition } from './types.ts';

const RADIUS = 8;

interface ReconnectAnchorsProps {
  edge: Edge;
  source: XYPosition;
  target: XYPosition;
  /** Which ends may be dragged. */
  ends: { source: boolean; target: boolean };
}

/**
 * The two handles on a selected edge's ends. Drawn in the layer above the nodes
 * (as HTML, in graph space), where a node cannot cover them, and nowhere on the
 * server, where that layer does not exist.
 */
export function ReconnectAnchors({ edge, source, target, ends }: ReconnectAnchorsProps) {
  const store = useFlowingerStore();
  const host = useContext(EdgeLabelHost);
  if (!host) return null;
  const anchor = (end: HandleType, at: XYPosition) => (
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
        store.startReconnect(edge, end, e.nativeEvent);
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
