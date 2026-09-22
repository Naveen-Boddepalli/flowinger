import { useId, type CSSProperties, memo } from 'react';
import { BackgroundVariant, type BackgroundProps } from './types.ts';
import { useViewport } from './context.ts';

/** React Flow's defaults, so a migrated `<Background>` draws the same pattern. */
const DEFAULT_SIZE: Record<BackgroundVariant, number> = {
  [BackgroundVariant.Dots]: 1,
  [BackgroundVariant.Lines]: 1,
  [BackgroundVariant.Cross]: 6,
};

export const Background = /*#__PURE__*/ memo(function Background({
  variant = BackgroundVariant.Dots,
  gap = 20,
  size = DEFAULT_SIZE[variant],
  lineWidth = 1,
  color = '#94a3b8',
  bgColor,
  patternClassName,
  className = '',
  style = {},
}: BackgroundProps) {
  // `useId`'s format varies by React version (`:r1:`, `«r1»`, `_r_1_`); keep only
  // characters that are always safe inside `url(#…)`.
  const patternId = useId().replace(/[^A-Za-z0-9_-]/g, '');
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
    ...(bgColor === undefined ? {} : { backgroundColor: bgColor }),
    ...style,
  };

  const mid = gap / 2;
  const arm = size / 2;

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
            <circle className={patternClassName} cx={mid} cy={mid} r={size / 2} fill={color} />
          )}
          {variant === BackgroundVariant.Lines && (
            <path
              className={patternClassName}
              d={`M ${String(gap)} 0 L 0 0 0 ${String(gap)}`}
              fill="none"
              stroke={color}
              strokeWidth={lineWidth}
            />
          )}
          {variant === BackgroundVariant.Cross && (
            <path
              className={patternClassName}
              d={`M ${String(mid - arm)} ${String(mid)} H ${String(mid + arm)} M ${String(mid)} ${String(mid - arm)} V ${String(mid + arm)}`}
              fill="none"
              stroke={color}
              strokeWidth={lineWidth}
            />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
});
