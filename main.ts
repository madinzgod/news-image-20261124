// Entry program for the news-image-20261124 submission.
//
// The repository ships one picture, entry.png, beside this file. This
// program is the picture's gatekeeper: it checks that the picture is a
// whole PNG, that it is exactly the size the contest expects, and that
// it fits the byte limit, and only then copies it, unchanged, into the
// output folder. Anything wrong with the picture is a hard failure with
// a plain message, never a silent pass.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1_048_576; // the contest caps the image at 1 MiB
const WANT_WIDTH = 1024;
const WANT_HEIGHT = 1024;

// The eight magic bytes that open every PNG stream.
const PNG_MAGIC: readonly number[] = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
];

function bail(reason: string): never {
  console.error(`entry: refusing to ship the picture: ${reason}`);
  process.exit(1);
}

function loadPicture(): Buffer {
  const folder = dirname(fileURLToPath(import.meta.url));
  const picturePath = join(folder, "entry.png");
  try {
    return readFileSync(picturePath);
  } catch {
    bail(`the picture cannot be read at ${picturePath}`);
  }
}

function checkPicture(bytes: Buffer): void {
  if (bytes.length === 0) {
    bail("the picture file is empty");
  }
  if (bytes.length > MAX_BYTES) {
    bail(
      `the picture weighs ${bytes.length} bytes, over the ${MAX_BYTES}-byte limit`,
    );
  }
  // Signature (8) + chunk length (4) + chunk type (4) + IHDR data (13)
  // + chunk CRC (4) is the smallest space a PNG header can occupy.
  if (bytes.length < 33) {
    bail("the picture is too short to hold a PNG header");
  }
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) {
      bail("the picture does not open with the PNG signature");
    }
  }
  // A PNG always begins with an IHDR chunk carrying 13 data bytes, and
  // the picture's width and height are that chunk's first two fields.
  const headLength = bytes.readUInt32BE(8);
  const headType = bytes.toString("ascii", 12, 16);
  if (headType !== "IHDR" || headLength !== 13) {
    bail(
      `the first chunk is "${headType}" with ${headLength} data bytes, not the IHDR`,
    );
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== WANT_WIDTH || height !== WANT_HEIGHT) {
    bail(
      `the picture measures ${width}x${height}, not ${WANT_WIDTH}x${WANT_HEIGHT}`,
    );
  }
}

// A PNG is a chain of chunks, and every chunk ends with a CRC-32
// checksum (reflected polynomial 0xedb88320) taken over the chunk's
// type bytes followed by its data bytes. Checking each one proves the
// file is whole: no chunk is truncated, flipped or quietly corrupt.
const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Buffer, from: number, to: number): number {
  let crc = 0xffffffff;
  for (let i = from; i < to; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function walkChunks(bytes: Buffer): void {
  let offset = PNG_MAGIC.length;
  let sawEnd = false;
  while (offset < bytes.length) {
    // A chunk needs at least length (4) + type (4) + CRC (4) bytes.
    if (offset + 12 > bytes.length) {
      bail(`a chunk header at byte ${offset} runs past the end of the picture`);
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataEnd = offset + 8 + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.length) {
      bail(`the "${type}" chunk at byte ${offset} is cut short`);
    }
    const stored = bytes.readUInt32BE(dataEnd);
    const computed = crc32(bytes, offset + 4, dataEnd);
    if (stored !== computed) {
      bail(
        `the "${type}" chunk at byte ${offset} fails its checksum (stored ${stored}, computed ${computed})`,
      );
    }
    offset = chunkEnd;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) {
    bail("the picture has no IEND chunk, so it is not whole");
  }
  if (offset !== bytes.length) {
    bail(`${bytes.length - offset} stray byte(s) trail the IEND chunk`);
  }
}

function main(): void {
  const bytes = loadPicture();
  checkPicture(bytes);
  walkChunks(bytes);
  const outFolder = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outFolder, { recursive: true });
  const target = join(outFolder, "entry.png");
  writeFileSync(target, bytes);
  console.log(`entry: wrote ${bytes.length} bytes to ${target}`);
}

main();
