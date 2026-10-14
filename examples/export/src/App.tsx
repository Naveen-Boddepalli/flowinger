import { useRef, useState } from 'react';
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from 'flowinger';
import { downloadFile, exportCanvasToPng, exportCanvasToSvg, type ExportPngOptions } from 'flowinger/export';

/** A node styled by class names, not inline styles: the export copies the page's style sheets into the
 *  image, so it looks the same there. The "draft" badge has `no-export`, which the filter below leaves out. */
function ServiceNode({ data }: NodeProps) {
  return (
    <div className={`service service-${String(data.kind)}`}>
      <Handle type="target" position={Position.Left} />
      <div className="service-kind">{String(data.kind)}</div>
      <div className="service-name">{String(data.name)}</div>
      {data.draft === true && <span className="badge no-export">draft</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { service: ServiceNode };

const service = (id: string, x: number, y: number, kind: string, name: string, draft = false): Node => ({
  id,
  type: 'service',
  position: { x, y },
  data: { kind, name, draft },
});

const nodes: Node[] = [
  service('web', 0, 90, 'client', 'Web app'),
  service('gateway', 230, 90, 'edge', 'API gateway'),
  service('orders', 460, 0, 'service', 'Orders'),
  service('payments', 460, 180, 'service', 'Payments', true),
  service('db', 690, 0, 'store', 'Postgres'),
  service('queue', 690, 180, 'store', 'Event queue'),
];

const edge = (source: string, target: string, label?: string, animated = false): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  label,
  animated,
  markerEnd: 'arrowclosed',
});

const edges: Edge[] = [
  edge('web', 'gateway', 'HTTPS'),
  edge('gateway', 'orders'),
  edge('gateway', 'payments'),
  edge('orders', 'db', 'SQL'),
  edge('payments', 'queue', 'events', true),
  edge('orders', 'queue'),
];

type Format = 'png' | 'jpeg' | 'webp' | 'svg';
type Size = 'diagram' | 'card';

interface Result {
  url: string;
  filename: string;
  width: number;
  height: number;
  bytes: number;
  png?: Blob;
}

const extension: Record<Format, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' };

/** The canvas's own background, so an export looks like the page — or transparent (PNG, WebP and SVG). */
function backgroundOf(element: HTMLElement, choice: string): string {
  if (choice === 'page') return getComputedStyle(element).backgroundColor;
  return choice;
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('The exported image did not load.'));
    image.src = url;
  });
}

export function App() {
  // The element that holds the canvas: what the export draws, and where it reads the theme from.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [format, setFormat] = useState<Format>('png');
  const [pixelRatio, setPixelRatio] = useState(2);
  const [background, setBackground] = useState('page');
  const [padding, setPadding] = useState(24);
  const [size, setSize] = useState<Size>('diagram');
  const [hideDrafts, setHideDrafts] = useState(true);
  const [hideHandles, setHideHandles] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState('Choose the options, then export.');
  const [busy, setBusy] = useState(false);

  // JPEG has no transparency: a transparent background would come out black.
  const effectiveBackground = format === 'jpeg' && background === 'transparent' ? '#ffffff' : background;

  const run = async () => {
    const element = canvasRef.current;
    if (!element) return;
    setBusy(true);
    try {
      const options: ExportPngOptions = {
        backgroundColor: backgroundOf(element, effectiveBackground),
        padding,
        pixelRatio,
        // A social card: the diagram scaled to fit 1200 × 630 (at 1× — `pixelRatio` multiplies it).
        ...(size === 'card' ? { width: 1200, height: 630 } : {}),
        // `filter` sees every element and keeps the ones it returns true for.
        filter: (el) =>
          !(hideDrafts && el.classList.contains('no-export')) && !(hideHandles && el.classList.contains('react-flow__handle')),
      };
      const filename = `architecture.${extension[format]}`;
      if (result) URL.revokeObjectURL(result.url);

      let next: Result;
      if (format === 'svg') {
        const svg = await exportCanvasToSvg(element, options);
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        next = { url, filename, bytes: blob.size, ...(await imageSize(url)) };
      } else {
        const dataUrl = await exportCanvasToPng(element, {
          ...options,
          mimeType: `image/${format}`,
          quality: format === 'png' ? 1 : 0.92,
        });
        // A blob URL rather than the data: URL for the preview and the download: it is the same image, and
        // the blob is also what the clipboard takes.
        const blob = await (await fetch(dataUrl)).blob();
        const url = URL.createObjectURL(blob);
        next = { url, filename, bytes: blob.size, png: format === 'png' ? blob : undefined, ...(await imageSize(url)) };
      }
      setResult(next);
      setStatus(`${next.width} × ${next.height} px, ${formatBytes(next.bytes)}.`);
    } catch (error) {
      setResult(null);
      setStatus(`Export failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result?.png) return;
    try {
      // Browsers take PNG on the clipboard everywhere; JPEG and WebP not reliably, so only PNG is offered.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': result.png })]);
      setStatus('Copied. Paste it into a document, a chat or an issue.');
    } catch {
      setStatus('This browser would not copy an image (it needs a secure page and permission). Download it instead.');
    }
  };

  return (
    <div className="layout">
      <div className="canvas" ref={canvasRef}>
        <FlowingerProvider>
          <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.15 }}>
            <Background />
            <Controls position="bottom-left" />
          </FlowingerCanvas>
        </FlowingerProvider>
      </div>

      <aside className="side">
        <h1>Export</h1>
        <p className="hint">
          The whole diagram is exported, wherever you have panned or zoomed to. Pan away and try it.
        </p>

        <fieldset>
          <legend>Format</legend>
          {(['png', 'jpeg', 'webp', 'svg'] as const).map((value) => (
            <label key={value}>
              <input type="radio" name="format" checked={format === value} onChange={() => setFormat(value)} />
              {value.toUpperCase()}
            </label>
          ))}
        </fieldset>

        <fieldset disabled={format === 'svg'}>
          <legend>Resolution</legend>
          {[1, 2, 3].map((value) => (
            <label key={value}>
              <input type="radio" name="ratio" checked={pixelRatio === value} onChange={() => setPixelRatio(value)} />
              {value}×
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Background</legend>
          {[
            ['page', 'Page'],
            ['transparent', 'None'],
            ['#ffffff', 'White'],
          ].map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="background" checked={background === value} onChange={() => setBackground(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        {format === 'jpeg' && background === 'transparent' && <p className="hint">JPEG has no transparency, so it gets white.</p>}

        <fieldset>
          <legend>Size</legend>
          <label>
            <input type="radio" name="size" checked={size === 'diagram'} onChange={() => setSize('diagram')} />
            The diagram
          </label>
          <label>
            <input type="radio" name="size" checked={size === 'card'} onChange={() => setSize('card')} />
            Fit 1200 × 630
          </label>
        </fieldset>

        <label className="row">
          Padding
          <input type="range" min={0} max={80} step={4} value={padding} onChange={(e) => setPadding(Number(e.target.value))} />
          <span>{padding} px</span>
        </label>

        <label className="row">
          <input type="checkbox" checked={hideDrafts} onChange={(e) => setHideDrafts(e.target.checked)} />
          Leave out the “draft” badge
        </label>
        <label className="row">
          <input type="checkbox" checked={hideHandles} onChange={(e) => setHideHandles(e.target.checked)} />
          Leave out the connection dots
        </label>

        <div className="actions">
          <button className="primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
          <button onClick={() => result && downloadFile(result.url, result.filename)} disabled={!result}>
            Download
          </button>
          {format === 'png' && (
            <button onClick={() => void copy()} disabled={!result?.png}>
              Copy
            </button>
          )}
        </div>

        <p className="status" role="status">{status}</p>
        {result && (
          <div className="preview">
            <img src={result.url} alt="The exported diagram" />
          </div>
        )}
      </aside>
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
