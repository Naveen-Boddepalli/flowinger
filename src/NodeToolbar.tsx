import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useFlowingerStore, useNodeId } from './context.ts';
import { warnAcceptedProps } from './devWarnings.ts';
import { Position } from './types.ts';
import type { PassThroughHtml } from './attributes.ts';

export interface NodeToolbarProps extends PassThroughHtml {
  /**
   * @unimplemented Accepted so code written for React Flow compiles. The toolbar rides on the node it is
   * rendered inside, so only that node — which is what it is when this is left out, or names it — is
   * supported; another node, or several, is not.
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

/**
 * A toolbar attached to the node it is rendered inside — buttons for what can
 * be done to it. It rides on the node (absolutely positioned within it), so it
 * follows drags and zoom for free and never changes the node's measured size.
 * A press on it does not drag the node or pan the canvas.
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
  const id = useNodeId();
  if (process.env.NODE_ENV !== 'production') {
    const here = Array.isArray(nodeId) ? nodeId.length === 1 && nodeId[0] === id : nodeId === id;
    warnAcceptedProps('NodeToolbar', { nodeId: nodeId !== undefined && !here });
  }
  const alone = useSyncExternalStore(
    store.subscribeSelection,
    () => id !== null && store.isSelected(id) && store.getSelectedNodeCount() === 1,
    () => false,
  );
  if (!(isVisible ?? alone)) return null;
  return (
    <div
      {...rest}
      className={`flowinger-node-toolbar react-flow__node-toolbar nodrag nopan ${className}`.trim()}
      style={{ ...placement(position, align, offset), zIndex: 10, cursor: 'default', ...style }}
    >
      {children}
    </div>
  );
}
