/**
 * A fixed grid laid over the world. Cells are roughly square: every row is the same
 * height in metres, and each row's width in degrees is widened by its latitude.
 */

const METRES_PER_DEGREE_LAT = 111_320;

export interface Cell {
  /** Stable id such as "150:37291:-1840". */
  id: string;
  row: number;
  col: number;
  sizeM: number;
  south: number;
  west: number;
  north: number;
  east: number;
}

function rowHeightDeg(sizeM: number): number {
  return sizeM / METRES_PER_DEGREE_LAT;
}

function colWidthDeg(sizeM: number, row: number): number {
  const h = rowHeightDeg(sizeM);
  const midLat = Math.max(-85, Math.min(85, (row + 0.5) * h));
  return h / Math.cos((midLat * Math.PI) / 180);
}

export function cellAt(lat: number, lng: number, sizeM: number): Cell {
  const h = rowHeightDeg(sizeM);
  const row = Math.floor(lat / h);
  const w = colWidthDeg(sizeM, row);
  const col = Math.floor(lng / w);
  return cellFromIndex(row, col, sizeM);
}

export function cellFromIndex(row: number, col: number, sizeM: number): Cell {
  const h = rowHeightDeg(sizeM);
  const w = colWidthDeg(sizeM, row);
  return {
    id: `${sizeM}:${row}:${col}`,
    row,
    col,
    sizeM,
    south: row * h,
    north: (row + 1) * h,
    west: col * w,
    east: (col + 1) * w,
  };
}

/** The cell containing the point plus its neighbours within `radius` cells. */
export function cellsAround(lat: number, lng: number, sizeM: number, radius = 1): Cell[] {
  const centre = cellAt(lat, lng, sizeM);
  const cells: Cell[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    const row = centre.row + dr;
    // Column widths change slightly between rows, so find this row's column under the point.
    const col = Math.floor(lng / colWidthDeg(sizeM, row));
    for (let dc = -radius; dc <= radius; dc++) cells.push(cellFromIndex(row, col + dc, sizeM));
  }
  return cells;
}
