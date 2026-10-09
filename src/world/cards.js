import * as THREE from 'three';
import { mulberry32, clamp } from '../util.js';
import { COLORS, FOG_GLSL } from './common.js';

export const CARD_W = 2.6;
export const CARD_H = 1.9;
const LINES = 11;
const PAD_X = 0.22;
const PAD_Y = 0.2;
const LINE_STEP = (CARD_H - PAD_Y * 2) / LINES;

const SYNTAX = [
  new THREE.Color('#7f93b3'), // plain
  new THREE.Color('#5d9cf5'), // keyword
  new THREE.Color('#a993f0'), // type
  new THREE.Color('#68c9c0'), // string
];

/**
 * A pool of "code editor" cards drawn with two instanced meshes (panels + syntax segments).
 * Call begin(), then card(...) for each visible card, then end().
 */
export class Cards {
  constructor(max = 64) {
    this.max = max;
    const rnd = mulberry32(99);
    // Pre-generate a layout per card slot: lines → segments [x0, width, colorIdx]
    this.layouts = [];
    let segMax = 0;
    for (let c = 0; c < max; c++) {
      const lines = [];
      let indent = 0;
      for (let l = 0; l < LINES; l++) {
        if (rnd() < 0.12 && l > 0) {
          lines.push([]);
          continue;
        }
        indent = clamp(indent + (rnd() < 0.3 ? 1 : rnd() < 0.3 ? -1 : 0), 0, 3);
        const segs = [];
        let x = PAD_X + indent * 0.2;
        const n = 1 + Math.floor(rnd() * 3);
        for (let s = 0; s < n; s++) {
          const w = 0.14 + rnd() * 0.55;
          if (x + w > CARD_W - PAD_X) break;
          segs.push([x, w, s === 0 && rnd() < 0.5 ? 1 : Math.floor(rnd() * 4)]);
          x += w + 0.07;
        }
        lines.push(segs);
      }
      this.layouts.push(lines);
      segMax += lines.reduce((a, s) => a + s.length, 0);
    }
    this.segMax = segMax + 8;

    // Panel instanced mesh
    const pGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    this.pOpacity = new Float32Array(max);
    this.pBorder = new Float32Array(max * 3);
    this.pBorderAmt = new Float32Array(max);
    pGeo.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(this.pOpacity, 1));
    pGeo.setAttribute('aBorder', new THREE.InstancedBufferAttribute(this.pBorder, 3));
    pGeo.setAttribute('aBorderAmt', new THREE.InstancedBufferAttribute(this.pBorderAmt, 1));
    this.panels = new THREE.InstancedMesh(
      pGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uFogColor: { value: COLORS.bg.clone() }, uFogDensity: { value: 0.02 } },
        vertexShader: /* glsl */ `
          attribute float aOpacity; attribute vec3 aBorder; attribute float aBorderAmt;
          varying vec2 vUv; varying float vO; varying vec3 vB; varying float vBA; varying float vDepth;
          void main(){
            vUv = uv; vO = aOpacity; vB = aBorder; vBA = aBorderAmt;
            vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          ${FOG_GLSL}
          varying vec2 vUv; varying float vO; varying vec3 vB; varying float vBA; varying float vDepth;
          float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
          void main(){
            vec2 size = vec2(${CARD_W.toFixed(3)}, ${CARD_H.toFixed(3)});
            vec2 p = (vUv - 0.5) * size;
            float d = sdRound(p, size*0.5, 0.12);
            float aa = fwidth(d);
            float inside = 1.0 - smoothstep(-aa, aa, d);
            float border = 1.0 - smoothstep(0.0, aa*1.5, abs(d + 0.012) - 0.008);
            float topBar = step(size.y*0.5 - 0.16, p.y) * inside;
            vec3 fill = mix(vec3(0.02,0.06,0.11), vec3(0.035,0.09,0.16), vUv.y);
            fill += vec3(0.03,0.07,0.12) * topBar;
            vec3 bc = mix(vec3(0.16,0.32,0.55), vB, vBA);
            vec3 c = mix(fill, bc * (1.0 + vBA*1.4), border);
            c = applyFog(c, vDepth);
            float a = max(inside * 0.9, border) * vO;
            gl_FragColor = vec4(c, a);
          }`,
      }),
      max
    );
    this.panels.material.extensions = { derivatives: true };
    this.panels.frustumCulled = false;

    // Segment instanced mesh
    const sGeo = new THREE.PlaneGeometry(1, 1);
    this.sColor = new Float32Array(this.segMax * 3);
    this.sAlpha = new Float32Array(this.segMax);
    sGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.sColor, 3));
    sGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.sAlpha, 1));
    this.segs = new THREE.InstancedMesh(
      sGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uFogColor: { value: COLORS.bg.clone() }, uFogDensity: { value: 0.02 } },
        vertexShader: /* glsl */ `
          attribute vec3 aColor; attribute float aAlpha;
          varying vec3 vC; varying float vA; varying vec2 vUv; varying float vDepth;
          void main(){
            vC = aColor; vA = aAlpha; vUv = uv;
            vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          ${FOG_GLSL}
          varying vec3 vC; varying float vA; varying vec2 vUv; varying float vDepth;
          void main(){
            float e = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
            gl_FragColor = vec4(applyFog(vC, vDepth), vA * e);
          }`,
      }),
      this.segMax
    );
    this.segs.frustumCulled = false;
    this.segs.renderOrder = 2;
    this.panels.renderOrder = 1;

    this.group = new THREE.Group();
    this.group.add(this.panels, this.segs);
    this._m = new THREE.Matrix4();
    this._ml = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
  }

  begin() {
    this.nPanels = 0;
    this.nSegs = 0;
  }

  /**
   * Draw one card.
   * @param slot layout index
   * @param o {pos, rot:[x,y,z], scale, opacity, reveal (0..1 typed lines), border Color, borderAmt,
   *           lineColor(lineIdx) => {color, alpha, boost} | null, scan (0..1 sweep line position or -1)}
   */
  card(slot, o) {
    if (this.nPanels >= this.max || o.opacity <= 0.001) return;
    const { pos, rot = [0, 0, 0], scale = 1, opacity = 1, reveal = 1 } = o;
    this._e.set(rot[0], rot[1], rot[2]);
    this._q.setFromEuler(this._e);
    this._m.compose(pos, this._q, this._v.set(scale, scale, scale));
    const pi = this.nPanels++;
    this.panels.setMatrixAt(pi, this._m);
    this.pOpacity[pi] = opacity;
    const b = o.border || COLORS.accentHi;
    this.pBorder[pi * 3] = b.r;
    this.pBorder[pi * 3 + 1] = b.g;
    this.pBorder[pi * 3 + 2] = b.b;
    this.pBorderAmt[pi] = o.borderAmt ?? 0;

    const lines = this.layouts[slot % this.max];
    const shown = reveal * LINES;
    for (let l = 0; l < LINES; l++) {
      const lineK = clamp(shown - l);
      if (lineK <= 0) break;
      const segs = lines[l];
      const y = CARD_H / 2 - PAD_Y - 0.12 - LINE_STEP * (l + 0.5);
      const over = o.lineColor ? o.lineColor(l) : null;
      // total visible width for typing effect
      for (let s = 0; s < segs.length; s++) {
        if (this.nSegs >= this.segMax) break;
        const [x0, w, ci] = segs[s];
        const typed = clamp((lineK * (CARD_W - PAD_X) - x0) / w);
        if (typed <= 0) continue;
        const ww = w * typed;
        this._ml.makeScale(ww, LINE_STEP * 0.42, 1);
        this._ml.setPosition(-CARD_W / 2 + x0 + ww / 2, y, 0.006);
        const si = this.nSegs++;
        this.segs.setMatrixAt(si, this._m.clone().multiply(this._ml));
        let c = this._c.copy(SYNTAX[ci]);
        let a = 0.95;
        if (over) {
          c.lerp(over.color, over.amt ?? 1);
          if (over.boost) c.multiplyScalar(1 + over.boost);
        }
        if (o.scan != null && o.scan >= 0) {
          const dy = (y / CARD_H + 0.5) - o.scan;
          const k = Math.exp(-dy * dy * 220);
          c = c.clone().lerp(COLORS.ice, k * 0.8).multiplyScalar(1 + k * 1.6);
        }
        this.sColor[si * 3] = c.r;
        this.sColor[si * 3 + 1] = c.g;
        this.sColor[si * 3 + 2] = c.b;
        this.sAlpha[si] = a * opacity;
      }
    }
    // scan line across the card
    if (o.scan != null && o.scan >= 0 && o.scan <= 1 && this.nSegs < this.segMax) {
      const y = (o.scan - 0.5) * CARD_H;
      this._ml.makeScale(CARD_W * 0.98, 0.035, 1);
      this._ml.setPosition(0, y, 0.01);
      const si = this.nSegs++;
      this.segs.setMatrixAt(si, this._m.clone().multiply(this._ml));
      this.sColor[si * 3] = 0.8 * 2.2;
      this.sColor[si * 3 + 1] = 0.92 * 2.2;
      this.sColor[si * 3 + 2] = 1.0 * 2.2;
      this.sAlpha[si] = opacity;
    }
  }

  /** Local→world anchor of a given line's right end on a card (for labels). */
  lineAnchor(o, line, side = 1) {
    this._e.set(...(o.rot || [0, 0, 0]));
    const q = new THREE.Quaternion().setFromEuler(this._e);
    const y = CARD_H / 2 - PAD_Y - 0.12 - LINE_STEP * (line + 0.5);
    const local = new THREE.Vector3((side * CARD_W) / 2, y, 0).multiplyScalar(o.scale ?? 1);
    return local.applyQuaternion(q).add(o.pos);
  }

  end() {
    this.panels.count = this.nPanels;
    this.segs.count = this.nSegs;
    this.panels.instanceMatrix.needsUpdate = true;
    this.segs.instanceMatrix.needsUpdate = true;
    for (const k of ['aOpacity', 'aBorder', 'aBorderAmt']) this.panels.geometry.attributes[k].needsUpdate = true;
    for (const k of ['aColor', 'aAlpha']) this.segs.geometry.attributes[k].needsUpdate = true;
    this.group.visible = this.nPanels > 0;
  }
}

export const CARD_LINES = LINES;
