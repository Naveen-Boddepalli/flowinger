import { memo } from 'react';
import { useFlowinger } from './context.ts';

export interface ControlsProps {
  className?: string;
  showZoom?: boolean;
  showFit?: boolean;
}

export const Controls = memo(function Controls({
  className = '',
  showZoom = true,
  showFit = true,
}: ControlsProps) {
  const { zoomIn, zoomOut, fitView } = useFlowinger();

  const buttonClass =
    'flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-sm leading-none text-slate-200 shadow hover:border-slate-500 hover:text-white transition';

  return (
    <div
      className={`flowinger-controls react-flow__controls flex items-center gap-1 p-1 bg-slate-900/80 rounded-lg backdrop-blur-sm border border-slate-800 shadow-md ${className}`}
    >
      {showZoom && (
        <>
          <button
            type="button"
            onClick={() => { zoomOut({ duration: 200 }); }}
            aria-label="Zoom out"
            className={buttonClass}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => { zoomIn({ duration: 200 }); }}
            aria-label="Zoom in"
            className={buttonClass}
          >
            +
          </button>
        </>
      )}
      {showFit && (
        <button
          type="button"
          onClick={() => { fitView({ duration: 300 }); }}
          aria-label="Fit view"
          className={`${buttonClass} w-auto px-2 text-xs`}
        >
          Fit
        </button>
      )}
    </div>
  );
});
