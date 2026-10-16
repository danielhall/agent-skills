// Full-page reference screenshots with animations disabled, so scroll-reveal
// content is visible. Run from a project that has Playwright installed:
//   node ref-screenshots.mjs <baseUrl> <outDir> <width> /path-one /path-two ...
// e.g. node ref-screenshots.mjs http://localhost:3000 ./refs 1440 / /about
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [baseUrl, outDir, widthArg, ...paths] = process.argv.slice(2);

if (!baseUrl || !outDir || !widthArg || paths.length === 0) {
  console.error("usage: node ref-screenshots.mjs <baseUrl> <outDir> <width> <path...>");
  process.exit(1);
}

const width = Number(widthArg);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height: width < 768 ? 844 : 900 },
  reducedMotion: "reduce",
  colorScheme: "light",
});

for (const path of paths) {
  const page = await context.newPage();
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "networkidle" });
  // Let fonts settle and any non-motion effects finish.
  await page.waitForTimeout(1500);
  const name = path === "/" ? "home" : path.replace(/^\/|\/$/g, "").replaceAll("/", "-");
  const file = `${outDir}/${name}-${width}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${file}\t${height}px`);
  await page.close();
}

await browser.close();
