import '@fontsource-variable/inter';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sramp, clamp } from './util.js';
import { Labels, W, H } from './overlay.js';
import { Backdrop } from './world/backdrop.js';
import { Agent } from './world/agent.js';
import { City } from './world/city.js';
import { Cards } from './world/cards.js';
import { VortexField, VortexMark, ScanRing } from './world/vortex.js';
import { Gate, Streams } from './world/gate.js';
import { COLORS } from './world/common.js';
import { buildStory } from './story.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
// Optional layered export for editors: 'plate' = 3D scene only, 'text' = typography/labels on transparent alpha.
let LAYER = RENDER ? params.get('layer') || 'full' : 'full';
if (RENDER) document.body.classList.add('render');

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const blackout = document.getElementById('blackout');

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: RENDER });
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = COLORS.bg.clone();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(4, 6, 8);
const rim = new THREE.DirectionalLight(0x4f9cf0, 2.0);
rim.position.set(-6, 2, -6);
scene.add(key, rim, new THREE.AmbientLight(0x1a2a44, 0.6));

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
// Guard: a single NaN/Inf pixel would otherwise be smeared across the frame by the bloom blur.
composer.addPass(
  new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv);
        bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
        if (any(bad)) c = vec4(0.0, 0.0, 0.0, 1.0);
        gl_FragColor = vec4(min(c.rgb, vec3(64.0)), c.a); }`,
  })
);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.42, 0.3);
composer.addPass(bloom);
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSeed; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5; q.x *= 1.35;
      float vig = smoothstep(0.95, 0.25, length(q));
      c.rgb *= mix(0.55, 1.0, vig);
      c.rgb += (hash(vUv * 1000.0) - 0.5) * 0.005;
      gl_FragColor = c;
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

function setPixelRatio(pr) {
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
}

// ------------------------------------------------------------------ world
const hideables = [];
const add = (obj) => {
  scene.add(obj);
  hideables.push(obj);
  return obj;
};
const world = { scene, hideables };
world.backdrop = new Backdrop();
scene.add(world.backdrop.group);
world.agent = new Agent();
add(world.agent.group);
world.city = new City();
add(world.city.group);
world.cards = new Cards(64);
add(world.cards.group);
world.field = new VortexField();
add(world.field.group);
const markSvg = await (await fetch('assets/vortex-mark.svg')).text();
world.mark = new VortexMark(markSvg);
add(world.mark.group);
world.ring = new ScanRing(2.0);
add(world.ring.group);
world.gate = new Gate();
add(world.gate.group);
world.makeStreams = (srcs) => {
  const s = new Streams(srcs);
  add(s.points);
  return s;
};

const labelsRoot = document.getElementById('labels');
const overlayRoot = document.getElementById('overlay');
const labels = new Labels(labelsRoot, camera);
const cam = (pos, look) => {
  camera.position.set(pos[0] ?? pos.x, pos[1] ?? pos.y, pos[2] ?? pos.z);
  camera.lookAt(look[0] ?? look.x, look[1] ?? look.y, look[2] ?? look.z);
  camera.updateMatrixWorld();
};
const chapters = buildStory({ world, cam, labels, root: overlayRoot });
let acc = 0;
for (const c of chapters) {
  c.fadeIn ??= 0.6;
  c.fadeOut ??= 0.6;
  c.start = acc;
  acc += c.dur;
}
const TOTAL = acc;

// ------------------------------------------------------------------ frame
let lastBlack = 0;
/** Switch what the page shows without re-rendering WebGL (the canvas keeps its last frame). */
function applyLayer() {
  const cl = document.body.classList;
  cl.toggle('layer-plate', LAYER === 'plate');
  cl.toggle('layer-text', LAYER === 'text');
  document.documentElement.style.background = LAYER === 'text' ? 'transparent' : '';
  // In the text layer the dip-to-black darkens colour but keeps alpha, so a plain "Normal" composite
  // over the plate reproduces the master exactly (fading alpha instead would double-count the fade).
  const f = LAYER === 'text' ? `brightness(${(1 - lastBlack).toFixed(4)})` : '';
  labelsRoot.style.filter = f;
  overlayRoot.style.filter = f;
}
function renderState(ci, lt, amb, extraBlack = 0) {
  const ch = chapters[ci];
  for (const o of hideables) o.visible = false;
  labels.begin();
  chapters.forEach((c, i) => i !== ci && c.text.hide());
  world.mark.group.rotation.set(0, 0, 0);
  ch.update(lt, amb);
  labels.end();
  let b = 0;
  if (ch.fadeIn > 0) b = Math.max(b, 1 - sramp(lt, 0, ch.fadeIn));
  if (ch.fadeOut > 0) b = Math.max(b, sramp(lt, ch.dur - ch.fadeOut, ch.dur));
  b = Math.max(b, extraBlack);
  lastBlack = b;
  applyLayer();
  if (LAYER === 'text') return; // typography-only layer needs no WebGL frame
  blackout.style.opacity = b.toFixed(4);
  finish.uniforms.uSeed.value = (amb * 60) % 97;
  composer.render();
}

function locate(t) {
  t = clamp(t, 0, TOTAL - 1e-6);
  for (let i = chapters.length - 1; i >= 0; i--) if (t >= chapters[i].start) return [i, t - chapters[i].start];
  return [0, t];
}

async function assetsReady() {
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
}

// ------------------------------------------------------------------ render mode API (used by scripts/*.mjs)
window.__vx = {
  world, bloom, renderer, THREE, composer, finish, scene, camera,
  total: TOTAL,
  chapters: chapters.map((c) => ({ id: c.id, name: c.name, start: c.start, dur: c.dur })),
  async ready() {
    await assetsReady();
    // Warm up every chapter so all shader programs are compiled before capture.
    for (const c of chapters) for (const f of [0.3, 0.5, 0.75]) renderState(chapters.indexOf(c), c.dur * f, c.start + c.dur * f);
    renderState(0, 0, 0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  },
  /** Show 'full' | 'plate' | 'text' for the frame already rendered (no WebGL re-render). */
  layer(mode) {
    LAYER = mode;
    applyLayer();
    return true;
  },
  /** Render the exact frame for global time t (seconds). */
  frame(t) {
    const [i, lt] = locate(t);
    renderState(i, lt, t);
    return true;
  },
};

// ------------------------------------------------------------------ presenter mode
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  if (!RENDER) setPixelRatio(clamp(s * devicePixelRatio, 0.75, 1.5));
}
addEventListener('resize', fit);
fit();
if (RENDER) setPixelRatio(1);

if (!RENDER) {
  await assetsReady();
  const startAt = params.has('t') ? locate(parseFloat(params.get('t'))) : [parseInt(params.get('c') || '0', 10), 0];
  const st = { ci: startAt[0], lt: startAt[1], auto: params.has('auto'), exiting: false, jb: 0, amb: 0 };
  const dots = document.getElementById('dots');
  chapters.forEach((c, i) => {
    const b = document.createElement('button');
    b.title = `${i + 1}. ${c.name}`;
    b.onclick = (e) => {
      e.stopPropagation();
      go(i);
    };
    dots.appendChild(b);
  });
  const hud = document.getElementById('hud');
  let hudTimer;
  const showHud = () => {
    hud.classList.add('show');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud.classList.remove('show'), 2500);
  };
  addEventListener('mousemove', showHud);
  showHud();

  const hold = (c) => c.hold ?? (c.fadeOut > 0 ? c.dur - c.fadeOut : c.dur);
  function go(i) {
    st.ci = (i + chapters.length) % chapters.length;
    st.lt = 0;
    st.exiting = false;
    st.jb = chapters[st.ci].fadeIn > 0 ? 0 : 1;
  }
  function next() {
    const c = chapters[st.ci];
    if (st.exiting) return go(st.ci + 1);
    st.exiting = true;
    st.early = st.lt < hold(c) - 0.05;
  }
  function prev() {
    go(st.lt > 1.5 ? st.ci : st.ci - 1);
  }
  addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) next();
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) prev();
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(chapters.length - 1);
    else if (e.key === 'a' || e.key === 'A') st.auto = !st.auto;
    else if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else if (/^[0-9]$/.test(e.key)) go(parseInt(e.key, 10) === 0 ? 9 : parseInt(e.key, 10) - 1);
    else return;
    e.preventDefault();
  });
  document.getElementById('viewport').addEventListener('click', next);

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    st.amb += dt;
    const c = chapters[st.ci];
    if (st.auto && !st.exiting) {
      st.lt += dt;
      if (st.lt >= c.dur) go(st.ci + 1);
    } else if (st.exiting) {
      if (st.early) {
        // fade out from wherever we are, then move on
        st.lt += dt;
        st.jb = Math.min(1, st.jb + dt / 0.45);
        if (st.jb >= 1) {
          go(st.ci + 1);
          st.jb = 1;
        }
      } else {
        st.lt += dt;
        if (st.lt >= c.dur) {
          const wasSeamless = c.fadeOut === 0;
          go(st.ci + 1);
          if (wasSeamless) st.jb = 0;
        }
      }
    } else {
      st.lt = Math.min(st.lt + dt, hold(c));
      st.jb = Math.max(0, st.jb - dt / 0.4);
    }
    if (!st.exiting) st.jb = Math.max(0, st.jb - dt / 0.4);
    [...dots.children].forEach((b, i) => b.classList.toggle('on', i === st.ci));
    renderState(st.ci, Math.min(st.lt, chapters[st.ci].dur - 1e-4), st.amb, st.jb);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
