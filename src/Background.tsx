import { useId, type CSSProperties, memo } from 'react';
import { BackgroundVariant, type BackgroundProps } from './types.ts';
import { useViewport } from './context.ts';

export const Background = memo(function Background({
  variant = BackgroundVariant.Dots,
  gap = 20,
  size = 1,
  color = '#94a3b8',
  className = '',
  style = {},
}: BackgroundProps) {
  const patternId = useId();
  const viewport = useViewport();

  const patternTransform = `translate(${String(viewport.x)}, ${String(viewport.y)}) scale(${String(viewport.zoom)})`;

  const svgStyle: CSSProperties = {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    zIndex: 0,
    ...style,
  };

  return (
    <svg
      className={`flowinger-background react-flow__background ${className}`}
      style={svgStyle}
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width={gap}
          height={gap}
          patternUnits="userSpaceOnUse"
          patternTransform={patternTransform}
        >
          {variant === BackgroundVariant.Dots && (
            <circle cx={gap / 2} cy={gap / 2} r={size} fill={color} />
          )}
          {variant === BackgroundVariant.Lines && (
            <path
              d={`M ${gap} 0 L 0 0 0 ${gap}`}
              fill="none"
              stroke={color}
              strokeWidth={size}
            />
          )}
          {variant === BackgroundVariant.Cross && (
            <path
              d={`M ${gap / 2 - 4} ${gap / 2} L ${gap / 2 + 4} ${gap / 2} M ${gap / 2} ${gap / 2 - 4} L ${gap / 2} ${gap / 2 + 4}`}
              stroke={color}
              strokeWidth={size}
            />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
});
