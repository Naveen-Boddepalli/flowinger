import { memo, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { useFlowinger } from './context.ts';
import { warnAcceptedProps } from './devWarnings.ts';
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
   * @unimplemented Accepted so code written for React Flow compiles; there is no lock button. Whether nodes
   * move, connect or select is the canvas's `nodesDraggable`, `nodesConnectable` and `elementsSelectable`.
   */
  showInteractive?: boolean;
  /** @unimplemented Never called: there is no lock button. */
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
  background: 'var(--flowinger-surface-raised, #0f172a)',
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
  if (process.env.NODE_ENV !== 'production') {
    warnAcceptedProps('Controls', { showInteractive, onInteractiveChange });
  }

  const controls = (
    <div
      data-testid="rf__controls"
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
            aria-label="Zoom out"
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
            aria-label="Zoom in"
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
          aria-label="Fit view"
          style={fitStyle}
        >
          Fit
        </button>
      )}
      {children}
    </div>
  );
  return position ? <Panel position={position}>{controls}</Panel> : controls;
});
