import * as THREE from 'three';
import { clamp, easeOutCubic, sramp } from './util.js';

export const W = 1920;
export const H = 1080;

/** HTML chips pinned to 3D anchors, re-projected each frame. */
export class Labels {
  constructor(root, camera) {
    this.root = root;
    this.camera = camera;
    this.map = new Map();
    this._v = new THREE.Vector3();
  }
  make(id, html, cls = '') {
    const el = document.createElement('div');
    el.className = `label ${cls}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    const rec = { el, touched: false, shown: false };
    this.map.set(id, rec);
    return rec;
  }
  begin() {
    for (const r of this.map.values()) r.touched = false;
  }
  /** anchor: 'c' centre, 'l' left edge at point, 'r' right edge at point, 'b' below point, 't' above point */
  set(id, pos, opacity, { anchor = 'c', dx = 0, dy = 0, scale = 1, html } = {}) {
    const r = this.map.get(id);
    if (!r) return;
    if (opacity <= 0.002) return;
    this._v.copy(pos).project(this.camera);
    if (this._v.z > 1 || this._v.z < -1) return;
    const x = (this._v.x * 0.5 + 0.5) * W + dx;
    const y = (-this._v.y * 0.5 + 0.5) * H + dy;
    const ax = { c: '-50%', l: '0%', r: '-100%', b: '-50%', t: '-50%' }[anchor];
    const ay = { c: '-50%', l: '-50%', r: '-50%', b: '0%', t: '-100%' }[anchor];
    r.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${ax}, ${ay}) scale(${scale.toFixed(3)})`;
    r.el.style.opacity = opacity.toFixed(3);
    if (html !== undefined && r.html !== html) {
      r.el.innerHTML = html;
      r.html = html;
    }
    r.touched = true;
  }
  /** Screen-space position of a 3D point (for layout checks). */
  screen(pos) {
    this._v.copy(pos).project(this.camera);
    return [(this._v.x * 0.5 + 0.5) * W, (-this._v.y * 0.5 + 0.5) * H];
  }
  end() {
    for (const r of this.map.values()) {
      if (!r.touched && r.el.style.opacity !== '0') r.el.style.opacity = '0';
    }
  }
}

/**
 * Mini markup for headlines: words separated by spaces; [[...]] = accent, {{...}} = error, ((...)) = pass.
 * Returns HTML with each word in a span for staggered animation.
 */
function wordsHTML(src) {
  const out = [];
  const re = /\[\[(.+?)\]\]|\{\{(.+?)\}\}|\(\((.+?)\)\)|(\|)|([^\s[{(|]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const [_, acc, err, ok, br, plain] = m;
    if (br) {
      out.push('<br>');
      continue;
    }
    const text = acc || err || ok || plain;
    const cls = acc ? 'em' : err ? 'em err' : ok ? 'em ok' : '';
    for (const w of text.split(' ')) {
      if (!w) continue;
      out.push(cls ? `<span class="w"><em class="${cls.replace('em ', '').replace('em', '')}">${w}</em></span>` : `<span class="w">${w}</span>`);
    }
  }
  return out.join(' ');
}

/** Builds and animates one chapter's text layer. */
export class ChapterText {
  constructor(root, spec) {
    this.spec = spec;
    const el = document.createElement('div');
    el.className = 'chapter-text';
    const pos = spec.layout || 'tl';
    const cls = pos === 'center' ? 'center' : pos === 'bottom' ? 'center bottom' : '';
    let html = `<div class="headline-block ${cls}" style="${spec.blockStyle || ''}">`;
    if (spec.kicker) html += `<div class="kicker"><span class="rule"></span><span class="ktext">${spec.kicker}</span></div>`;
    if (spec.headline) html += `<div class="headline" style="${spec.headlineStyle || ''}">${wordsHTML(spec.headline)}</div>`;
    if (spec.subline) html += `<div class="subline">${spec.subline}</div>`;
    html += `</div>`;
    if (spec.extra) html += spec.extra;
    el.innerHTML = html;
    root.appendChild(el);
    this.el = el;
    this.words = [...el.querySelectorAll('.headline .w')];
    this.rule = el.querySelector('.kicker .rule');
    this.ktext = el.querySelector('.kicker .ktext');
    this.sub = el.querySelector('.subline');
  }
  q(sel) {
    return this.el.querySelector(sel);
  }
  qa(sel) {
    return [...this.el.querySelectorAll(sel)];
  }
  /** Standard entrance at tIn, exit ending at tOut. */
  animate(lt, tIn = 0.5, tOut = 1e6) {
    const out = 1 - sramp(lt, tOut - 0.7, tOut);
    const vis = lt >= tIn - 0.01 && out > 0.001;
    this.el.style.opacity = vis ? '1' : '0';
    if (!vis) return;
    if (this.rule) {
      const k = easeOutCubic((lt - tIn) / 0.6);
      this.rule.style.transform = `scaleX(${k.toFixed(3)})`;
      this.rule.parentElement.style.opacity = (clamp((lt - tIn) / 0.4) * out).toFixed(3);
    }
    const t0 = tIn + (this.rule ? 0.25 : 0);
    this.words.forEach((w, i) => {
      const k = easeOutCubic((lt - t0 - i * 0.07) / 0.8);
      w.style.opacity = (k * out).toFixed(3);
      w.style.transform = `translateY(${((1 - k) * 34 - (1 - out) * 16).toFixed(1)}px)`;
    });
    if (this.sub) {
      const k = easeOutCubic((lt - t0 - this.words.length * 0.07 - 0.35) / 0.8);
      this.sub.style.opacity = (k * out).toFixed(3);
      this.sub.style.transform = `translateY(${((1 - k) * 20).toFixed(1)}px)`;
    }
    return out;
  }
  hide() {
    if (this.el.style.opacity !== '0') this.el.style.opacity = '0';
  }
}
