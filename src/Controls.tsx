import { memo, useContext, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { ViewDefaultsContext, useFlowinger, useFlowingerStore } from './context.ts';
import { Panel, type PanelPosition } from './Panel.tsx';
import type { FitViewOptions } from './types.ts';

export interface ControlsProps {
  className?: string;
  style?: CSSProperties;
  showZoom?: boolean;
  /** The fit button. `showFitView` is the same, under React Flow's name; either can turn it off. */
  showFit?: boolean;
  showFitView?: boolean;
  /**
   * A lock button that switches interaction off and on — nodes dragged, connected and selected — over what the
   * canvas's `nodesDraggable`, `nodesConnectable` and `elementsSelectable` say. Pressed while all three are
   * off it switches them on, as in React Flow. Left out, it is shown inside `<ReactFlow>` (React Flow's default) and
   * not inside `<FlowingerCanvas>` or `<FlowingerCore>`.
   */
  showInteractive?: boolean;
  /** After the lock was pressed: `true` when the canvas is now interactive. */
  onInteractiveChange?: (interactive: boolean) => void;
  /** Shapes what the fit button does (`padding`, `duration`, …). It takes 300 ms unless this says otherwise. */
  fitViewOptions?: FitViewOptions;
  /** After the button has zoomed or fitted the view. */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  /** Pins the controls to the canvas, as `Panel` does; without it they sit where you put them. */
  position?: PanelPosition;
  /** Your own buttons — `ControlButton`s — after the built-in ones. */
  children?: ReactNode;
}

// Inline styles, so the controls look right with no stylesheet and no utility
// framework. Every colour reads a `--flowinger-*` custom property with a
// fallback: set them on any ancestor to theme the controls (and the default
// node view), e.g. `--flowinger-surface`, `--flowinger-border`, `--flowinger-text`.
// No `outline` rule, on purpose — the browser's focus ring is the one a
// keyboard user already knows.
const containerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: 4,
  borderRadius: 'var(--flowinger-radius, 8px)',
  border: '1px solid var(--flowinger-border, #334155)',
  background: 'var(--flowinger-surface, #1e293b)',
};

// 24px is the WCAG 2.2 minimum target size (SC 2.5.8).
const buttonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 24,
  height: 24,
  padding: 0,
  borderRadius: 6,
  border: '1px solid var(--flowinger-border, #334155)',
  background: 'var(--flowinger-surface-raised, var(--flowinger-surface, #0f172a))',
  color: 'var(--flowinger-text, #e2e8f0)',
  font: 'inherit',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
};

const fitStyle: CSSProperties = { ...buttonStyle, padding: '0 8px', fontSize: 12 };

/** A button of your own among the `Controls`, drawn like theirs: `<ControlButton onClick={…} aria-label="…">`. */
export function ControlButton({ className = '', style, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      className={`flowinger-controls-button react-flow__controls-button ${className}`.trim()}
      style={{ ...buttonStyle, ...style }}
    />
  );
}

export const Controls = /*#__PURE__*/ memo(function Controls({
  className = '',
  style,
  showZoom = true,
  showFit = true,
  showFitView = showFit,
  showInteractive,
  onInteractiveChange,
  fitViewOptions,
  onZoomIn,
  onZoomOut,
  onFitView,
  position,
  children,
}: ControlsProps) {
  const { zoomIn, zoomOut, fitView } = useFlowinger();
  const store = useFlowingerStore();
  // Left out, the lock follows the canvas: shown under `<ReactFlow>` (React Flow's default), not otherwise.
  const viewDefaults = useContext(ViewDefaultsContext) ?? store.getViewDefaults();
  const showLock = showInteractive ?? viewDefaults.showInteractive ?? false;
  const labels = store.labels;
  // Whether anything can be done to the nodes right now: the canvas's props, or the lock over them.
  const interactive = useSyncExternalStore(
    store.subscribeInteractive,
    () => {
      const o = store.getOptions();
      return store.getInteractive() ?? (o.nodesDraggable || o.nodesConnectable || o.elementsSelectable);
    },
    () => false,
  );

  const controls = (
    <div
      data-testid="rf__controls"
      aria-label={labels['controls.ariaLabel']}
      className={`flowinger-controls react-flow__controls ${className}`.trim()}
      style={{ ...containerStyle, ...style }}
    >
      {showZoom && (
        <>
          <button
            type="button"
            onClick={() => {
              void zoomOut({ duration: 200 });
              onZoomOut?.();
            }}
            aria-label={labels['controls.zoomOut.ariaLabel'] ?? 'Zoom out'}
            style={buttonStyle}
          >
            <span aria-hidden>−</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void zoomIn({ duration: 200 });
              onZoomIn?.();
            }}
            aria-label={labels['controls.zoomIn.ariaLabel'] ?? 'Zoom in'}
            style={buttonStyle}
          >
            <span aria-hidden>+</span>
          </button>
        </>
      )}
      {showFitView && (
        <button
          type="button"
          onClick={() => {
            void fitView({ duration: 300, ...fitViewOptions });
            onFitView?.();
          }}
          aria-label={labels['controls.fitView.ariaLabel'] ?? 'Fit view'}
          style={fitStyle}
        >
          Fit
        </button>
      )}
      {showLock && (
        <button
          type="button"
          onClick={() => {
            store.setInteractive(!interactive);
            onInteractiveChange?.(!interactive);
          }}
          aria-label={labels['controls.interactive.ariaLabel'] ?? 'Toggle interactivity'}
          aria-pressed={!interactive}
          style={buttonStyle}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="2" y="5.5" width="8" height="5.5" rx="1" />
            {/* Shut when locked, lifted when not. */}
            <path d={interactive ? 'M4 5.5V3.5a2 2 0 0 1 3.8-0.9' : 'M4 5.5V3.5a2 2 0 0 1 4 0v2'} />
          </svg>
        </button>
      )}
      {children}
    </div>
  );
  return position ? <Panel position={position}>{controls}</Panel> : controls;
});
