/**
 * Rasterize src/app/icon.svg into the binary icon files Next.js serves:
 *   - src/app/favicon.ico  (multi-size PNG-in-ICO: 16/32/48)
 *   - src/app/apple-icon.png (180×180)
 *
 * Run after editing icon.svg:  node scripts/gen-icons.mjs
 * Uses the project's pinned `sharp` (already a dependency). SVG is rendered at
 * high density then downscaled so the small sizes stay crisp.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "src/app/icon.svg"));

/** Wrap PNG buffers into a single .ico container (PNG-encoded entries). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  for (let i = 0; i < entries.length; i++) {
    const { size, png } = entries[i];
    const b = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, b + 0); // width (0 => 256)
    dir.writeUInt8(size >= 256 ? 0 : size, b + 1); // height
    dir.writeUInt8(0, b + 2); // palette count
    dir.writeUInt8(0, b + 3); // reserved
    dir.writeUInt16LE(1, b + 4); // color planes
    dir.writeUInt16LE(32, b + 6); // bits per pixel
    dir.writeUInt32LE(png.length, b + 8); // bytes of image data
    dir.writeUInt32LE(offset, b + 12); // offset from file start
    offset += png.length;
  }
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(
  icoSizes.map((size) =>
    sharp(svg, { density: 384 }).resize(size, size).png().toBuffer(),
  ),
);
writeFileSync(
  join(root, "src/app/favicon.ico"),
  buildIco(icoSizes.map((size, i) => ({ size, png: icoPngs[i] }))),
);

const apple = await sharp(svg, { density: 384 }).resize(180, 180).png().toBuffer();
writeFileSync(join(root, "src/app/apple-icon.png"), apple);

console.log("Wrote src/app/favicon.ico (16/32/48) + src/app/apple-icon.png (180)");
