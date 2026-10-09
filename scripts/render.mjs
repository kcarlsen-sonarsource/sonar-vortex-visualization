// Frame-by-frame export (not a screen recording): every frame is rendered at an exact
// timestamp t = i / FPS via window.__vx.frame(t), captured, and piped into ffmpeg.
//
//   node scripts/render.mjs                        → out/sonar-vortex-1080p60.mp4 (master)
//   node scripts/render.mjs --layers               → master + editable layers in out/layers/:
//        plate (3D scene, no typography; H.264) and text layer (typography/labels/scrims, alpha; QuickTime Animation)
//   options: --workers 4  --fps 60  --from <s>  --to <s>  --outdir out  --chunk 300 (frames)
//            --fresh (discard finished chunks)  --keep (keep chunks after concat)
//   Interrupted renders resume: finished chunks in <outdir>/.segments are reused.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { startStaticServer, launch, openStage, shootLayers } from './browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = +arg('--fps', 60);
const WORKERS = +arg('--workers', 4);
const OUTDIR = arg('--outdir', 'out');
const LAYERS = process.argv.includes('--layers') ? ['full', 'plate', 'text'] : ['full'];

const x264 = (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
  '-x264-params', `keyint=${FPS * 2}:min-keyint=${FPS}:aq-mode=3:aq-strength=0.9`, '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
const OUTPUTS = {
  full: { file: `${OUTDIR}/sonar-vortex-1080p60.mp4`, ext: 'mp4', codec: x264(17) },
  plate: { file: `${OUTDIR}/layers/sonar-vortex_plate-no-text_1080p60.mp4`, ext: 'mp4', codec: x264(15) },
  // QuickTime Animation: lossless RGBA, imports natively in After Effects / Premiere / Final Cut.
  text: { file: `${OUTDIR}/layers/sonar-vortex_text-layer-alpha_1080p60.mov`, ext: 'mov', codec: ['-c:v', 'qtrle', '-pix_fmt', 'argb'] },
};
mkdirSync(`${OUTDIR}/layers`, { recursive: true });
// Work is split into short chunks; finished chunks persist in .segments so an interrupted render resumes.
const tmp = `${OUTDIR}/.segments`;
if (process.argv.includes('--fresh')) rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const CHUNK = +arg('--chunk', 300);

// Long renders stall if the Mac idles (Chromium stops producing frames), so keep it awake while we run.
if (process.platform === 'darwin') spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();

const { server, url } = await startStaticServer();
const probe = await launch();
const p0 = await openStage(probe, url);
const total = await p0.evaluate(() => window.__vx.total);
await probe.close();
const from = +arg('--from', 0), to = +arg('--to', total);
const first = Math.round(from * FPS), last = Math.round(to * FPS); // [first, last)
const N = last - first;
const chunks = [];
for (let a = first; a < last; a += CHUNK) chunks.push({ a, b: Math.min(last, a + CHUNK) });
const segName = (c, l) => `${tmp}/${l}_${String(c.a).padStart(6, '0')}-${String(c.b).padStart(6, '0')}.${OUTPUTS[l].ext}`;
const todo = chunks.filter((c) => !LAYERS.every((l) => existsSync(segName(c, l))));
console.log(`Rendering ${N} frames (${(N / FPS).toFixed(2)}s) at ${FPS}fps → ${LAYERS.join(', ')}; ${chunks.length - todo.length}/${chunks.length} chunks already done`);

const t0 = Date.now();
let done = 0;
const todoFrames = todo.reduce((n, c) => n + c.b - c.a, 0);

async function renderChunk(page, c) {
  const encs = {};
  for (const l of LAYERS) {
    const part = `${segName(c, l)}.part.${OUTPUTS[l].ext}`;
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...OUTPUTS[l].codec, '-r', String(FPS), part], { stdio: ['pipe', 'inherit', 'inherit'] });
    encs[l] = { ff, part, closed: new Promise((r) => ff.on('close', r)) };
  }
  try {
    for (let i = c.a; i < c.b; i++) {
      // Hard timeout: a stalled page can hang inside evaluate/rAF where Playwright has no timeout.
      const shots = await Promise.race([
        shootLayers(page, i / FPS, LAYERS),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`frame ${i} timed out`)), 120000)),
      ]);
      for (const l of LAYERS) if (!encs[l].ff.stdin.write(shots[l])) await new Promise((r) => encs[l].ff.stdin.once('drain', r));
      if (++done % 300 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${todoFrames} frames, ${(done / el).toFixed(1)} fps, ETA ${((todoFrames - done) / (done / el) / 60).toFixed(1)} min`);
      }
    }
  } catch (e) {
    for (const l of LAYERS) encs[l].ff.kill('SIGKILL');
    throw e;
  }
  for (const l of LAYERS) encs[l].ff.stdin.end();
  const codes = await Promise.all(LAYERS.map((l) => encs[l].closed));
  if (codes.some((x) => x !== 0)) throw new Error(`ffmpeg failed for chunk ${c.a}`);
  for (const l of LAYERS) renameSync(encs[l].part, segName(c, l));
}

const queue = [...todo];
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
  let browser = await launch();
  let page = await openStage(browser, url);
  while (queue.length) {
    const c = queue.shift();
    for (let attempt = 1; ; attempt++) {
      try {
        await renderChunk(page, c);
        break;
      } catch (e) {
        console.log(`chunk ${c.a}-${c.b} failed (attempt ${attempt}): ${e.message.split('\n')[0]}`);
        if (attempt >= 4) throw e;
        await browser.close().catch(() => {});
        browser = await launch();
        page = await openStage(browser, url);
      }
    }
  }
  await browser.close();
}));

for (const l of LAYERS) {
  const list = `${tmp}/list_${l}.txt`;
  writeFileSync(list, chunks.map((c) => `file '${segName(c, l).split('/').pop()}'`).join('\n'));
  const extra = OUTPUTS[l].ext === 'mp4' ? ['-movflags', '+faststart'] : [];
  const code = await new Promise((r) => spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', ...extra, OUTPUTS[l].file], { stdio: 'inherit' }).on('close', r));
  if (code !== 0) throw new Error(`concat failed for ${l}`);
  console.log(`Wrote ${OUTPUTS[l].file}`);
}
if (!process.argv.includes('--keep')) rmSync(tmp, { recursive: true, force: true });
console.log(`Done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
await server.close();
