export interface ExportOptions {
  /** Background color to render behind canvas. Default 'transparent'. */
  backgroundColor?: string;
  /** Padding in pixels around exported diagram bounds. Default 20. */
  padding?: number;
  /** Scale factor for high-resolution rendering. Default 2. */
  pixelRatio?: number;
  /** Custom export width. Defaults to diagram bounding box width + padding. */
  width?: number;
  /** Custom export height. Defaults to diagram bounding box height + padding. */
  height?: number;
  /** Filter callback to exclude elements (e.g. controls, panel overlays). Return true to include. */
  filter?: (element: HTMLElement | SVGElement) => boolean;
}

export interface ExportPngOptions extends ExportOptions {
  /** Output image format mime-type. Default 'image/png'. */
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Quality between 0 and 1 (applies to jpeg/webp). Default 1.0. */
  quality?: number;
}

/**
 * Serializes a Flowinger or React Flow canvas element into a standalone SVG string.
 * Completely zero-dependency and lightweight.
 */
export async function exportCanvasToSvg(
  container: HTMLElement | null,
  options: ExportOptions = {},
): Promise<string> {
  if (!container) throw new Error('flowinger export: container element is null');

  const {
    backgroundColor = 'transparent',
    padding = 20,
    filter = (el) => !el.classList.contains('react-flow__panel') && !el.classList.contains('flowinger-controls'),
  } = options;

  const viewportEl = container.querySelector<HTMLElement>('.flowinger-viewport, .react-flow__viewport') ?? container;
  const rect = viewportEl.getBoundingClientRect();

  const width = options.width ?? Math.max(1, rect.width + padding * 2);
  const height = options.height ?? Math.max(1, rect.height + padding * 2);

  const clone = container.cloneNode(true) as HTMLElement;

  // Filter out panels and excluded elements
  const allElements = clone.querySelectorAll<HTMLElement | SVGElement>('*');
  allElements.forEach((el) => {
    if (!filter(el)) el.remove();
  });

  const serializer = new XMLSerializer();
  const innerHtml = serializer.serializeToString(clone);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${backgroundColor}" />
    <foreignObject x="${padding}" y="${padding}" width="${width - padding * 2}" height="${height - padding * 2}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width: 100%; height: 100%; position: relative;">
        ${innerHtml}
      </div>
    </foreignObject>
  </svg>`;

  return svg;
}

/**
 * Exports a Flowinger or React Flow canvas to a PNG Data URL using HTML5 Canvas rasterization.
 */
export async function exportCanvasToPng(
  container: HTMLElement | null,
  options: ExportPngOptions = {},
): Promise<string> {
  const svgString = await exportCanvasToSvg(container, options);
  const { pixelRatio = 2, mimeType = 'image/png', quality = 1.0 } = options;

  return new Promise<string>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      return reject(new Error('flowinger export: PNG export requires browser DOM environment'));
    }

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * pixelRatio;
        canvas.height = img.height * pixelRatio;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return reject(new Error('flowinger export: failed to get 2d canvas context'));
        }

        ctx.scale(pixelRatio, pixelRatio);
        if (options.backgroundColor && options.backgroundColor !== 'transparent') {
          ctx.fillStyle = options.backgroundColor;
          ctx.fillRect(0, 0, img.width, img.height);
        }
        ctx.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`flowinger export: failed to rasterize SVG to image: ${String(err)}`));
    };

    img.src = url;
  });
}

/**
 * Helper to download an exported SVG or PNG data URL directly to the user's browser.
 */
export function downloadFile(dataUrl: string, filename: string): void {
  if (typeof document === 'undefined') return;

  const a = document.createElement('a');
  a.download = filename;
  a.href = dataUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
