import { OUTLINE_POINTS, radialOutline, type Vec } from './sketch';

const SIZE = 200;

/**
 * The outline of a drawn creature, in its 200 × 200 drawing units. The SVG is painted onto a
 * small canvas and its inked pixels give the shape, so every species, evolved form and seeded
 * variation can be sketched without a hand-made path for each.
 */
export async function creatureOutline(svg: SVGSVGElement): Promise<Vec[]> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('width', String(SIZE));
  copy.setAttribute('height', String(SIZE));
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return fallback();
    g.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = g.getImageData(0, 0, SIZE, SIZE);
    const outline = radialOutline((x, y) => data[(y * SIZE + x) * 4 + 3] > 90, SIZE);
    return outline.length ? outline : fallback();
  } catch {
    return fallback();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** An oval roughly where every creature sits, if the drawing cannot be read. */
function fallback(): Vec[] {
  return Array.from({ length: OUTLINE_POINTS }, (_, i) => {
    const a = (i / OUTLINE_POINTS) * Math.PI * 2;
    return { x: 100 + Math.cos(a) * 52, y: 112 + Math.sin(a) * 48 };
  });
}
