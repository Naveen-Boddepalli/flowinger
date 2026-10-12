import { memo, useRef, useState, type CSSProperties, type ReactNode, type SVGAttributes } from 'react';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';

export interface EdgeTextProps extends SVGAttributes<SVGElement> {
  x: number;
  y: number;
  label?: ReactNode;
  labelStyle?: CSSProperties;
  labelShowBg?: boolean;
  labelBgStyle?: CSSProperties;
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
  children?: ReactNode;
  className?: string;
}

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_PADDING: [number, number] = [2, 4];

function EdgeTextComponent({
  x,
  y,
  label,
  labelStyle,
  labelShowBg = true,
  labelBgStyle,
  labelBgPadding = DEFAULT_PADDING,
  labelBgBorderRadius = 2,
  children,
  className,
  ...rest
}: EdgeTextProps) {
  const [edgeTextBbox, setEdgeTextBbox] = useState<BBox>({ x: 0, y: 0, width: 0, height: 0 });
  const edgeTextRef = useRef<SVGTextElement>(null);

  useIsomorphicLayoutEffect(() => {
    if (edgeTextRef.current && typeof edgeTextRef.current.getBBox === 'function') {
      const textBbox = edgeTextRef.current.getBBox();
      setEdgeTextBbox({
        x: textBbox.x,
        y: textBbox.y,
        width: textBbox.width,
        height: textBbox.height,
      });
    }
  }, [label]);

  if (!label) {
    return null;
  }

  const classes = ['react-flow__edge-textwrapper', className].filter(Boolean).join(' ');

  return (
    <g
      transform={`translate(${x - edgeTextBbox.width / 2} ${y - edgeTextBbox.height / 2})`}
      className={classes}
      visibility={edgeTextBbox.width ? 'visible' : 'hidden'}
      {...rest}
    >
      {labelShowBg && (
        <rect
          width={edgeTextBbox.width + 2 * labelBgPadding[0]}
          height={edgeTextBbox.height + 2 * labelBgPadding[1]}
          x={-labelBgPadding[0]}
          y={-labelBgPadding[1]}
          className="react-flow__edge-textbg"
          style={labelBgStyle}
          rx={labelBgBorderRadius}
          ry={labelBgBorderRadius}
        />
      )}
      <text className="react-flow__edge-text" y={edgeTextBbox.height / 2} dy="0.3em" ref={edgeTextRef} style={labelStyle}>
        {label}
      </text>
      {children}
    </g>
  );
}

EdgeTextComponent.displayName = 'EdgeText';

export const EdgeText = /*#__PURE__*/ memo(EdgeTextComponent);
