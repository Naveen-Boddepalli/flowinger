import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useFlowingerStore, useNodeId } from './context.ts';
import { boxAround } from './geometry.ts';
import { Position } from './types.ts';
import { ViewportPortal } from './ViewportPortal.tsx';
import type { PassThroughHtml } from './attributes.ts';

export interface NodeToolbarProps extends PassThroughHtml {
  /**
   * The node (or the nodes) the toolbar is for, where that is not the one it is drawn in. Naming the node it
   * is in is the same as leaving it out; naming others draws it in graph space, at the box round them, and it
   * follows them as they move. Shown by default while a single node it names is the only thing selected.
   */
  nodeId?: string | string[];
  /** Which side of the node it sits on. Default top. */
  position?: Position;
  /** Along that side: `center` (default), `start` or `end`. */
  align?: 'center' | 'start' | 'end';
  /** The gap between node and toolbar, in graph units. Default 10. */
  offset?: number;
  /**
   * Whether to show it. By default it shows while its node is selected and is the
   * only thing selected — so a toolbar does not pile up over a group.
   */
  isVisible?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

function placement(position: Position, align: 'center' | 'start' | 'end', offset: number): CSSProperties {
  const across = position === Position.Top || position === Position.Bottom;
  const style: CSSProperties = { position: 'absolute' };
  switch (position) {
    case Position.Top:
      style.bottom = `calc(100% + ${String(offset)}px)`;
      break;
    case Position.Bottom:
      style.top = `calc(100% + ${String(offset)}px)`;
      break;
    case Position.Left:
      style.right = `calc(100% + ${String(offset)}px)`;
      break;
    case Position.Right:
      style.left = `calc(100% + ${String(offset)}px)`;
      break;
  }
  const along = across ? 'left' : 'top';
  const far = across ? 'right' : 'bottom';
  if (align === 'start') style[along] = 0;
  else if (align === 'end') style[far] = 0;
  else {
    style[along] = '50%';
    style.transform = across ? 'translateX(-50%)' : 'translateY(-50%)';
  }
  return style;
}

const noSubscription = () => () => {};

/**
 * A toolbar attached to a node — buttons for what can be done to it. Drawn inside the node it is rendered in,
 * it rides on it (absolutely positioned within it), so it follows drags and zoom for free and never changes
 * the node's measured size. Given a `nodeId` of another node, or several, it is drawn at them in graph space
 * instead. A press on it does not drag the node or pan the canvas.
 */
export function NodeToolbar({
  nodeId,
  position = Position.Top,
  align = 'center',
  offset = 10,
  isVisible,
  className = '',
  style,
  children,
  ...rest
}: NodeToolbarProps) {
  const store = useFlowingerStore();
  const own = useNodeId();
  const named = nodeId === undefined ? undefined : typeof nodeId === 'string' ? [nodeId] : nodeId;
  // For its own node it rides on it; for others it is placed at them.
  const foreign = named !== undefined && !(named.length === 1 && named[0] === own);
  const ids = foreign ? named : own === null ? [] : [own];

  const alone = useSyncExternalStore(
    store.subscribeSelection,
    () => ids.length === 1 && store.isSelected(ids[0] as string) && store.getSelectedNodeCount() === 1,
    () => false,
  );
  // Where the nodes are is read as they move — only for a toolbar that is drawn at others.
  useSyncExternalStore(
    foreign ? store.subscribeGeometry : noSubscription,
    foreign ? store.getGeometryVersion : () => 0,
    () => 0,
  );
  if (!(isVisible ?? alone)) return null;

  const bar = (
    <div
      {...rest}
      className={`flowinger-node-toolbar react-flow__node-toolbar nodrag nopan ${className}`.trim()}
      style={{ ...placement(position, align, offset), zIndex: 10, cursor: 'default', ...(foreign ? { pointerEvents: 'all' as const } : {}), ...style }}
    >
      {children}
    </div>
  );
  if (!foreign) return bar;

  const box = boxAround(ids.map((id) => store.getAbsoluteRect(id)));
  if (!box) return null;
  return (
    <ViewportPortal>
      <div
        className="flowinger-node-toolbar-holder"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: box.width,
          height: box.height,
          transform: `translate(${String(box.x)}px, ${String(box.y)}px)`,
          pointerEvents: 'none',
        }}
      >
        {bar}
      </div>
    </ViewportPortal>
  );
}
