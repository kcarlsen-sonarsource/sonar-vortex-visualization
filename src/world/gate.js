import * as THREE from 'three';
import { COLORS, glowSprite } from './common.js';

function roundedRectCurve(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const pts = s.getSpacedPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0));
  return new THREE.CatmullRomCurve3(pts, true);
}

function polyTube(points, radius) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.01), 48, radius, 10, false);
}

/** The pull request / quality gate: a portal frame that judges incoming changes. */
export class Gate {
  constructor(w = 3.2, h = 4.2) {
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fb0d8'), transparent: true });
    this.frame = new THREE.Mesh(new THREE.TubeGeometry(roundedRectCurve(w, h, 0.4), 320, 0.06, 12, true), this.frameMat);
    this.inner.add(this.frame);
    this.fillU = { uColor: { value: new THREE.Color('#1b3b63') }, uOpacity: { value: 1 }, uAmt: { value: 0 } };
    this.fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.1, h - 0.1),
      new THREE.ShaderMaterial({
        uniforms: this.fillU,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uOpacity, uAmt; varying vec2 vUv;
          void main(){
            vec2 p = abs(vUv - 0.5) * 2.0;
            float edge = pow(max(p.x, p.y), 4.0);
            float a = (0.06 + edge * 0.25) * (0.4 + uAmt) * uOpacity;
            gl_FragColor = vec4(uColor, a);
          }`,
      })
    );
    this.inner.add(this.fill);

    this.iconMat = new THREE.MeshBasicMaterial({ color: COLORS.pass.clone(), transparent: true });
    const s = 0.9;
    this.check = new THREE.Mesh(
      polyTube([new THREE.Vector3(-0.55 * s, 0.02 * s, 0), new THREE.Vector3(-0.15 * s, -0.4 * s, 0), new THREE.Vector3(0.6 * s, 0.45 * s, 0)], 0.09),
      this.iconMat
    );
    const crossA = polyTube([new THREE.Vector3(-0.45, -0.45, 0), new THREE.Vector3(0.45, 0.45, 0)], 0.09);
    const crossB = polyTube([new THREE.Vector3(-0.45, 0.45, 0), new THREE.Vector3(0.45, -0.45, 0)], 0.09);
    this.cross = new THREE.Group();
    this.cross.add(new THREE.Mesh(crossA, this.iconMat), new THREE.Mesh(crossB, this.iconMat));
    this.inner.add(this.check, this.cross);
    this.glow = glowSprite(COLORS.pass.clone(), 6, 0);
    this.inner.add(this.glow);
    this.w = w;
    this.h = h;
  }
  /**
   * @param state 'idle' | 'fail' | 'pass'
   * @param amt 0..1 strength of the state colour
   * @param icon 0..1 scale of check/cross
   */
  update(amb, { opacity = 1, state = 'idle', amt = 0, icon = 0, shake = 0 } = {}) {
    this.group.visible = opacity > 0.001;
    const col = state === 'fail' ? COLORS.error : state === 'pass' ? COLORS.pass : COLORS.accentHi;
    const base = new THREE.Color('#7f9cc4');
    this.frameMat.color.copy(base).lerp(col, amt).multiplyScalar(1 + amt * 0.9);
    this.frameMat.opacity = opacity;
    this.fillU.uColor.value.copy(new THREE.Color('#1b3b63')).lerp(col, amt);
    this.fillU.uOpacity.value = opacity;
    this.fillU.uAmt.value = amt;
    this.iconMat.color.copy(col).multiplyScalar(1.6);
    this.iconMat.opacity = opacity;
    this.check.visible = state === 'pass' && icon > 0.001;
    this.cross.visible = state === 'fail' && icon > 0.001;
    this.check.scale.setScalar(icon);
    this.cross.scale.setScalar(icon);
    this.glow.material.color.copy(col);
    this.glow.material.opacity = opacity * amt * 0.35;
    this.inner.position.x = Math.sin(amb * 60) * shake * 0.08;
  }
}

/** Particles spiralling from N source points into a centre (context being injected). */
export class Streams {
  constructor(sources, perStream = 140) {
    const N = sources.length * perStream;
    const aStream = new Float32Array(N);
    const aU = new Float32Array(N);
    const aJ = new Float32Array(N * 3);
    let k = 0;
    for (let s = 0; s < sources.length; s++) {
      for (let i = 0; i < perStream; i++, k++) {
        aStream[k] = s;
        aU[k] = i / perStream;
        aJ[k * 3] = (Math.sin(k * 12.9898) * 43758.5453) % 1;
        aJ[k * 3 + 1] = (Math.sin(k * 78.233) * 12543.123) % 1;
        aJ[k * 3 + 2] = (Math.sin(k * 3.71) * 9123.77) % 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aStream', new THREE.BufferAttribute(aStream, 1));
    geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    geo.setAttribute('aJ', new THREE.BufferAttribute(aJ, 3));
    const n = sources.length;
    this.u = {
      uTime: { value: 0 },
      uSrc: { value: sources.map((v) => v.clone()) },
      uAmt: { value: new Array(n).fill(0) },
      uTarget: { value: new THREE.Vector3() },
      uTwist: { value: 1.2 },
      uColor: { value: new THREE.Color('#7fc0ff') },
      uOpacity: { value: 1 },
    };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          #define NS ${n}
          uniform float uTime, uTwist; uniform vec3 uSrc[NS]; uniform float uAmt[NS]; uniform vec3 uTarget;
          attribute float aStream, aU; attribute vec3 aJ;
          varying float vA;
          void main(){
            int s = int(aStream + 0.5);
            vec3 src = uSrc[0]; float amt = uAmt[0];
            for (int i = 0; i < NS; i++) { if (i == s) { src = uSrc[i]; amt = uAmt[i]; } }
            float u = fract(aU + uTime * 0.32);
            vec3 rel = src - uTarget;
            float R = length(rel.xz);
            float a0 = atan(rel.z, rel.x);
            float e = pow(u, 1.35);
            float ang = a0 + e * uTwist;
            float r = R * (1.0 - e);
            vec3 p = uTarget + vec3(cos(ang) * r, rel.y * (1.0 - e*e) , sin(ang) * r);
            p += aJ * 0.16 * (1.0 - e);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.2 + 2.0 * (1.0 - e)) * 46.0 / max(-mv.z, 0.5);
            // only show the part of the stream that has "arrived" so far (amt grows 0→1)
            vA = smoothstep(0.0, 0.05, u) * smoothstep(1.0, 0.85, u) * amt;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uOpacity; varying float vA;
          void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor*1.4, a*vA*uOpacity*0.8); }`,
      })
    );
    this.points.frustumCulled = false;
  }
  update(amb, { target, amts, opacity = 1, twist = 1.2 }) {
    this.points.visible = opacity > 0.001;
    this.u.uTime.value = amb;
    this.u.uTarget.value.copy(target);
    this.u.uAmt.value = amts;
    this.u.uOpacity.value = opacity;
    this.u.uTwist.value = twist;
  }
}
