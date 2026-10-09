// Frame-by-frame export (not a screen recording): every frame is rendered at an exact
// timestamp t = i / FPS via window.__vx.frame(t), captured, and piped into ffmpeg.
//
//   node scripts/render.mjs                        → out/sonar-vortex-1080p60.mp4 (master)
//   node scripts/render.mjs --layers               → master + editable layers in out/layers/:
//        plate (3D scene, no typography; H.264) and text layer (typography/labels/scrims, alpha; QuickTime Animation)
//   options: --workers 4  --fps 60  --from <s>  --to <s>  --outdir out
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
const tmp = `${OUTDIR}/.segments`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const { server, url } = await startStaticServer();
const probe = await launch();
const p0 = await openStage(probe, url);
const total = await p0.evaluate(() => window.__vx.total);
await probe.close();
const from = +arg('--from', 0), to = +arg('--to', total);
const first = Math.round(from * FPS), last = Math.round(to * FPS); // [first, last)
const N = last - first;
console.log(`Rendering ${N} frames (${(N / FPS).toFixed(2)}s) at ${FPS}fps with ${WORKERS} workers → ${LAYERS.join(', ')}`);

const t0 = Date.now();
let done = 0;
const per = Math.ceil(N / WORKERS);
const jobs = [];
for (let w = 0; w < WORKERS; w++) {
  const a = first + w * per, b = Math.min(last, a + per);
  if (a >= b) continue;
  jobs.push((async () => {
    const browser = await launch();
    const page = await openStage(browser, url);
    const encs = {};
    for (const l of LAYERS) {
      const seg = `${tmp}/${l}_${String(w).padStart(2, '0')}.${OUTPUTS[l].ext}`;
      const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...OUTPUTS[l].codec, '-r', String(FPS), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
      encs[l] = { ff, seg, closed: new Promise((r) => ff.on('close', r)) };
    }
    for (let i = a; i < b; i++) {
      const shots = await shootLayers(page, i / FPS, LAYERS);
      for (const l of LAYERS) if (!encs[l].ff.stdin.write(shots[l])) await new Promise((r) => encs[l].ff.stdin.once('drain', r));
      done++;
      if (done % 300 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${N} frames, ${(done / el).toFixed(1)} fps, ETA ${((N - done) / (done / el) / 60).toFixed(1)} min`);
      }
    }
    for (const l of LAYERS) encs[l].ff.stdin.end();
    await Promise.all(LAYERS.map((l) => encs[l].closed));
    await browser.close();
    return Object.fromEntries(LAYERS.map((l) => [l, encs[l].seg]));
  })());
}
const segs = await Promise.all(jobs);
for (const l of LAYERS) {
  const list = `${tmp}/list_${l}.txt`;
  writeFileSync(list, segs.map((s) => `file '${s[l].split('/').pop()}'`).join('\n'));
  const extra = OUTPUTS[l].ext === 'mp4' ? ['-movflags', '+faststart'] : [];
  await new Promise((r) => spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', ...extra, OUTPUTS[l].file], { stdio: 'inherit' }).on('close', r));
  console.log(`Wrote ${OUTPUTS[l].file}`);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`Done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
await server.close();
