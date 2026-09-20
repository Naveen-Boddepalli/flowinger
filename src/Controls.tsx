import { memo, type CSSProperties } from 'react';
import { useFlowinger } from './context.ts';

export interface ControlsProps {
  className?: string;
  style?: CSSProperties;
  showZoom?: boolean;
  showFit?: boolean;
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

export const Controls = memo(function Controls({
  className = '',
  style,
  showZoom = true,
  showFit = true,
}: ControlsProps) {
  const { zoomIn, zoomOut, fitView } = useFlowinger();

  return (
    <div
      className={`flowinger-controls react-flow__controls ${className}`.trim()}
      style={{ ...containerStyle, ...style }}
    >
      {showZoom && (
        <>
          <button
            type="button"
            onClick={() => { zoomOut({ duration: 200 }); }}
            aria-label="Zoom out"
            style={buttonStyle}
          >
            <span aria-hidden>−</span>
          </button>
          <button
            type="button"
            onClick={() => { zoomIn({ duration: 200 }); }}
            aria-label="Zoom in"
            style={buttonStyle}
          >
            <span aria-hidden>+</span>
          </button>
        </>
      )}
      {showFit && (
        <button
          type="button"
          onClick={() => { fitView({ duration: 300 }); }}
          aria-label="Fit view"
          style={fitStyle}
        >
          Fit
        </button>
      )}
    </div>
  );
});
