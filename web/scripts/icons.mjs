// Renders the PNG icons and the social card from the SVGs in assets/.
// Run with `npm run icons` after changing any of them.

import { readFile, writeFile } from "node:fs/promises";

import { Resvg } from "@resvg/resvg-js";

const jobs = [
  ["icon.svg", "icon-512.png", 512],
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "apple-touch-icon.png", 180],
  ["maskable.svg", "icon-maskable.png", 512],
  ["social.svg", "social.png", 1200],
];

for (const [source, target, width] of jobs) {
  const svg = await readFile(new URL(`../assets/${source}`, import.meta.url));
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI" },
  })
    .render()
    .asPng();
  await writeFile(new URL(`../public/${target}`, import.meta.url), png);
  console.log(`${target}  ${png.length} bytes`);
}
