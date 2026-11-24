// Entry for make.fun news-image-20261124: one picture summing up the world
// news of Tuesday 24 November 2026.
//
// The picture is entry.png beside this file: a one-page broadsheet drawn
// programmatically with PIL, so every word renders exactly as written. This
// program checks that the file is a complete PNG inside the gate's limits
// and copies it to the output directory. No network, no inputs, and the
// same bytes come out on every run.
//
// Local run, standing in for the grader's /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const imagePath = new URL("./entry.png", import.meta.url);
const data = readFileSync(imagePath);

// A PNG starts with this fixed eight-byte signature.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const looksPng = PNG_SIGNATURE.every((byte, i) => data[i] === byte);
if (!looksPng) {
  throw new Error("entry.png is not a PNG");
}

// The gate caps the file at 1 MiB.
const ONE_MIB = 1024 * 1024;
if (data.length > ONE_MIB) {
  throw new Error(`entry.png is ${data.length} bytes, over the 1 MiB limit`);
}

// The gate also caps the frame at 1024 by 1024. A PNG carries its frame
// size in the IHDR chunk: the chunk type sits at bytes 12..15 and the
// width and height follow as big-endian words at bytes 16 and 20.
if (data.toString("ascii", 12, 16) !== "IHDR") {
  throw new Error("entry.png has a damaged PNG header");
}
const frameWidth = data.readUInt32BE(16);
const frameHeight = data.readUInt32BE(20);
if (frameWidth > 1024 || frameHeight > 1024) {
  throw new Error(
    `entry.png is ${frameWidth}x${frameHeight}, over the 1024x1024 limit`,
  );
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
// The output keeps the same name the gate expects: entry.png.
copyFileSync(imagePath, join(outDir, "entry.png"));
