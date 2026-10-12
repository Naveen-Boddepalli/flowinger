export interface ExportOptions {
  /** Background color to render behind canvas. Default 'transparent'. */
  backgroundColor?: string;
  /** Padding in pixels around exported diagram bounds. Default 20. */
  padding?: number;
  /** Scale factor for high-resolution rendering (PNG and other raster formats). Default 2. */
  pixelRatio?: number;
  /**
   * Export width in pixels. By default the image is as wide as the whole diagram plus `padding`, at the
   * scale it is drawn at 1:1; give a `width` and/or `height` and the diagram is scaled to fit inside.
   */
  width?: number;
  /** Export height in pixels. See `width`. */
  height?: number;
  /** Filter callback to exclude elements (e.g. overlays inside nodes). Return true to include. */
  filter?: (element: HTMLElement | SVGElement) => boolean;
  /**
   * Copy the page's style sheets into the image, so nodes styled by class — not inline — are drawn the way
   * they are on the page. An image cannot load a page's stylesheets itself. Cross-origin sheets the browser
   * will not let a script read are skipped. Default true.
   */
  includeStyles?: boolean;
}

export interface ExportPngOptions extends ExportOptions {
  /** Output image format mime-type. Default 'image/png'. */
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Quality between 0 and 1 (applies to jpeg/webp). Default 1.0. */
  quality?: number;
}

/** The custom properties the library's own components read; a theme sets them on an ancestor. */
const THEME_VARIABLES = [
  '--flowinger-border',
  '--flowinger-edge',
  '--flowinger-mask',
  '--flowinger-radius',
  '--flowinger-selected',
  '--flowinger-surface',
  '--flowinger-surface-raised',
  '--flowinger-text',
  '--flowinger-text-dim',
];

/** What the viewport layer is scaled by: `translate(Xpx, Ypx) scale(Z)`, or the matrix the browser rewrites it to. */
function scaleOf(el: HTMLElement): number {
  const inline = /scale\(\s*(-?[\d.]+(?:e-?\d+)?)/.exec(el.style.transform);
  if (inline) return Number(inline[1]) || 1;
  const matrix = /matrix\(\s*(-?[\d.]+(?:e-?\d+)?)/.exec(getComputedStyle(el).transform);
  return matrix ? Number(matrix[1]) || 1 : 1;
}

/**
 * What is drawn, as a box in graph units: the union of its nodes, edges and edge labels, read back from where the
 * browser put them through the viewport's own pan and zoom. Null when nothing is drawn.
 */
function drawnBounds(viewport: HTMLElement): { x: number; y: number; width: number; height: number } | null {
  const origin = viewport.getBoundingClientRect();
  const zoom = scaleOf(viewport);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const parts = viewport.querySelectorAll('.react-flow__node, .react-flow__edge, .react-flow__edgelabel-renderer > *');
  for (const part of Array.from(parts)) {
    const r = part.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // not drawn: hidden, or not laid out
    minX = Math.min(minX, (r.left - origin.left) / zoom);
    minY = Math.min(minY, (r.top - origin.top) / zoom);
    maxX = Math.max(maxX, (r.right - origin.left) / zoom);
    maxY = Math.max(maxY, (r.bottom - origin.top) / zoom);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

/** The page's style rules as text, for the image to carry; sheets a script may not read are left out. */
function pageStyles(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) css += `${rule.cssText}\n`;
    } catch {
      // A cross-origin sheet: the browser does not let a script read its rules.
    }
  }
  return css.replaceAll(']]>', ']]]]><![CDATA[>');
}

/**
 * Serializes the diagram of a Flowinger or React Flow canvas into a standalone SVG string: *all* of it, whatever
 * the pan and zoom show, at 1:1 unless `width` / `height` say otherwise. Zero dependencies.
 *
 * It is the page's own DOM drawn into the image (an SVG `<foreignObject>`), so what an image cannot load — a
 * `<img>`, a web font — is not there: use a `data:` URL for an image you need in the export.
 */
export async function exportCanvasToSvg(
  container: HTMLElement | null,
  options: ExportOptions = {},
): Promise<string> {
  if (!container) throw new Error('flowinger export: container element is null');

  const {
    backgroundColor = 'transparent',
    padding = 20,
    includeStyles = true,
    filter = (el) => !el.classList.contains('react-flow__panel') && !el.classList.contains('flowinger-controls'),
  } = options;

  const viewport = container.querySelector<HTMLElement>('.flowinger-viewport, .react-flow__viewport');
  if (!viewport) throw new Error('flowinger export: no canvas inside the container');

  const bounds = drawnBounds(viewport) ?? { x: 0, y: 0, width: 1, height: 1 };
  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);

  // At 1:1 the image is the diagram and its padding; given a size, the diagram is scaled to fit inside it.
  let width = Math.ceil(bw + padding * 2);
  let height = Math.ceil(bh + padding * 2);
  let scale = 1;
  if (options.width !== undefined || options.height !== undefined) {
    width = options.width ?? width;
    height = options.height ?? height;
    scale = Math.min(Math.max(1, width - padding * 2) / bw, Math.max(1, height - padding * 2) / bh);
  }
  // Where the diagram's top-left goes: centred in the image.
  const tx = (width - bw * scale) / 2 - bounds.x * scale;
  const ty = (height - bh * scale) / 2 - bounds.y * scale;

  const clone = viewport.cloneNode(true) as HTMLElement;
  clone.style.transform = `translate(${String(tx)}px, ${String(ty)}px) scale(${String(scale)})`;
  clone.style.pointerEvents = 'auto';
  clone.querySelectorAll<HTMLElement | SVGElement>('*').forEach((el) => {
    if (!filter(el)) el.remove();
  });

  // The theme is set on an ancestor of the canvas, which the image does not have: carry what it resolves to.
  const computed = getComputedStyle(container);
  const theme = THEME_VARIABLES.flatMap((name) => {
    const value = computed.getPropertyValue(name).trim();
    return value === '' ? [] : [`${name}: ${value};`];
  }).join(' ');

  const html = new XMLSerializer().serializeToString(clone);
  const styles = includeStyles ? `<style><![CDATA[${pageStyles()}]]></style>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">
    <rect width="100%" height="100%" fill="${backgroundColor}" />
    <foreignObject x="0" y="0" width="${String(width)}" height="${String(height)}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="position: relative; width: ${String(width)}px; height: ${String(height)}px; overflow: hidden; ${theme}">
        ${styles}
        ${html}
      </div>
    </foreignObject>
  </svg>`;
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
    // A data: URL, not a blob: URL — a canvas drawn from an SVG with a foreignObject is tainted by some
    // browsers when it comes from a blob, which makes `toDataURL` throw.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * pixelRatio;
        canvas.height = img.height * pixelRatio;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('flowinger export: failed to get 2d canvas context'));
        }

        ctx.scale(pixelRatio, pixelRatio);
        if (options.backgroundColor && options.backgroundColor !== 'transparent') {
          ctx.fillStyle = options.backgroundColor;
          ctx.fillRect(0, 0, img.width, img.height);
        }
        ctx.drawImage(img, 0, 0);

        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
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
