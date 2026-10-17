import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useState } from 'react';
import type {
  Box as RFBox,
  ControlButtonProps as RFControlButtonProps,
  CoordinateExtent as RFCoordinateExtent,
  Dimensions as RFDimensions,
  HandleConnection as RFHandleConnection,
  KeyCode as RFKeyCode,
  OnConnect as RFOnConnect,
  SnapGrid as RFSnapGrid,
  Transform as RFTransform,
  XYZPosition as RFXYZPosition,
} from '@xyflow/react';
import {
  EdgeLabelRenderer,
  FlowingerCanvas,
  FlowingerCore,
  addEdge,
  applyNodeChanges,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useOnSelectionChange,
  type BezierEdgeProps,
  type Box,
  type ConnectionLineComponent,
  type ConnectionLineComponentProps,
  type ConnectionLineProps,
  type ControlButtonProps,
  type ControlProps,
  type ControlsProps,
  type CoordinateExtent,
  type DefaultEdgeOptions,
  type DeleteElementsOptions,
  type Dimensions,
  type Edge,
  type EdgeChangeset,
  type NodeChangeset,
  type EdgeLabelRendererProps,
  type EdgeMarkerType,
  type EdgeMouseHandler,
  type EdgeProps,
  type FitBounds,
  type FitBoundsOptions,
  type FitView,
  type FlowingerInstance,
  type FlowingerProps,
  type GetBezierPathParams,
  type GetSmoothStepPathParams,
  type GetStraightPathParams,
  type HandleConnection,
  type IsValidConnection,
  type NodeConnection,
  type KeyCode,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnBeforeDelete,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnConnectStartParams,
  type OnDelete,
  type OnEdgesChange,
  type OnEdgesDelete,
  type OnInit,
  type OnMove,
  type OnMoveEnd,
  type OnMoveStart,
  type OnNodeDrag,
  type OnNodesChange,
  type OnNodesDelete,
  type NodeResizerProps,
  type OnReconnect,
  type OnResize,
  type OnResizeEnd,
  type OnResizeStart,
  type OnSelectionChangeFunc,
  type OnSelectionChangeParams,
  type ProOptions,
  type ReactFlowInstance,
  type ReactFlowJsonObject,
  type ReactFlowProps,
  type SetCenter,
  type SetViewport,
  type ShouldResize,
  type SmoothStepEdgeProps,
  type SnapGrid,
  type StepEdgeProps,
  type StraightEdgeProps,
  type Transform,
  type UseNodeConnectionsOptions,
  type UseNodeConnectionsParams,
  type UseOnSelectionChangeOptions,
  type Viewport,
  type XYZPosition,
} from '../index.ts';

// `expectTypeOf` is a no-op at runtime: what fails these is `pnpm typecheck` (which covers the tests), so a
// name that drifts from the prop it describes is a compile error, not a quiet one.
type Prop<K extends keyof FlowingerProps> = NonNullable<FlowingerProps[K]>;

describe('React Flow\'s names for types flowinger has', () => {
  it('each callback is exactly the prop it describes', () => {
    expectTypeOf<OnNodesChange>().toEqualTypeOf<Prop<'onNodesChange'>>();
    expectTypeOf<OnEdgesChange>().toEqualTypeOf<Prop<'onEdgesChange'>>();
    expectTypeOf<OnConnect>().toEqualTypeOf<Prop<'onConnect'>>();
    expectTypeOf<OnConnectStart>().toEqualTypeOf<Prop<'onConnectStart'>>();
    expectTypeOf<OnConnectEnd>().toEqualTypeOf<Prop<'onConnectEnd'>>();
    expectTypeOf<IsValidConnection>().toEqualTypeOf<Prop<'isValidConnection'>>();
    expectTypeOf<OnReconnect>().toEqualTypeOf<Prop<'onReconnect'>>();
    expectTypeOf<OnInit>().toEqualTypeOf<Prop<'onInit'>>();
    expectTypeOf<OnMove>().toEqualTypeOf<Prop<'onMove'>>();
    expectTypeOf<OnMoveStart>().toEqualTypeOf<Prop<'onMoveStart'>>();
    expectTypeOf<OnMoveEnd>().toEqualTypeOf<Prop<'onMoveEnd'>>();
    expectTypeOf<OnNodeDrag>().toEqualTypeOf<Prop<'onNodeDrag'>>();
    expectTypeOf<NodeMouseHandler>().toEqualTypeOf<Prop<'onNodeClick'>>();
    expectTypeOf<NodeMouseHandler>().toEqualTypeOf<Prop<'onNodeDoubleClick'>>();
    expectTypeOf<EdgeMouseHandler>().toEqualTypeOf<Prop<'onEdgeClick'>>();
    expectTypeOf<EdgeMouseHandler>().toEqualTypeOf<Prop<'onEdgeContextMenu'>>();
    expectTypeOf<OnNodesDelete>().toEqualTypeOf<Prop<'onNodesDelete'>>();
    expectTypeOf<OnEdgesDelete>().toEqualTypeOf<Prop<'onEdgesDelete'>>();
    expectTypeOf<OnDelete>().toEqualTypeOf<Prop<'onDelete'>>();
    expectTypeOf<OnBeforeDelete>().toEqualTypeOf<Prop<'onBeforeDelete'>>();
    expectTypeOf<OnSelectionChangeFunc>().toEqualTypeOf<Prop<'onSelectionChange'>>();
    expectTypeOf<OnSelectionChangeParams>().toEqualTypeOf<Parameters<Prop<'onSelectionChange'>>[0]>();
    expectTypeOf<DefaultEdgeOptions>().toEqualTypeOf<Prop<'defaultEdgeOptions'>>();
    expectTypeOf<CoordinateExtent>().toEqualTypeOf<Prop<'translateExtent'>>();
    expectTypeOf<SnapGrid>().toEqualTypeOf<Prop<'snapGrid'>>();
    expect(true).toBe(true);
  });

  it('the generic ones take a node or edge type, defaulting to the plain one', () => {
    type MyNode = Node<{ label: string }, 'custom'>;
    type MyEdge = Edge & { data: { weight: number } };
    expectTypeOf<OnNodesChange<MyNode>>().parameter(0).toEqualTypeOf<NodeChangeset<MyNode>>();
    expectTypeOf<OnEdgesChange<MyEdge>>().parameter(0).toEqualTypeOf<EdgeChangeset<MyEdge>>();
    // A changeset is an array of the changes, so a handler written for React Flow 12's arrays still fits.
    expectTypeOf<NodeChangeset<MyNode>>().toMatchTypeOf<NodeChange<MyNode>[]>();
    expectTypeOf<(changes: NodeChange[]) => void>().toMatchTypeOf<OnNodesChange>();
    expectTypeOf<NodeMouseHandler<MyNode>>().parameter(1).toEqualTypeOf<MyNode>();
    expectTypeOf<EdgeMouseHandler<MyEdge>>().parameter(1).toEqualTypeOf<MyEdge>();
    expectTypeOf<ReactFlowJsonObject<MyNode, MyEdge>['nodes']>().toEqualTypeOf<MyNode[]>();
    expect(true).toBe(true);
  });

  it('the instance and the props are the canvas\'s own, and are not generic', () => {
    expectTypeOf<ReactFlowInstance>().toEqualTypeOf<FlowingerInstance>();
    expectTypeOf<ReactFlowProps>().toEqualTypeOf<FlowingerProps>();
    expectTypeOf<ReactFlowJsonObject>().toEqualTypeOf<ReturnType<FlowingerInstance['toObject']>>();
    expectTypeOf<SetViewport>().toEqualTypeOf<FlowingerInstance['setViewport']>();
    expectTypeOf<SetCenter>().toEqualTypeOf<FlowingerInstance['setCenter']>();
    expectTypeOf<FitBounds>().toEqualTypeOf<FlowingerInstance['fitBounds']>();
    expectTypeOf<FitView>().toEqualTypeOf<FlowingerInstance['fitView']>();
    // Honest rather than convenient: a type argument the canvas would silently ignore is an error.
    // @ts-expect-error `ReactFlowInstance` takes no type arguments here
    type NotGeneric = ReactFlowInstance<Node>;
    // @ts-expect-error `ReactFlowProps` takes no type arguments here
    type AlsoNot = ReactFlowProps<Node, Edge>;
    expectTypeOf<[NotGeneric, AlsoNot]>().not.toBeNever();
    expect(true).toBe(true);
  });

  it('components, paths and hooks are the real types under React Flow\'s names', () => {
    expectTypeOf<ControlProps>().toEqualTypeOf<ControlsProps>();
    expectTypeOf<ConnectionLineComponentProps>().toEqualTypeOf<ConnectionLineProps>();
    expectTypeOf<ConnectionLineComponent>().toEqualTypeOf<Prop<'connectionLineComponent'>>();
    expectTypeOf<UseNodeConnectionsParams>().toEqualTypeOf<UseNodeConnectionsOptions>();
    expectTypeOf<BezierEdgeProps>().toEqualTypeOf<EdgeProps>();
    expectTypeOf<StraightEdgeProps>().toEqualTypeOf<EdgeProps>();
    expectTypeOf<SmoothStepEdgeProps>().toEqualTypeOf<EdgeProps>();
    expectTypeOf<StepEdgeProps>().toEqualTypeOf<EdgeProps>();
    expectTypeOf<GetBezierPathParams>().toEqualTypeOf<Parameters<typeof getBezierPath>[0]>();
    expectTypeOf<GetStraightPathParams>().toEqualTypeOf<Parameters<typeof getStraightPath>[0]>();
    expectTypeOf<GetSmoothStepPathParams>().toEqualTypeOf<Parameters<typeof getSmoothStepPath>[0]>();
    expect(true).toBe(true);
  });

  it('the small ones are what they name', () => {
    expectTypeOf<HandleConnection>().toEqualTypeOf<NodeConnection>();
    expectTypeOf<EdgeLabelRendererProps>().toEqualTypeOf<Parameters<typeof EdgeLabelRenderer>[0]>();
    expectTypeOf<DeleteElementsOptions>().toEqualTypeOf<Parameters<FlowingerInstance['deleteElements']>[0]>();
    expectTypeOf<FitBoundsOptions>().toEqualTypeOf<NonNullable<Parameters<FlowingerInstance['fitBounds']>[1]>>();
    expectTypeOf<UseOnSelectionChangeOptions>().toEqualTypeOf<Parameters<typeof useOnSelectionChange>[0]>();
    expectTypeOf<EdgeMarkerType>().toEqualTypeOf<NonNullable<Edge['markerEnd']>>();
    expectTypeOf<ProOptions>().toEqualTypeOf<NonNullable<FlowingerProps['proOptions']>>();
    expectTypeOf<OnResizeStart>().toEqualTypeOf<NonNullable<NodeResizerProps['onResizeStart']>>();
    expectTypeOf<OnResize>().toEqualTypeOf<NonNullable<NodeResizerProps['onResize']>>();
    expectTypeOf<OnResizeEnd>().toEqualTypeOf<NonNullable<NodeResizerProps['onResizeEnd']>>();
    expectTypeOf<ShouldResize>().toEqualTypeOf<NonNullable<NodeResizerProps['shouldResize']>>();
    expect(true).toBe(true);
  });

  it('where the two libraries share a shape, it is the same shape (the oracle)', () => {
    expectTypeOf<OnConnect>().toEqualTypeOf<RFOnConnect>();
    expectTypeOf<CoordinateExtent>().toEqualTypeOf<RFCoordinateExtent>();
    expectTypeOf<SnapGrid>().toEqualTypeOf<RFSnapGrid>();
    expectTypeOf<KeyCode>().toEqualTypeOf<RFKeyCode>();
    expectTypeOf<Dimensions>().toEqualTypeOf<RFDimensions>();
    expectTypeOf<Box>().toEqualTypeOf<RFBox>();
    expectTypeOf<Transform>().toEqualTypeOf<RFTransform>();
    expectTypeOf<XYZPosition>().toEqualTypeOf<RFXYZPosition>();
    expectTypeOf<ControlButtonProps>().toEqualTypeOf<RFControlButtonProps>();
    // React Flow builds this one as `Connection & { edgeId }`; the same fields, so each fits the other.
    expectTypeOf<HandleConnection>().toMatchTypeOf<RFHandleConnection>();
    expectTypeOf<RFHandleConnection>().toMatchTypeOf<HandleConnection>();
    expect(true).toBe(true);
  });

  it('is narrower than React Flow where flowinger is: a drag always starts at a real node and handle type', () => {
    expectTypeOf<OnConnectStartParams>().toEqualTypeOf<{
      nodeId: string;
      handleId: string | null;
      handleType: 'source' | 'target';
    }>();
    expect(true).toBe(true);
  });
});

describe('code written against those names runs on the canvas', () => {
  const initial: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', position: { x: 300, y: 0 }, width: 100, height: 40, data: {} },
  ];

  it('wires a controlled flow with the annotations a migrated app would have', () => {
    const seen = vi.fn();

    function Flow() {
      const [nodes, setNodes] = useState<Node[]>(initial);
      const [edges, setEdges] = useState<Edge[]>([]);

      const onNodesChange: OnNodesChange = (changes) => setNodes((ns) => applyNodeChanges(changes, ns));
      const onConnect: OnConnect = (c) => setEdges((es) => addEdge(c, es));
      const onInit: OnInit = (instance: ReactFlowInstance) => seen(instance.getNodes().length);
      const onNodeClick: NodeMouseHandler = (_event, node) => seen(node.id);
      const onMoveEnd: OnMoveEnd = (_event, viewport: Viewport) => seen(viewport.zoom);
      const defaultEdgeOptions: DefaultEdgeOptions = { animated: true };
      const translateExtent: CoordinateExtent = [
        [-1000, -1000],
        [1000, 1000],
      ];
      const props: ReactFlowProps = {
        nodes,
        edges,
        onNodesChange,
        onConnect,
        onInit,
        onNodeClick,
        onMoveEnd,
        defaultEdgeOptions,
        translateExtent,
      };
      return (
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas {...props} />
        </div>
      );
    }

    const { container } = render(<Flow />);
    expect(container.querySelector('[data-id="a"]')).not.toBeNull();
    expect(container.querySelector('[data-id="b"]')).not.toBeNull();
    expect(seen).toHaveBeenCalledWith(2);
  });

  it('an alias is assignable to the prop it names, on the lean canvas too', () => {
    const onSelectionChange: OnSelectionChangeFunc = vi.fn();
    const isValid: IsValidConnection = () => true;
    const onEdgesChange: OnEdgesChange = () => {};
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={initial} onSelectionChange={onSelectionChange} isValidConnection={isValid} onEdgesChange={onEdgesChange} />
      </div>,
    );
    expect(container.querySelector('[data-id="a"]')).not.toBeNull();
    const handlers: [OnBeforeDelete, OnNodeDrag, OnNodesDelete, OnEdgesDelete, OnDelete, OnReconnect, OnConnectStart, OnConnectEnd, OnMove, OnMoveStart, EdgeMouseHandler] =
      [() => true, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}];
    expect(handlers).toHaveLength(11);
  });
});
