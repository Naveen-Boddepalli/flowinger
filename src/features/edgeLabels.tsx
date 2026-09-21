import { useState } from 'react';
import type { Feature, LabelBoxProps } from '../features.ts';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.ts';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box behind an edge's label, sized to what the browser laid out. */
function LabelBox({ children, textRef, label, x, y, labelStyle, padding, borderRadius, style }: LabelBoxProps) {
  const [box, setBox] = useState<Box | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = textRef.current;
    // jsdom has no `getBBox`, and the server has no layout: no box there, the text still shows.
    if (!el || typeof el.getBBox !== 'function') return;
    const { x: bx, y: by, width, height } = el.getBBox();
    setBox((was) =>
      was && was.x === bx && was.y === by && was.width === width && was.height === height
        ? was
        : { x: bx, y: by, width, height },
    );
  }, [textRef, label, x, y, labelStyle]);
  return (
    <>
      {box && (
        <rect
          className="flowinger-edge-label-bg react-flow__edge-textbg"
          x={box.x - padding[0]}
          y={box.y - padding[1]}
          width={box.width + 2 * padding[0]}
          height={box.height + 2 * padding[1]}
          rx={borderRadius}
          ry={borderRadius}
          style={{ fill: 'var(--flowinger-surface, #1e293b)', ...style }}
        />
      )}
      {children}
    </>
  );
}

/**
 * The box behind an edge's label (`labelShowBg`, with `labelBgStyle`, `labelBgPadding` and
 * `labelBgBorderRadius`), which replaces the halo that keeps a label readable. The box is as big as the text
 * the browser laid out, so it needs a browser: where nothing can measure the text, the text shows without one.
 * The rest of an edge's label — `label`, `labelStyle` — is not this feature's; it works on any canvas.
 */
export const edgeLabelsFeature: Feature<undefined> = {
  name: 'edgeLabels',
  install() {
    return undefined;
  },
  useEdge() {
    return { LabelBox };
  },
};
