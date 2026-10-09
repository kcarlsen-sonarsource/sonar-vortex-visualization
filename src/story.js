import * as THREE from 'three';
import {
  clamp, lerp, ramp, sramp, smoother, easeOutCubic, easeInOutCubic, easeInCubic, easeOutBack, win, pulse, mulberry32, keyed,
} from './util.js';
import { ChapterText } from './overlay.js';
import { COLORS, Beam, glowSprite } from './world/common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const qbez = (a, c, b, t) => {
  const u = 1 - t;
  return V(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
};
const SCRIM = '<div class="scrim" style="position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 18% 14%, rgba(1,6,13,0.78), rgba(1,6,13,0) 70%)"></div>';
const CORNER = '<img class="brand-corner" src="assets/sonar-logo-white.svg" alt="Sonar">';

/** Build every chapter. Each chapter's update(lt, amb) is a pure function of time. */
export function buildStory(ctx) {
  const { world, cam, labels, root } = ctx;
  const { backdrop, agent, city, cards, field, mark, ring, gate } = world;

  const text = (spec) => new ChapterText(root, spec);
  const setCam = (lt, keys) => cam(keyed(lt, keys, 'pos'), keyed(lt, keys, 'look'));

  // ---------------------------------------------------------------- shared helpers
  const extraBeams = Array.from({ length: 10 }, () => {
    const b = new Beam(COLORS.accentHi, 0.02);
    world.scene.add(b.mesh);
    world.hideables.push(b.mesh);
    return b;
  });
  const sparks = Array.from({ length: 16 }, () => {
    const s = glowSprite(COLORS.ice.clone(), 0.6, 0);
    world.scene.add(s);
    world.hideables.push(s);
    return s;
  });
  const spot = glowSprite(COLORS.warn.clone(), 2.2, 0);
  world.scene.add(spot);
  world.hideables.push(spot);

  // A closed loop path for Guide → Verify → Solve
  const loopCurve = (() => {
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(V(-2.75 + Math.cos(a) * 4.3, 1.5 + Math.sin(a) * 0.0, -Math.sin(a) * 2.6));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  })();
  const loopMat = new THREE.MeshBasicMaterial({ color: COLORS.accentHi.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const loopMesh = new THREE.Mesh(new THREE.TubeGeometry(loopCurve, 256, 0.03, 8, true), loopMat);
  world.scene.add(loopMesh);
  world.hideables.push(loopMesh);

  // ================================================================ 0 · TITLE
  const tTitle = text({
    layout: 'none',
    extra: `
      <div class="scrim" style="position:absolute;inset:0;background:linear-gradient(0deg, rgba(1,6,13,0.88) 0%, rgba(1,6,13,0.55) 32%, rgba(1,6,13,0) 55%)"></div>
      <img class="lockup wordmark" src="assets/vortex-wordmark-white.svg" style="top:610px;width:600px" alt="Sonar Vortex">
      <div class="headline-block center" style="top:790px"><div class="subline tsub" style="margin:0;font-size:38px;color:#c9d4e6">Make your AI coding agents more efficient</div></div>`,
  });
  const title = {
    id: 'title', name: 'Title', dur: 12, fadeIn: 1.6,
    text: tTitle,
    update(lt, amb) {
      setCam(lt, [
        { t: 0, pos: [0, 0.6, 12.5], look: [0, 1.2, 0] },
        { t: 12, pos: [0, 0.9, 10.6], look: [0, 1.25, 0] },
      ]);
      backdrop.update(amb, { glow: 1.1, glowDir: V(0, 0.15, -1) });
      field.group.position.set(0, 2.1, -2.2);
      field.group.rotation.set(1.2, 0, 0);
      field.update(amb, { opacity: 0.95, radius: 7.5, funnel: 1.8, form: sramp(lt, 0.2, 5.2), spin: 0.8, eye: 0 });
      mark.group.position.set(0, 2.5, 0);
      mark.update(amb, { size: 2.0, assemble: ramp(lt, 1.0, 4.4), spin: 0.12, glow: 0.45 + pulse(lt, 4.6, 0.5) * 0.6 });
      tTitle.el.style.opacity = 1;
      const wm = tTitle.q('.wordmark');
      const k = easeOutCubic(ramp(lt, 4.4, 5.6));
      wm.style.opacity = k;
      wm.style.transform = `translateX(-50%) translateY(${(1 - k) * 24}px)`;
      const s = easeOutCubic(ramp(lt, 5.4, 6.6));
      const sub = tTitle.q('.tsub');
      sub.style.opacity = s;
      sub.style.transform = `translateY(${(1 - s) * 18}px)`;
    },
  };

  // ================================================================ 1 · SPEED
  const t1 = text({ kicker: 'AI coding agents', headline: 'Agents now write code at [[machine speed.]]', extra: SCRIM + CORNER });
  labels.make('agent1', 'AI coding agent', 'plain');
  const wallSlots = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) wallSlots.push(V(-6.4 + c * 2.95, -4.4 + r * 2.2, -6 + Math.abs(c - 4) * 0.3));
  const order = (() => {
    const rnd = mulberry32(11);
    const a = wallSlots.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  })();
  const nWall = wallSlots.length;
  const spawnAt = (n) => 1.8 + 8.2 * Math.pow(n / nWall, 0.62);
  const speed = {
    id: 'speed', name: 'Machine speed', dur: 14,
    text: t1,
    update(lt, amb) {
      setCam(lt, [
        { t: 0, pos: [1.0, 0.9, 9.5], look: [2.2, 1.1, 0] },
        { t: 14, pos: [-1.2, 1.6, 15.5], look: [2.6, 2.1, -1.5] },
      ]);
      backdrop.update(amb, { glow: 0.8, glowDir: V(0.2, 0.1, -1) });
      const ap = V(1.2, 0.0, 1.5);
      agent.group.position.copy(ap);
      const rate = clamp((lt - 1.8) / 8);
      agent.update(amb, { scale: easeOutBack(ramp(lt, 0.3, 1.3)), energy: 0.8 + rate * 0.8, pulse: 0 });
      labels.set('agent1', ap.clone().add(V(0, -1.35, 0)), win(lt, 1.0, 6.5, 0.6, 0.8), { anchor: 'b' });
      cards.begin();
      const landed = [], flying = [];
      for (let n = 0; n < nWall; n++) {
        const s = spawnAt(n);
        if (lt < s) break;
        const k = clamp((lt - s) / 1.5);
        const slot = wallSlots[order[n]];
        const ctrl = ap.clone().lerp(slot, 0.5).add(V(0, 2.2, 3));
        const e = easeInOutCubic(k);
        const pos = qbez(ap, ctrl, slot, e);
        const o = {
          pos,
          rot: [0, lerp(0.6, 0, e), lerp(-0.3, 0, e)],
          scale: lerp(0.15, 0.92, easeOutCubic(k)),
          opacity: clamp(k * 4),
          reveal: clamp((lt - s) / 2.2),
          borderAmt: (1 - k) * 0.8,
          border: COLORS.accentHi,
        };
        (k >= 1 ? landed : flying).push([n, o]);
      }
      for (const [n, o] of landed) cards.card(n, o);
      for (const [n, o] of flying) cards.card(n, o);
      cards.end();
      t1.animate(lt, 0.6);
    },
  };

  // ================================================================ 2 · BLIND
  const t2 = text({
    kicker: 'The problem',
    headline: "But they don't know {{your project.}}",
    extra: SCRIM + CORNER + `
      <div class="scrim meter-scrim sm2"></div>
      <div class="meter m2"><div class="cap"><span>TOKENS SPENT EXPLORING</span></div><div class="track"><div class="fill"></div></div></div>`,
  });
  labels.make('grep', 'grep · find · glob · read', 'plain');
  labels.make('codebase2', 'Your codebase', 'plain');
  const hopRnd = mulberry32(3);
  const hops = [];
  {
    let t = 2.2;
    while (t < 17.4) {
      const x = Math.floor(hopRnd() * city.nx), z = Math.floor(hopRnd() * city.nz);
      hops.push({ t, i: city.index(x, z) });
      t += 0.5 - Math.min(0.28, (t - 2.2) * 0.022);
    }
  }
  const blind = {
    id: 'blind', name: "Doesn't know your project", dur: 18,
    text: t2,
    update(lt, amb) {
      const a = lerp(0.62, 0.92, easeInOutCubic(lt / 18));
      const R = 17.5;
      cam(V(Math.sin(a) * R, lerp(9.4, 8.8, lt / 18), Math.cos(a) * R), V(2.5, 2.2, 0.5));
      backdrop.update(amb, { glow: 0.6, glowDir: V(-0.5, 0.0, -1) });
      city.group.position.set(1.5, 0, 0);
      city.clearGlow();
      const ap = V(5.0, 4.0, 1.0);
      agent.group.position.copy(ap);
      agent.update(amb, { scale: easeOutBack(ramp(lt, 1.0, 1.8)), energy: 0.8, tint: COLORS.agent });
      // current & past hops
      let cur = null;
      for (const h of hops) {
        if (h.t > lt) break;
        const age = lt - h.t;
        city.setGlow(h.i, Math.max(0, 1 - age / 3.5) * 0.9 + (age < 0.5 ? 0.6 : 0), COLORS.warn);
        cur = h;
      }
      city.update({ reveal: sramp(lt, 0.3, 2.6) });
      if (cur) {
        const tgt = city.top(cur.i);
        const age = lt - cur.t;
        extraBeams[0].set(ap, tgt, { progress: easeOutCubic(age / 0.14), opacity: 0.9, time: amb, pulse: 0, color: COLORS.warn });
        spot.position.copy(tgt).add(V(0, 0.15, 0));
        spot.material.opacity = 0.65 * (1 - clamp(age / 0.5) * 0.4);
        spot.material.color.copy(COLORS.warn);
        spot.scale.setScalar(1.8);
        spot.visible = true;
      }
      labels.set('grep', ap.clone(), win(lt, 2.6, 19, 0.6, 0.6), { anchor: 'l', dx: 165 });
      labels.set('codebase2', V(1.5 + 4, 0, 8.4), win(lt, 2.0, 8.5, 0.8, 0.8), { anchor: 'c' });
      t2.animate(lt, 0.6);
      const fill = t2.q('.fill');
      const m = clamp((lt - 2.2) / 14.5);
      fill.style.transform = `scaleX(${(0.02 + 0.98 * Math.pow(m, 0.85)).toFixed(4)})`;
      t2.q('.m2').style.opacity = t2.q('.sm2').style.opacity = sramp(lt, 2.0, 2.8);
    },
  };

  // ================================================================ 3 · LATE
  const t3 = text({ kicker: 'The problem', headline: 'Their mistakes surface {{late,}} at the pull request.', extra: SCRIM + CORNER });
  labels.make('pr3', 'Pull request', 'plain');
  labels.make('fail3', '<span class="dot"></span>Quality gate failed', 'err');
  labels.make('iss0', 'Layer violation', 'err');
  labels.make('iss1', 'Hard-coded secret', 'err');
  labels.make('iss2', 'Unapproved library', 'err');
  labels.make('rework', 'Rework', 'plain');
  const AP3 = V(-4.6, 0.4, 2.0);
  const GP3 = V(4.4, 1.4, -3.2);
  const BACK3 = V(0, -1.6, 1.2);
  const late = {
    id: 'late', name: 'Mistakes surface late', dur: 18,
    text: t3,
    update(lt, amb) {
      setCam(lt, [
        { t: 0, pos: [-0.5, 2.6, 13.5], look: [0.2, 1.9, -0.6] },
        { t: 18, pos: [1.0, 3.0, 12.6], look: [0.4, 2.0, -0.6] },
      ]);
      backdrop.update(amb, { glow: 0.7, glowDir: V(0.3, 0.1, -1) });
      agent.group.position.copy(AP3);
      agent.update(amb, { scale: easeOutBack(ramp(lt, 0.4, 1.3)), energy: 0.9 });
      gate.group.position.copy(GP3);
      gate.group.rotation.set(0, -0.38, 0);
      gate.group.scale.setScalar(1);
      // three cards cycle agent → gate → back (rework)
      let failAmt = 0, shake = 0;
      cards.begin();
      const issues = [[3], [6, 8], [2]];
      for (let c = 0; c < 3; c++) {
        const s = 1.6 + c * 2.9;
        const k1 = clamp((lt - s) / 2.0); // to gate
        const k2 = clamp((lt - s - 2.3) / 2.2); // back to agent
        if (lt < s) continue;
        const hitT = s + 2.0;
        failAmt = Math.max(failAmt, pulse(lt, hitT + 0.2, 0.55));
        shake = Math.max(shake, Math.max(0, 1 - Math.abs(lt - hitT - 0.15) / 0.35));
        let pos, rot, scale, op = 1;
        if (k2 <= 0) {
          const e = easeInOutCubic(k1);
          pos = qbez(AP3.clone().add(V(0.8, 0.3, 0)), V(-0.5, 2.4, 0), GP3.clone().add(V(0, 0, 0.25)), e);
          rot = [0, lerp(0.3, -0.38, e), 0];
          scale = lerp(0.45, 1.15, Math.sin(e * Math.PI) * 0.6 + e * 0.4);
        } else {
          const e = easeInOutCubic(k2);
          pos = qbez(GP3.clone().add(V(0, 0, 0.25)), BACK3, AP3.clone().add(V(0.6, 0.1, -0.4)), e);
          rot = [0, lerp(-0.38, 0.3, e), 0];
          scale = lerp(1.15, 0.35, e);
          op = 1 - sramp(k2, 0.85, 1);
        }
        const bad = issues[c];
        cards.card(10 + c, {
          pos, rot, scale, opacity: op * clamp((lt - s) * 4),
          reveal: clamp((lt - s) / 1.4),
          border: COLORS.error,
          borderAmt: clamp((lt - hitT) * 3),
          lineColor: (l) => (bad.includes(l) ? { color: COLORS.error, amt: clamp((lt - hitT + 0.2) * 3) * 0.95, boost: 0.4 * clamp((lt - hitT) * 3) } : null),
        });
      }
      cards.end();
      const failState = clamp((lt - 3.6) * 4) * (0.35 + 0.65 * failAmt);
      gate.update(amb, { state: 'fail', amt: failState, icon: easeOutBack(ramp(lt, 3.6, 4.0)) * (lt > 3.6 ? 1 : 0) * 0.85, shake });
      // rework arc trace
      const arcOp = win(lt, 4.4, 19, 0.8, 0.6) * 0.7;
      const arcPts = [];
      for (let i = 0; i <= 8; i++) arcPts.push(qbez(GP3, BACK3, AP3, i / 8));
      for (let i = 0; i < 8; i++) {
        extraBeams[i].set(arcPts[i], arcPts[i + 1], { opacity: arcOp * 0.5, time: amb, pulse: 1, color: COLORS.error });
      }
      labels.set('rework', qbez(GP3, BACK3, AP3, 0.5), arcOp * 1.3, { anchor: 'b', dy: 22 });
      labels.set('pr3', GP3.clone().add(V(0, 2.55, 0)), sramp(lt, 1.0, 1.8), { anchor: 't' });
      labels.set('fail3', GP3.clone().add(V(0, -2.5, 0)), sramp(lt, 3.8, 4.4), { anchor: 'b' });
      ['iss0', 'iss1', 'iss2'].forEach((id, i) => {
        const p = GP3.clone().add(V(2.0, 1.25 - i * 0.95, 0.6));
        const k = easeOutCubic(ramp(lt, 4.0 + i * 0.35, 4.6 + i * 0.35));
        labels.set(id, p, k, { anchor: 'l', dx: (1 - k) * -20 });
      });
      t3.animate(lt, 0.6);
    },
  };

  // ================================================================ 4 · MEET VORTEX
  const t4 = text({
    layout: 'none',
    extra: `
      <div class="scrim" style="position:absolute;inset:0;background:linear-gradient(0deg, rgba(1,6,13,0.9) 0%, rgba(1,6,13,0.6) 30%, rgba(1,6,13,0) 52%)"></div>
      <div class="headline-block center" style="top:612px"><div class="kicker k4"><span class="rule"></span>Introducing<span class="rule"></span></div></div>
      <img class="lockup wordmark" src="assets/vortex-wordmark-white.svg" style="top:668px;width:560px" alt="Sonar Vortex">
      <div class="headline-block center" style="top:850px"><div class="subline tsub" style="margin:0;font-size:38px;color:#c9d4e6">Guide and verify, <span style="color:var(--accent-hi)">inside the agent's coding loop.</span></div></div>`,
  });
  const meet = {
    id: 'meet', name: 'Meet Sonar Vortex', dur: 14, fadeIn: 0.8,
    text: t4,
    update(lt, amb) {
      setCam(lt, [
        { t: 0, pos: [0, 7.5, 12], look: [0, 0.6, 0] },
        { t: 6, pos: [0, 4.2, 10.5], look: [0, 1.1, 0] },
        { t: 14, pos: [0, 3.6, 9.8], look: [0, 1.15, 0] },
      ]);
      backdrop.update(amb, { glow: 1.0, glowDir: V(0, 0.3, -1) });
      field.group.position.set(0, 1.3, -1.0);
      field.group.rotation.set(0.62, 0, 0);
      field.update(amb, { radius: 8, funnel: 1.6, form: sramp(lt, 0.4, 5.5), spin: 1.0, flow: 1.2, eye: 0.0 });
      mark.group.position.set(0, 2.35, 0.8);
      const asm = ramp(lt, 1.6, 5.4);
      mark.update(amb, { size: 2.1, assemble: asm, spin: 0.16, tilt: -0.18, glow: 0.4 + pulse(lt, 5.7, 0.45) * 0.9, stagger: 0.13 });
      t4.el.style.opacity = 1;
      const kk = easeOutCubic(ramp(lt, 5.6, 6.4));
      const k4 = t4.q('.k4');
      k4.style.opacity = kk;
      k4.querySelectorAll('.rule').forEach((r) => (r.style.transform = `scaleX(${kk})`));
      const wm = t4.q('.wordmark');
      const k = easeOutCubic(ramp(lt, 5.9, 7.0));
      wm.style.opacity = k;
      wm.style.transform = `translateX(-50%) translateY(${(1 - k) * 24}px)`;
      const s = easeOutCubic(ramp(lt, 6.9, 8.0));
      const sub = t4.q('.tsub');
      sub.style.opacity = s;
      sub.style.transform = `translateY(${(1 - s) * 18}px)`;
    },
  };

  // ================================================================ 5 · GUIDE
  const ctxNames = ['Repository context', 'Architecture rules', 'Security standards', 'Team conventions', 'Approved libraries', 'Coding standards'];
  const AP5 = V(1.5, 3.6, 0.6);
  const srcAngles = [-0.15, 0.75, 1.65, 2.75, 3.75, 4.85];
  const srcs = srcAngles.map((a) => AP5.clone().add(V(Math.cos(a) * 6.2, 0.5, Math.sin(a) * 6.2)));
  ctxNames.forEach((n, i) => labels.make('ctx' + i, n, ''));
  const streams = world.makeStreams(srcs);
  const t5 = text({
    kicker: '01 · Guide',
    headline: 'The right context, [[before the first line.]]',
    extra: SCRIM + CORNER + `
      <div class="scrim meter-scrim sm5"></div>
      <div class="meter m5"><div class="cap"><span>TOKENS SPENT EXPLORING</span></div><div class="track"><div class="fill" style="background:linear-gradient(90deg,#126ed3,#4f9cf0)"></div></div></div>`,
  });
  labels.make('nav5', 'Semantic navigation', '');
  const navFiles = [city.index(9, 8), city.index(11, 3), city.index(14, 5)];
  const guide = {
    id: 'guide', name: 'Guide', dur: 22,
    text: t5,
    update(lt, amb) {
      const a = lerp(0.95, 0.62, easeInOutCubic(lt / 22));
      const R = lerp(18.4, 17.6, lt / 22);
      cam(V(Math.sin(a) * R + 1.5, 9.3, Math.cos(a) * R), V(0.2, 4.2, 0.4));
      backdrop.update(amb, { glow: 0.9, glowDir: V(-0.4, 0.2, -1) });
      city.group.position.set(1.5, 0, 0);
      city.clearGlow();
      agent.group.position.copy(AP5);
      const fed = sramp(lt, 4, 11);
      agent.update(amb, { scale: easeOutBack(ramp(lt, 0.3, 1.2)), energy: 0.7 + fed * 0.5, tint: new THREE.Color().copy(COLORS.agent).lerp(COLORS.ice, fed), pulse: pulse(lt, 11.2, 0.35) * 0.5 });
      field.group.position.copy(AP5).add(V(0, 1.0, 0));
      field.group.rotation.set(0, 0, 0);
      field.update(amb, { opacity: 0.85 * sramp(lt, 0.8, 3.5), radius: 7.2, funnel: 1.25, form: 1, spin: 0.9, flow: 1, inner: 0.1, size: 0.9, eye: 0.35 });
      const amts = srcs.map((_, i) => sramp(lt, 2.4 + i * 0.75, 3.4 + i * 0.75) * (1 - sramp(lt, 18.5, 20.5) * 0.7));
      streams.update(amb, { target: AP5, amts, opacity: 1, twist: 1.3 });
      srcs.forEach((p, i) => labels.set('ctx' + i, p, easeOutCubic(ramp(lt, 2.2 + i * 0.75, 2.9 + i * 0.75)) ));
      // semantic navigation: precise beams to the right files, then the links between them
      city.update({ reveal: 1 });
      const navK = ramp(lt, 12.2, 13.4);
      navFiles.forEach((fi, j) => {
        const k = clamp((lt - 12.2 - j * 0.35) / 0.5);
        if (k > 0) {
          const tp = city.top(fi);
          extraBeams[j].set(AP5, tp, { progress: easeOutCubic(k), opacity: 0.95, time: amb, pulse: 0.6, color: COLORS.accentHi });
          city.setGlow(fi, easeOutCubic(k) * (1 + pulse(lt, 12.6 + j * 0.35, 0.2)), COLORS.accentHi);
        }
      });
      for (let j = 0; j < 2; j++) {
        const k = clamp((lt - 14.0 - j * 0.4) / 0.6);
        if (k > 0) extraBeams[3 + j].set(city.top(navFiles[j]), city.top(navFiles[j + 1]), { progress: easeOutCubic(k), opacity: 0.7, time: amb, pulse: 1, color: COLORS.ice });
      }
      labels.set('nav5', city.top(navFiles[0]), win(lt, 13.6, 24, 0.6, 0.6), { anchor: 'r', dx: -40 });
      t5.animate(lt, 0.6);
      const m = clamp((lt - 12.4) / 2.5);
      t5.q('.fill').style.transform = `scaleX(${(0.02 + 0.2 * easeOutCubic(m)).toFixed(4)})`;
      t5.q('.m5').style.opacity = t5.q('.sm5').style.opacity = sramp(lt, 12.0, 12.8);
    },
  };

  // ================================================================ 6+7 · VERIFY → SOLVE (one continuous scene)
  const AP6 = V(-5.6, 1.5, 0);
  const RP6 = V(0, 1.5, 0);
  const STACK = V(5.4, 1.5, 0.2);
  labels.make('agent6', 'AI coding agent', 'plain');
  labels.make('vx6', 'Sonar Vortex', 'plain');
  labels.make('flag', '<span class="dot"></span>Hard-coded credential', 'err');
  labels.make('fixed', '<span class="dot"></span>Fixed before the PR', 'ok');
  labels.make('nG', 'GUIDE', 'node');
  labels.make('nV', 'VERIFY', 'node');
  labels.make('nS', 'SOLVE', 'node');
  const NCARDS = 5;
  const FLAGGED = 4;
  const FLAG_LINE = 5;
  const emitT = (i) => 1.6 + i * 1.95;
  const T_FLAG = emitT(FLAGGED) + 1.6 + 0.55; // when the flagged card has passed the ring
  const T_BACK = 18.6; // Solve: card returns to agent
  const T_REEMIT = 21.0;
  const verifySolve = (T, amb, tx) => {
    // Camera
    const camKeys = [
      { t: 0, pos: [5.0, 2.4, 13.6], look: [0.3, 2.5, 0] },
      { t: 18, pos: [6.8, 2.8, 12.6], look: [0.4, 2.55, 0] },
      { t: 24.5, pos: [6.4, 2.9, 12.8], look: [0.3, 2.5, 0] },
      { t: 29.5, pos: [0.2, 11.5, 13.5], look: [-1.6, 2.6, -0.4] },
      { t: 36, pos: [-0.8, 12.0, 13.0], look: [-1.8, 2.6, -0.4] },
    ];
    setCam(T, camKeys);
    backdrop.update(amb, { glow: 0.8, glowDir: V(0, 0.1, -1) });
    agent.group.position.copy(AP6);
    const solving = pulse(T, 20.4, 0.5);
    agent.update(amb, { scale: easeOutBack(ramp(T, 0.3, 1.2)), energy: 1.1, tint: new THREE.Color().copy(COLORS.agent).lerp(COLORS.ice, 0.6), pulse: solving * 0.8 });
    ring.group.position.copy(RP6);
    ring.group.rotation.set(0, Math.PI / 2, 0);
    // vortex tunnel around the ring
    field.group.position.copy(RP6).add(V(-0.9, 0, 0));
    field.group.rotation.set(0, 0, Math.PI / 2);
    field.update(amb, { opacity: 0.55 * sramp(T, 0.5, 2.5), radius: 3.4, funnel: 1.4, form: 1, spin: 1.2, flow: 1.4, inner: 0.22, size: 0.7, eye: 0.15 });

    let flash = 0, flashRed = 0;
    cards.begin();
    // stacked (verified) cards first, then moving ones
    const draws = [];
    for (let i = 0; i < NCARDS; i++) {
      const s = emitT(i);
      if (T < s) continue;
      const flagged = i === FLAGGED;
      const kA = clamp((T - s) / 1.6); // agent → ring
      const kS = clamp((T - s - 1.6) / 0.8); // through ring (scan)
      const kB = clamp((T - s - 2.4) / 1.4); // ring → stack
      const stackPos = STACK.clone().add(V(0, 0, -0.02 * i)).add(V(0, (i - 2) * 0.0, 0));
      let pos, scanV = -1, border = COLORS.accentHi, borderAmt = 0, op = clamp((T - s) * 4);
      let lineColor = null, reveal = clamp((T - s) / 1.3);
      let scale = 0.85;
      const passK = clamp((T - s - 2.4) * 3);
      if (!flagged || T < T_BACK) {
        if (kS <= 0) {
          pos = AP6.clone().lerp(RP6.clone().add(V(-1.0, 0, 0)), easeInOutCubic(kA)).add(V(0, Math.sin(kA * Math.PI) * 0.7, 0));
          scale = lerp(0.35, 0.85, easeOutCubic(kA));
        } else if (kB <= 0 || flagged) {
          pos = RP6.clone().add(V(lerp(-1.0, 1.0, kS), 0, 0));
          scanV = 1 - kS;
          if (flagged) {
            const hold = clamp((T - (s + 2.4)) / 0.7);
            pos.add(V(easeOutCubic(hold) * 1.6, 0, 0));
            scanV = kS < 1 ? 1 - kS : -1;
          }
          flash = Math.max(flash, Math.sin(kS * Math.PI) * (flagged ? 0 : 1));
        } else {
          const e = easeInOutCubic(kB);
          const slot = STACK.clone().add(V(i * 0.14, i * 0.14, -i * 0.05));
          pos = qbez(RP6.clone().add(V(1.0, 0, 0)), RP6.clone().add(V(3.0, 1.0, 0)), slot, e);
          scale = lerp(0.85, 0.7, e);
        }
        if (!flagged) {
          border = COLORS.pass;
          borderAmt = passK;
        } else {
          const fk = clamp((T - T_FLAG) * 3);
          flashRed = Math.max(flashRed, pulse(T, T_FLAG + 0.1, 0.4));
          border = COLORS.error;
          borderAmt = fk;
          lineColor = (l) => (l === FLAG_LINE ? { color: COLORS.error, amt: fk, boost: fk * 0.6 } : null);
        }
      } else {
        // Solve: back to the agent, re-emitted fixed, verified, stacked
        const kR = clamp((T - T_BACK) / 1.8);
        const kE = clamp((T - T_REEMIT) / 1.6);
        const kS2 = clamp((T - T_REEMIT - 1.6) / 0.8);
        const kB2 = clamp((T - T_REEMIT - 2.4) / 1.4);
        const held = RP6.clone().add(V(2.6, 0, 0));
        if (T < T_REEMIT) {
          const e = easeInOutCubic(kR);
          pos = qbez(held, V(-1.5, -1.6, 2.6), AP6.clone().add(V(0.4, 0.2, 0)), e);
          scale = lerp(0.85, 0.35, e);
          op = 1 - sramp(kR, 0.8, 1);
          border = COLORS.error;
          borderAmt = 1 - kR;
          lineColor = (l) => (l === FLAG_LINE ? { color: COLORS.error, amt: 1 - kR * 0.5, boost: 0.4 } : null);
        } else {
          op = clamp(kE * 5);
          if (kS2 <= 0) {
            pos = AP6.clone().lerp(RP6.clone().add(V(-1.0, 0, 0)), easeInOutCubic(kE)).add(V(0, Math.sin(kE * Math.PI) * 0.7, 0));
            scale = lerp(0.35, 0.85, easeOutCubic(kE));
          } else if (kB2 <= 0) {
            pos = RP6.clone().add(V(lerp(-1.0, 1.0, kS2), 0, 0));
            scanV = 1 - kS2;
            flash = Math.max(flash, Math.sin(kS2 * Math.PI));
          } else {
            const e = easeInOutCubic(kB2);
            const slot = STACK.clone().add(V(i * 0.14, i * 0.14, -i * 0.05));
            pos = qbez(RP6.clone().add(V(1.0, 0, 0)), RP6.clone().add(V(3.0, 1.0, 0)), slot, e);
            scale = lerp(0.85, 0.7, e);
          }
          border = COLORS.pass;
          borderAmt = clamp((T - T_REEMIT - 2.4) * 3);
          const fixedGlow = pulse(T, T_REEMIT + 2.2, 0.6);
          lineColor = (l) => (l === FLAG_LINE ? { color: COLORS.pass, amt: 0.35 + fixedGlow * 0.5, boost: fixedGlow } : null);
          reveal = clamp((T - T_REEMIT) / 1.3);
        }
      }
      draws.push({ i, z: pos.x, o: { pos, rot: [0, -0.5, 0], scale, opacity: op, reveal, border, borderAmt, lineColor, scan: scanV } });
    }
    draws.sort((a, b) => b.z - a.z); // furthest right (behind from this view) first
    for (const d of draws) cards.card(20 + d.i, d.o);
    cards.end();
    ring.update(amb, { opacity: sramp(T, 0.4, 1.6), flash: flash * 0.6 + flashRed, color: flashRed > 0.2 ? COLORS.error : null });

    // labels
    const loopK = sramp(T, 26.5, 29.5);
    labels.set('agent6', AP6.clone().add(V(0, -1.4, 0)), win(T, 1.0, 26.5, 0.6, 0.8), { anchor: 'b' });
    labels.set('vx6', RP6.clone().add(V(0, -2.55, 0)), win(T, 1.6, 26.5, 0.6, 0.8), { anchor: 'b' });
    const fd = draws.find((d) => d.i === FLAGGED);
    if (fd && T < T_BACK + 0.6) {
      labels.set('flag', fd.o.pos.clone().add(V(0, -0.95, 0)), win(T, T_FLAG + 0.1, T_BACK + 0.5, 0.4, 0.4), { anchor: 'b' });
    }
    labels.set('fixed', STACK.clone().add(V(0.7, -1.25, 0)), win(T, T_REEMIT + 3.6, 27, 0.5, 0.6), { anchor: 'b' });

    // the loop
    loopMat.opacity = loopK * 0.75;
    loopMesh.visible = loopK > 0.001;
    for (let i = 0; i < 12; i++) {
      const u = (i / 12 + amb * 0.07) % 1;
      const p = loopCurve.getPointAt(u);
      sparks[i].position.copy(p);
      sparks[i].material.opacity = loopK * 0.9;
      sparks[i].material.color.copy(COLORS.ice);
      sparks[i].scale.setScalar(0.55);
      sparks[i].visible = loopK > 0.001;
    }
    const nodes = [['nG', 0.5], ['nV', 0.0], ['nS', 0.25]];
    nodes.forEach(([id, u], j) => {
      const p = loopCurve.getPointAt(u);
      const k = easeOutBack(ramp(T, 27.4 + j * 0.45, 28.1 + j * 0.45));
      labels.set(id, p.add(V(0, 0.15, 0)), clamp(k), { scale: 0.85 + 0.15 * clamp(k) });
    });
    return { T };
  };
  labels.make('loopcap', 'One continuous loop', 'plain');
  const t6 = text({ kicker: '02 · Verify', headline: 'Every change, [[verified in real time.]]', extra: SCRIM + CORNER });
  const verify = {
    id: 'verify', name: 'Verify', dur: 18, fadeOut: 0, hold: 17.2, text: t6,
    update(lt, amb) {
      verifySolve(lt, amb);
      t6.animate(lt, 0.6, 18.0);
    },
  };
  const t7 = text({ kicker: '03 · Solve', headline: 'Fixed [[inside the loop,]] | before the PR.', extra: SCRIM + CORNER });
  const solve = {
    id: 'solve', name: 'Solve', dur: 18, fadeIn: 0, text: t7,
    update(lt, amb) {
      verifySolve(18 + lt, amb);
      t7.animate(lt, 0.25);
      labels.set('loopcap', loopCurve.getPointAt(0.75).add(V(0, -0.1, 0.9)), win(lt, 11.5, 19, 0.8, 0.6), { anchor: 'b' });
    },
  };

  // ================================================================ 8 · STACK
  const tools = ['Claude Code', 'Codex', 'GitHub Copilot', 'Cursor', 'Antigravity', 'MCP clients'];
  tools.forEach((n, i) => labels.make('tool' + i, n, 'big'));
  const t8 = text({ kicker: 'Works with your stack', headline: 'One loop, [[every agent.]]', extra: SCRIM + CORNER });
  const CEN8 = V(0, 0.2, 0);
  const stack = {
    id: 'stack', name: 'Works with your stack', dur: 14, text: t8,
    update(lt, amb) {
      setCam(lt, [
        { t: 0, pos: [0, 1.6, 13.5], look: [0, 1.2, 0] },
        { t: 14, pos: [0, 1.9, 12.4], look: [0, 1.2, 0] },
      ]);
      backdrop.update(amb, { glow: 1.0, glowDir: V(0, 0, -1) });
      field.group.position.copy(CEN8).add(V(0, 0, -1.6));
      field.group.rotation.set(1.25, 0, 0);
      field.update(amb, { opacity: 0.8 * sramp(lt, 0.3, 2.0), radius: 6.0, funnel: 2.2, form: 1, spin: 0.9, eye: 0.3 });
      mark.group.position.copy(CEN8);
      mark.update(amb, { size: 1.6, assemble: 1, spin: 0.15, glow: 0.5 });
      const rot = lt * 0.12 + 0.3;
      tools.forEach((_, i) => {
        const a = rot + (i / tools.length) * Math.PI * 2;
        const p = V(Math.cos(a) * 5.0, Math.sin(a) * 2.25, Math.sin(a) * 0.8).add(CEN8);
        const k = easeOutCubic(ramp(lt, 1.6 + i * 0.3, 2.4 + i * 0.3));
        labels.set('tool' + i, p, k, { scale: 0.9 + 0.1 * k });
        extraBeams[i].set(p, CEN8, { progress: easeOutCubic(ramp(lt, 2.0 + i * 0.3, 3.0 + i * 0.3)), opacity: 0.45, time: amb, pulse: 1, color: COLORS.accentHi });
      });
      t8.animate(lt, 0.6);
    },
  };

  // ================================================================ 9 · OUTCOME
  const stats = [
    { v: 36, d: 0, l: 'fewer tokens on refactoring' },
    { v: 44, d: 0, l: 'reduction in outages' },
    { v: 3.2, d: 1, l: 'false-positive rate' },
  ];
  const t9 = text({
    kicker: 'The outcome',
    headline: 'Better code. [[Fewer tokens.]] | Less rework.',
    extra: SCRIM + CORNER + `<div class="stats">${stats.map((s) => `<div class="stat"><div class="num">0%</div><div class="lbl">${s.l}</div></div>`).join('')}</div>
      <div class="footnote">Source: sonarsource.com/products/sonar-vortex</div>`,
  });
  labels.make('pr9', 'Pull request', 'plain');
  labels.make('pass9', '<span class="dot"></span>Quality gate passed', 'ok');
  const AP9 = V(-5.0, 1.4, 1.0);
  const GP9 = V(4.2, 1.7, -2.5);
  const MID9 = V(-0.6, 2.2, -0.5);
  // scan glow from cards passing under the mark (computed analytically so it is order-independent)
  const scanAt = (lt) => {
    let g = 0;
    for (let c = 0; c < 4; c++) {
      const e = easeInOutCubic(clamp((lt - 1.4 - c * 1.5) / 2.6));
      if (lt > 1.4 + c * 1.5) g = Math.max(g, Math.exp(-Math.pow((e - 0.45) / 0.08, 2)));
    }
    return g;
  };
  const outcome = {
    id: 'outcome', name: 'Outcome', dur: 22, text: t9,
    update(lt, amb) {
      setCam(lt, [
        { t: 0, pos: [0.2, 3.1, 15.5], look: [-0.2, 2.25, -0.6] },
        { t: 8.2, pos: [0.5, 3.2, 15.3], look: [-0.1, 2.25, -0.6] },
        { t: 10.0, pos: [0.6, 3.2, 15.4], look: [-0.1, 1.55, -0.6] },
        { t: 22, pos: [1.0, 3.3, 14.9], look: [0.0, 1.6, -0.6] },
      ]);
      backdrop.update(amb, { glow: 0.9, glowDir: V(0.3, 0.1, -1) });
      agent.group.position.copy(AP9);
      agent.update(amb, { scale: easeOutBack(ramp(lt, 0.3, 1.2)) * 0.9, energy: 1.0, tint: new THREE.Color().copy(COLORS.agent).lerp(COLORS.ice, 0.6) });
      // Vortex rides along the agent's loop: small mark over the path
      const scanGlowPrev = scanAt(lt);
      mark.group.position.copy(MID9).add(V(0, 1.15 + Math.sin(amb * 1.2) * 0.06, 0));
      mark.update(amb, { size: 0.95, assemble: 1, spin: 0.5, glow: 0.5 + scanGlowPrev * 0.9 });
      gate.group.position.copy(GP9);
      gate.group.rotation.set(0, -0.38, 0);
      gate.group.scale.setScalar(0.8);
      cards.begin();
      for (let c = 0; c < 4; c++) {
        const s = 1.4 + c * 1.5;
        if (lt < s) continue;
        const k = clamp((lt - s) / 2.6);
        const e = easeInOutCubic(k);
        const pos = qbez(AP9.clone().add(V(0.7, 0.2, 0)), V(-0.8, 1.6, 0.2), GP9.clone().add(V(0, 0, -0.4)), e);
        const inGate = clamp((e - 0.9) / 0.1);
        cards.card(30 + c, {
          pos, rot: [0, lerp(0.4, -0.38, e), 0], scale: lerp(0.35, 0.72, Math.min(1, e * 1.6)) * (1 - inGate * 0.3),
          opacity: clamp((lt - s) * 4) * (1 - inGate), reveal: clamp((lt - s) / 1.3),
          border: COLORS.pass, borderAmt: clamp((e - 0.45) * 4),
          scan: e > 0.37 && e < 0.53 ? 1 - (e - 0.37) / 0.16 : -1,
        });
      }
      cards.end();
      const gk = sramp(lt, 1.4 + 2.4, 1.4 + 2.9);
      gate.update(amb, { state: 'pass', amt: gk * (0.75 + 0.25 * Math.sin(amb * 2)), icon: easeOutBack(ramp(lt, 4.0, 4.6)) * 0.95 });
      labels.set('pr9', GP9.clone().add(V(0, 2.1, 0)), sramp(lt, 1.0, 1.8) * (1 - sramp(lt, 8.0, 8.8)), { anchor: 't' });
      labels.set('pass9', GP9.clone().add(V(0, -1.95, 0)), sramp(lt, 4.2, 4.8) * (1 - sramp(lt, 8.0, 8.8)), { anchor: 'b' });
      t9.animate(lt, 0.6);
      // stats
      const statEls = t9.qa('.stat');
      stats.forEach((s, i) => {
        const t0 = 8.6 + i * 0.45;
        const k = easeOutCubic(ramp(lt, t0, t0 + 0.8));
        statEls[i].style.opacity = k;
        statEls[i].style.transform = `translateY(${(1 - k) * 30}px)`;
        const c = easeOutCubic(ramp(lt, t0 + 0.1, t0 + 2.0));
        statEls[i].querySelector('.num').textContent = (s.v * c).toFixed(s.d) + '%';
      });
      t9.q('.footnote').style.opacity = sramp(lt, 10.5, 11.5) * 0.9;
    },
  };

  // ================================================================ 10 · OUTRO
  const t10 = text({
    layout: 'none',
    extra: `
      <div class="scrim" style="position:absolute;inset:0;background:linear-gradient(0deg, rgba(1,6,13,0.88) 0%, rgba(1,6,13,0.55) 32%, rgba(1,6,13,0) 55%)"></div>
      <img class="lockup wordmark" src="assets/vortex-wordmark-white.svg" style="top:590px;width:560px" alt="Sonar Vortex">
      <div class="headline-block center" style="top:780px"><div class="subline tsub" style="margin:0;font-size:40px;color:#e3e9f3">Context before the agent writes. <span style="color:var(--accent-hi)">Verification as it writes.</span></div></div>
      <div class="headline-block center" style="top:878px"><div class="url">sonarsource.com/products/sonar-vortex</div></div>
      <img class="lockup sonar" src="assets/sonar-logo-white.svg" style="top:968px;height:34px;opacity:0.6" alt="Sonar">`,
  });
  const outro = {
    id: 'outro', name: 'Outro', dur: 12, fadeOut: 2.2,
    text: t10,
    update(lt, amb) {
      setCam(lt, [
        { t: 0, pos: [0, 0.8, 11.6], look: [0, 1.0, 0] },
        { t: 12, pos: [0, 0.6, 12.6], look: [0, 1.0, 0] },
      ]);
      backdrop.update(amb, { glow: 1.1, glowDir: V(0, 0.15, -1) });
      field.group.position.set(0, 2.4, -2.2);
      field.group.rotation.set(1.2, 0, 0);
      field.update(amb, { opacity: 0.95, radius: 7.5, funnel: 1.8, form: 1, spin: 0.8, eye: 0 });
      mark.group.position.set(0, 2.5, 0);
      mark.update(amb, { size: 2.1, assemble: 1, spin: 0.12, glow: 0.5 });
      t10.el.style.opacity = 1;
      const items = [['.wordmark', 0.6], ['.tsub', 1.4], ['.url', 2.2], ['.sonar', 2.6]];
      for (const [sel, t0] of items) {
        const el = t10.q(sel);
        const k = easeOutCubic(ramp(lt, t0, t0 + 1.0));
        el.style.opacity = sel === '.sonar' ? k * 0.6 : k;
        const tx = sel === '.wordmark' || sel === '.sonar' ? 'translateX(-50%) ' : '';
        el.style.transform = `${tx}translateY(${(1 - k) * 20}px)`;
      }
    },
  };

  return [title, speed, blind, late, meet, guide, verify, solve, stack, outcome, outro];
}
