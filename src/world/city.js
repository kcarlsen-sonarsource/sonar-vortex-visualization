import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { FOG_GLSL, COLORS } from './common.js';

/** The codebase: a grid of files as extruded blocks. Individual files can glow. */
export class City {
  constructor({ nx = 22, nz = 14, spacing = 1.08 } = {}) {
    this.nx = nx;
    this.nz = nz;
    this.count = nx * nz;
    this.spacing = spacing;
    const rnd = mulberry32(42);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);

    this.glow = new Float32Array(this.count);
    this.tint = new Float32Array(this.count * 3);
    const delay = new Float32Array(this.count);
    this.positions = [];
    this.heights = [];

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uReveal: { value: 1 },
        uOpacity: { value: 1 },
        uFogColor: { value: COLORS.bg.clone() },
        uFogDensity: { value: 0.035 },
      },
      transparent: true,
      vertexShader: /* glsl */ `
        attribute float aGlow; attribute vec3 aTint; attribute float aDelay;
        uniform float uReveal;
        varying vec3 vLocal; varying vec3 vN; varying float vGlow; varying vec3 vTint; varying float vDepth; varying float vH;
        void main(){
          float k = clamp(uReveal*1.6 - aDelay, 0.0, 1.0); k = k*k*(3.0-2.0*k);
          vec3 p = position; p.y *= max(k, 0.001);
          vLocal = position - vec3(0.0, 0.5, 0.0);
          vN = normal; vGlow = aGlow; vTint = aTint;
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vH = wp.y;
          vec4 mv = viewMatrix * wp; vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${FOG_GLSL}
        uniform float uOpacity;
        varying vec3 vLocal; varying vec3 vN; varying float vGlow; varying vec3 vTint; varying float vDepth; varying float vH;
        void main(){
          vec3 n = normalize(vN);
          vec3 d = 0.5 - abs(vLocal);
          vec3 fw = fwidth(vLocal) * 1.4;
          vec3 e = d / max(fw, vec3(1e-4));
          if (abs(n.x) > 0.5) e.x = 1e3; if (abs(n.y) > 0.5) e.y = 1e3; if (abs(n.z) > 0.5) e.z = 1e3;
          float edge = 1.0 - clamp(min(min(e.x, e.y), e.z), 0.0, 1.0);
          float light = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.4, 1.0, 0.6))), 0.0);
          vec3 base = mix(vec3(0.018, 0.05, 0.09), vec3(0.03, 0.085, 0.15), n.y * 0.5 + 0.5) * light;
          vec3 edgeC = vec3(0.12, 0.28, 0.48);
          vec3 c = base + edgeC * edge * 0.55;
          c += vTint * vGlow * (0.45 + edge * 1.2 + max(n.y, 0.0) * 0.6);
          c = applyFog(c, vDepth);
          gl_FragColor = vec4(c, uOpacity);
        }`,
    });
    mat.extensions = { derivatives: true };
    this.mesh = new THREE.InstancedMesh(geo, mat, this.count);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const px = (x - (nx - 1) / 2) * spacing;
        const pz = (z - (nz - 1) / 2) * spacing;
        const cluster = 0.5 + 0.5 * Math.sin(x * 0.55) * Math.cos(z * 0.7);
        const h = 0.18 + Math.pow(rnd(), 2.2) * 1.5 * (0.5 + cluster);
        const fw = 0.62 + rnd() * 0.22;
        m.makeScale(fw, h, 0.62 + rnd() * 0.22);
        m.setPosition(px, 0, pz);
        this.mesh.setMatrixAt(i, m);
        this.positions.push(new THREE.Vector3(px, 0, pz));
        this.heights.push(h);
        delay[i] = (Math.hypot(px, pz) / 14) * 0.6 + rnd() * 0.15;
        i++;
      }
    }
    this.mesh.geometry.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delay, 1));
    this.glowAttr = new THREE.InstancedBufferAttribute(this.glow, 1);
    this.tintAttr = new THREE.InstancedBufferAttribute(this.tint, 3);
    this.mesh.geometry.setAttribute('aGlow', this.glowAttr);
    this.mesh.geometry.setAttribute('aTint', this.tintAttr);
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);

    // Floor grid lines for a sense of ground.
    const grid = new THREE.GridHelper(nx * spacing + 6, nx + 6, 0x123a66, 0x0a2240);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    grid.position.y = -0.01;
    this.grid = grid;
    this.group.add(grid);
  }
  index(x, z) {
    return z * this.nx + x;
  }
  /** World-space top centre of a file block. */
  top(i) {
    const p = this.positions[i].clone();
    p.y = this.heights[i];
    return this.group.localToWorld(p);
  }
  clearGlow() {
    this.glow.fill(0);
  }
  setGlow(i, v, color) {
    this.glow[i] = Math.max(this.glow[i], v);
    if (v > 0) {
      this.tint[i * 3] = color.r;
      this.tint[i * 3 + 1] = color.g;
      this.tint[i * 3 + 2] = color.b;
    }
  }
  update({ opacity = 1, reveal = 1 } = {}) {
    this.group.visible = opacity > 0.001;
    this.mesh.material.uniforms.uOpacity.value = opacity;
    this.mesh.material.uniforms.uReveal.value = reveal;
    this.grid.material.opacity = 0.3 * opacity;
    this.glowAttr.needsUpdate = true;
    this.tintAttr.needsUpdate = true;
  }
}
