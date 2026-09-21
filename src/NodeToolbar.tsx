import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useFlowingerStore, useNodeId } from './context.ts';
import { Position } from './types.ts';

export interface NodeToolbarProps {
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

/**
 * A toolbar attached to the node it is rendered inside — buttons for what can
 * be done to it. It rides on the node (absolutely positioned within it), so it
 * follows drags and zoom for free and never changes the node's measured size.
 * A press on it does not drag the node or pan the canvas.
 */
export function NodeToolbar({
  position = Position.Top,
  align = 'center',
  offset = 10,
  isVisible,
  className = '',
  style,
  children,
}: NodeToolbarProps) {
  const store = useFlowingerStore();
  const id = useNodeId();
  const alone = useSyncExternalStore(
    store.subscribeSelection,
    () => id !== null && store.isSelected(id) && store.getSelectedNodeCount() === 1,
    () => false,
  );
  if (!(isVisible ?? alone)) return null;
  return (
    <div
      className={`flowinger-node-toolbar react-flow__node-toolbar nodrag nopan ${className}`.trim()}
      style={{ ...placement(position, align, offset), zIndex: 10, cursor: 'default', ...style }}
    >
      {children}
    </div>
  );
}
