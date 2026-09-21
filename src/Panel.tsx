import type { CSSProperties, ReactNode } from 'react';

export type PanelPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'center-left'
  | 'center-right';

const PLACEMENT: Record<PanelPosition, CSSProperties> = {
  'top-left': { top: 0, left: 0 },
  'top-center': { top: 0, left: '50%', transform: 'translateX(-50%)' },
  'top-right': { top: 0, right: 0 },
  'bottom-left': { bottom: 0, left: 0 },
  'bottom-center': { bottom: 0, left: '50%', transform: 'translateX(-50%)' },
  'bottom-right': { bottom: 0, right: 0 },
  'center-left': { top: '50%', left: 0, transform: 'translateY(-50%)' },
  'center-right': { top: '50%', right: 0, transform: 'translateY(-50%)' },
};

export interface PanelProps {
  /** Where on the canvas it sits. Default `top-left`. */
  position?: PanelPosition;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * A box of your own UI pinned to the canvas — a legend, a toolbar — that stays
 * put while the diagram pans and zooms. Goes inside the canvas (or its
 * provider-wrapped children). A press on it does not pan the canvas, and a click
 * on it is not a click on the pane.
 */
export function Panel({ position = 'top-left', className = '', style, children }: PanelProps) {
  return (
    <div
      className={`flowinger-panel react-flow__panel nopan ${position} ${className}`.trim()}
      style={{ position: 'absolute', zIndex: 5, margin: 15, ...PLACEMENT[position], ...style }}
    >
      {children}
    </div>
  );
}
