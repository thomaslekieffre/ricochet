// One-off asset pipeline script (not part of the app runtime): converts the
// AI-generated hero sprites (webp, white background) into transparent PNGs
// via a proper flood fill from the image border. Unlike a global chroma key,
// this never eats white pixels *inside* the silhouette (visor highlights,
// line-art interiors), only the background actually connected to the edges.
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve("src/assets/heroes");
const tolerance = 30; // per-channel distance from the sampled background color

async function processOne(file) {
  const src = path.join(dir, file);
  const name = path.parse(file).name;
  const out = path.join(dir, `${name}.png`);

  const img = sharp(src).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  const bgR = data[0], bgG = data[1], bgB = data[2];
  const close = (i) => {
    const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
    return Math.abs(dr) <= tolerance && Math.abs(dg) <= tolerance && Math.abs(db) <= tolerance;
  };

  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;

  const pushIfBg = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    stack[sp++] = idx;
  };

  for (let x = 0; x < w; x++) { pushIfBg(x, 0); pushIfBg(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIfBg(0, y); pushIfBg(w - 1, y); }

  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % w, y = (idx / w) | 0;
    const i = idx * c;
    if (!close(i)) continue;
    data[i + 3] = 0; // clear alpha
    pushIfBg(x + 1, y); pushIfBg(x - 1, y); pushIfBg(x, y + 1); pushIfBg(x, y - 1);
  }

  await sharp(data, { raw: { width: w, height: h, channels: c } })
    .png()
    .toFile(out);
  console.log(`OK ${file} -> ${name}.png (${w}x${h})`);
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".webp"));
for (const f of files) await processOne(f);
