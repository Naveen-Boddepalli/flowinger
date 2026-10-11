import { useSyncExternalStore, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { EdgeLabelRenderer } from './EdgeLabelRenderer.tsx';
import { useFlowingerStore, useViewport } from './context.ts';
export type AlignX = 'left' | 'center' | 'right';
export type AlignY = 'top' | 'center' | 'bottom';

export interface EdgeToolbarProps extends HTMLAttributes<HTMLDivElement> {
  edgeId: string;
  x?: number;
  y?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  isVisible?: boolean;
  alignX?: AlignX;
  alignY?: AlignY;
}

const alignXToPercent: Record<AlignX, number> = {
  left: 0,
  center: 50,
  right: 100,
};

const alignYToPercent: Record<AlignY, number> = {
  top: 0,
  center: 50,
  bottom: 100,
};

export function getEdgeToolbarTransform(
  x: number,
  y: number,
  zoom: number,
  alignX: AlignX = 'center',
  alignY: AlignY = 'center',
): string {
  const shiftX = -(alignXToPercent[alignX] ?? 50);
  const shiftY = -(alignYToPercent[alignY] ?? 50);
  return `translate(${x}px, ${y}px) scale(${1 / zoom}) translate(${shiftX}%, ${shiftY}%)`;
}

export function EdgeToolbar({
  edgeId,
  x = 0,
  y = 0,
  children,
  className = '',
  style,
  isVisible,
  alignX = 'center',
  alignY = 'center',
  ...rest
}: EdgeToolbarProps) {
  const store = useFlowingerStore();
  const selected = useSyncExternalStore(
    store.subscribeSelection,
    () => store.isEdgeSelected(edgeId),
    () => false,
  );

  const isActive = typeof isVisible === 'boolean' ? isVisible : selected;
  const viewport = useViewport();

  if (!isActive) {
    return null;
  }

  const edge = store.instance.getEdge(edgeId);
  const zIndex = (edge?.zIndex ?? 0) + 1;
  const transform = getEdgeToolbarTransform(x, y, viewport.zoom, alignX, alignY);

  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform,
          zIndex,
          pointerEvents: 'all',
          transformOrigin: '0 0',
          ...style,
        }}
        className={`react-flow__edge-toolbar ${className}`.trim()}
        data-id={edgeId}
        {...rest}
      >
        {children}
      </div>
    </EdgeLabelRenderer>
  );
}
