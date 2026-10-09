// Shared helpers: start Vite, launch Chromium, open the stage in deterministic render mode.
import { chromium } from 'playwright';
import { createServer, build, preview } from 'vite';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const CACHED = `${homedir()}/Library/Caches/ms-playwright/chromium-1134/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;

export async function startServer() {
  const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  return { server, url };
}

/** Build to an isolated dir and serve it statically (no HMR), so edits can't disturb a long render. */
export async function startStaticServer(outDir = 'out/.render-build') {
  await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
  const server = await preview({ build: { outDir }, preview: { port: 5196, strictPort: false }, logLevel: 'error' });
  const url = server.resolvedUrls.local[0];
  return { server: { close: () => new Promise((r) => server.httpServer.close(r)) }, url };
}

export async function launch() {
  const opts = {
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-color-profile=srgb'],
  };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else if (existsSync(CACHED)) opts.executablePath = CACHED;
  return chromium.launch(opts);
}

export async function openStage(browser, url, layer = 'full') {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (!m.text().includes('createShapes')) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${url}?render=1&layer=${layer}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__vx, null, { timeout: 60000 });
  await page.evaluate(() => window.__vx.ready());
  return page;
}

export async function shoot(page, t, opts = {}) {
  await page.evaluate((t) => { window.__vx.frame(t); window.__vx.renderer.getContext().finish(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
  return page.screenshot({ type: opts.type || 'png', quality: opts.quality, omitBackground: !!opts.alpha, clip: { x: 0, y: 0, width: 1920, height: 1080 }, animations: 'disabled', caret: 'hide' });
}

const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Render frame t once, then capture each requested layer ('full' | 'plate' | 'text') from the same GPU frame. */
export async function shootLayers(page, t, layers) {
  await page.evaluate(async (t) => {
    window.__vx.layer('full');
    window.__vx.frame(t);
    window.__vx.renderer.getContext().finish();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  const out = {};
  for (const l of layers) {
    if (l !== 'full') await page.evaluate(async (l) => { window.__vx.layer(l); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, l);
    out[l] = await page.screenshot({ type: 'png', omitBackground: l === 'text', clip: { x: 0, y: 0, width: 1920, height: 1080 }, animations: 'disabled', caret: 'hide' });
  }
  return out;
}

