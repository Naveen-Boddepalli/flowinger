'use client';

import { Handle, Position, type NodeProps } from 'flowinger';

/** One step of the pipeline. A node type is a component, so it lives in a client module like any other. */
export function StepNode({ data, selected }: NodeProps) {
  return (
    <div className={`step${selected ? ' step-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      {String(data.label)}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// Outside any component, so it keeps its identity between renders.
export const nodeTypes = { step: StepNode };
