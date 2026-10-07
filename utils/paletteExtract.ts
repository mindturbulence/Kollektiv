export type RGBColor = [number, number, number];

const range = (pixels: RGBColor[], ch: 0 | 1 | 2): number => {
  let lo = 255, hi = 0;
  for (const p of pixels) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; }
  return hi - lo;
};

/** Median-cut quantisation: splits the widest-range bucket until maxClusters, returns bucket averages. */
export const medianCut = (pixels: RGBColor[], maxClusters: number): RGBColor[] => {
  if (pixels.length === 0 || maxClusters < 1) return [];
  const buckets: RGBColor[][] = [pixels];
  while (buckets.length < maxClusters) {
    let largestBucketIndex = -1;
    let largestBucketSize = -1;
    let largestBucketDimensionRange = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length > largestBucketSize) {
        const maxRange = Math.max(range(buckets[i], 0), range(buckets[i], 1), range(buckets[i], 2));
        if (maxRange > largestBucketDimensionRange) { largestBucketIndex = i; largestBucketSize = buckets[i].length; largestBucketDimensionRange = maxRange; }
      }
    }
    if (largestBucketIndex === -1) break;
    const bucketToSort = buckets[largestBucketIndex];
    const rangeR = range(bucketToSort, 0), rangeG = range(bucketToSort, 1), rangeB = range(bucketToSort, 2);
    let sortDimension = 0;
    if (rangeG > rangeR && rangeG > rangeB) sortDimension = 1;
    if (rangeB > rangeR && rangeB > rangeG) sortDimension = 2;
    bucketToSort.sort((a, b) => a[sortDimension] - b[sortDimension]);
    const mid = Math.floor(bucketToSort.length / 2);
    buckets.splice(largestBucketIndex, 1, bucketToSort.slice(0, mid), bucketToSort.slice(mid));
  }
  return buckets.map(bucket => {
    const avgR = bucket.reduce((sum, p) => sum + p[0], 0) / bucket.length;
    const avgG = bucket.reduce((sum, p) => sum + p[1], 0) / bucket.length;
    const avgB = bucket.reduce((sum, p) => sum + p[2], 0) / bucket.length;
    return [avgR, avgG, avgB];
  });
};

// Distance metric: max per-channel difference (Chebyshev).
const MERGE_DELTA = 12;
const near = (a: RGBColor, b: RGBColor): boolean =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) < MERGE_DELTA;

/** Population-ranked clusters: each pixel votes for its nearest cluster, then smaller clusters within MERGE_DELTA of a larger kept one are dropped. */
const rankedDistinct = (pixels: RGBColor[], clusters: RGBColor[]): RGBColor[] => {
  const counts = clusters.map(() => 0);
  for (const p of pixels) {
    let best = -1, bestD = Infinity;
    clusters.forEach((c, i) => {
      const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) counts[best]++;
  }
  const kept: RGBColor[] = [];
  clusters
    .map((c, i) => ({ c, n: counts[i] }))
    .filter(({ n }) => n > 0)
    .sort((a, b) => b.n - a.n)
    .forEach(({ c }) => { if (!kept.some(k => near(k, c))) kept.push(c); });
  return kept.map((c): RGBColor => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
};

const hslSL = ([r, g, b]: RGBColor): { s: number; l: number } => {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
};

const MIN_ACCENT_FRACTION = 0.0005;
const MAX_ACCENTS = 3;

/** Design palette: dominant surfaces (near-duplicates merged) plus up to 3 saturated accents that plain median-cut averages away. */
export const extractDesignPalette = (pixels: RGBColor[]): { surfaces: RGBColor[]; accents: RGBColor[] } => {
  if (pixels.length === 0) return { surfaces: [], accents: [] };
  const surfaces = rankedDistinct(pixels, medianCut(pixels, 8));
  const vivid = pixels.filter(p => { const { s, l } = hslSL(p); return s > 0.4 && l > 0.2 && l < 0.85; });
  // ponytail: fraction floor keeps JPEG noise from becoming a fake accent
  if (vivid.length === 0 || vivid.length < pixels.length * MIN_ACCENT_FRACTION) return { surfaces, accents: [] };
  return { surfaces, accents: rankedDistinct(vivid, medianCut(vivid, 4)).slice(0, MAX_ACCENTS) };
};
