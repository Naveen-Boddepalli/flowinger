import { Editor } from './Editor';
import { Viewer } from './Viewer';
import { pipeline } from './pipeline';

// A Server Component: the graph is built and laid out here, and the canvases below arrive as HTML — nodes,
// edges, arrowheads, framed — before any JavaScript runs. View the page's source to see them.
export default function Page() {
  const { nodes, edges, viewport } = pipeline();
  return (
    <main>
      <h1>Flowinger in Next.js</h1>
      <p>
        Laid out on the server, rendered to HTML there, and hydrated in the browser. Nothing jumps on load: the
        viewport is worked out on the server for the canvas&apos;s known size.
      </p>

      <h2>A viewer</h2>
      <div className="canvas">
        <Viewer nodes={nodes} edges={edges} viewport={viewport} />
      </div>

      <h2>An editor</h2>
      <p>Drag a step, connect two, select one and press Delete, then undo.</p>
      <div className="canvas">
        <Editor initialNodes={nodes} initialEdges={edges} viewport={viewport} />
      </div>
    </main>
  );
}
