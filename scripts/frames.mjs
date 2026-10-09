// Render exact frames to disk for inspection.
// Usage: node scripts/frames.mjs [--out frames] t1 t2 ...   |  --chapter <id> [--step 1]  |  --all [--step 2]
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer, launch, openStage, shoot } from './browser.mjs';

const args = process.argv.slice(2);
let out = 'frames';
let step = 1;
let chapter = null;
let all = false;
let layer = 'full';
const times = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--step') step = parseFloat(args[++i]);
  else if (args[i] === '--chapter') chapter = args[++i];
  else if (args[i] === '--all') all = true;
  else if (args[i] === '--layer') layer = args[++i];
  else times.push(parseFloat(args[i]));
}
mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launch();
const page = await openStage(browser, url, layer);
const meta = await page.evaluate(() => ({ total: window.__vx.total, chapters: window.__vx.chapters }));
if (chapter || all) {
  for (const c of meta.chapters) {
    if (!all && c.id !== chapter) continue;
    for (let lt = 0.25; lt < c.dur; lt += step) times.push(+(c.start + lt).toFixed(3));
  }
}
const t0 = Date.now();
for (const t of times) {
  const c = [...meta.chapters].reverse().find((c) => t >= c.start) || meta.chapters[0];
  const name = `${out}/${String(t.toFixed(2)).padStart(7, '0')}_${c.id}_${(t - c.start).toFixed(2)}.png`;
  writeFileSync(name, await shoot(page, t, { alpha: layer === 'text' }));
  console.log(name);
}
console.log(`total=${meta.total}s, ${times.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(meta.chapters.map((c) => [c.id, c.start, c.dur])));
await browser.close();
await server.close();
