// ─── Kollektiv Image Editor — .cube LUT parser ───────────────────────────────
// Adobe/Resolve .cube 3D LUTs: `LUT_3D_SIZE N`, optional DOMAIN_MIN/MAX and
// TITLE, then N³ "r g b" rows with red changing fastest — the same order
// WebGL2 texImage3D expects (x = r, y = g, z = b), so the data uploads as-is.
// DOMAIN_MIN/MAX scale the INPUT lookup, not the table. 1D LUTs
// (LUT_1D_SIZE) are rejected rather than misread.

export interface CubeLut {
  title: string;
  size: number;
  /** RGBA, N³ entries, output values as written (usually 0–1). */
  data: Float32Array;
  /** Input domain: a colour c is looked up at (c − domainMin) / (domainMax − domainMin). */
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

export function parseCube(text: string): CubeLut {
  let title = '';
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values: number[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === 'TITLE') { title = line.slice(5).trim().replace(/^"|"$/g, ''); continue; }
    if (key === 'LUT_1D_SIZE') throw new Error('1D LUTs are not supported — use a 3D .cube LUT.');
    if (key === 'LUT_3D_SIZE') { size = Number(parts[1]); continue; }
    if (key === 'DOMAIN_MIN') { min = parts.slice(1, 4).map(Number); continue; }
    if (key === 'DOMAIN_MAX') { max = parts.slice(1, 4).map(Number); continue; }
    if (/^[A-Z][A-Z0-9_]*$/.test(parts[0])) continue; // other keywords (LUT_3D_INPUT_RANGE, …), case as written
    if (parts.length < 3) throw new Error(`Malformed LUT row: "${line}"`);
    values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  }

  if (!Number.isInteger(size) || size < 2 || size > 256) throw new Error('Missing or invalid LUT_3D_SIZE.');
  const expected = size * size * size;
  if (values.length !== expected * 3) {
    throw new Error(`LUT_3D_SIZE ${size} needs ${expected} rows; found ${values.length / 3}.`);
  }
  if (values.some(v => !Number.isFinite(v))) throw new Error('LUT contains non-numeric values.');

  if (min.length !== 3 || max.length !== 3 || [...min, ...max].some(v => !Number.isFinite(v)) || min.some((v, i) => v >= max[i])) {
    throw new Error('Invalid DOMAIN_MIN / DOMAIN_MAX.');
  }
  const data = new Float32Array(expected * 4);
  for (let i = 0; i < expected; i++) {
    data[i * 4] = values[i * 3];
    data[i * 4 + 1] = values[i * 3 + 1];
    data[i * 4 + 2] = values[i * 3 + 2];
    data[i * 4 + 3] = 1;
  }
  return { title, size, data, domainMin: min as [number, number, number], domainMax: max as [number, number, number] };
}
