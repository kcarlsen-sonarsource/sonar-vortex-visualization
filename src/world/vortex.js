import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mulberry32, clamp, easeOutCubic, smoother } from '../util.js';
import { COLORS, glowSprite } from './common.js';

/**
 * Particle whirlpool in its local XZ plane (axis = +Y). Eight spiral arms echo the
 * eight blades of the Sonar Vortex mark. Particles continuously flow inward.
 */
export class VortexField {
  constructor(N = 16000) {
    const rnd = mulberry32(2026);
    const aR = new Float32Array(N);
    const aTheta = new Float32Array(N);
    const aSeed = new Float32Array(N);
    const aScatter = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      aR[i] = rnd();
      const arm = Math.floor(rnd() * 8);
      const g = (rnd() + rnd() + rnd() - 1.5) / 1.5; // ~gaussian
      aTheta[i] = (arm / 8) * Math.PI * 2 + g * 0.32 + (rnd() < 0.18 ? (rnd() - 0.5) * 2.4 : 0);
      aSeed[i] = rnd();
      // scatter position on a big shell
      const u = rnd() * 2 - 1, phi = rnd() * Math.PI * 2, rr = 6 + rnd() * 14;
      const s = Math.sqrt(1 - u * u);
      aScatter[i * 3] = s * Math.cos(phi) * rr;
      aScatter[i * 3 + 1] = u * rr;
      aScatter[i * 3 + 2] = s * Math.sin(phi) * rr;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
    geo.setAttribute('aTheta', new THREE.BufferAttribute(aTheta, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    geo.setAttribute('aScatter', new THREE.BufferAttribute(aScatter, 3));
    this.u = {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uRadius: { value: 6 },
      uFunnel: { value: 1.6 },
      uForm: { value: 1 },
      uSpin: { value: 1 },
      uFlow: { value: 1 },
      uSize: { value: 1 },
      uInner: { value: 0.12 },
      uColA: { value: new THREE.Color('#0a4fae') },
      uColB: { value: new THREE.Color('#4f9cf0') },
      uColC: { value: new THREE.Color('#dff0ff') },
    };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime, uRadius, uFunnel, uForm, uSpin, uFlow, uSize, uInner;
          attribute float aR, aTheta, aSeed; attribute vec3 aScatter;
          varying float vA; varying float vR;
          void main(){
            // Radial inflow: particles drift from rim to eye and respawn.
            float r = fract(aR - uTime * 0.035 * uFlow * (0.6 + aSeed*0.8));
            float rr = mix(uInner, 1.0, pow(r, 0.8));
            float spiral = log(rr + 0.04) * 1.9;
            float ang = aTheta + spiral - uTime * uSpin * 0.35;
            float rad = rr * uRadius * (1.0 + (aSeed - 0.5) * 0.08);
            float y = -uFunnel * pow(max(1.0 - rr, 0.0), 2.2) + (aSeed - 0.5) * 0.18 * rr;
            vec3 vp = vec3(cos(ang) * rad, y, sin(ang) * rad);
            float k = clamp(uForm * 1.5 - aSeed * 0.5, 0.0, 1.0); k = k*k*(3.0-2.0*k);
            vec3 sp = aScatter + vec3(sin(uTime*0.3 + aSeed*30.0), cos(uTime*0.25 + aSeed*20.0), 0.0) * 0.6;
            vec3 p = mix(sp, vp, k);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float d = max(-mv.z, 0.5);
            float sz = (0.55 + aSeed * aSeed * aSeed * 2.2) * (1.2 - rr*0.4);
            gl_PointSize = sz * uSize * 48.0 / d;
            vR = rr;
            float edge = smoothstep(1.0, 0.82, r) * smoothstep(0.0, 0.08, r);
            vA = mix(0.6, edge * (0.55 + 0.45 * aSeed), k);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; uniform vec3 uColA, uColB, uColC;
          varying float vA; varying float vR;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.05, d);
            vec3 c = mix(uColC, uColB, smoothstep(0.1, 0.45, vR));
            c = mix(c, uColA, smoothstep(0.45, 1.0, vR));
            gl_FragColor = vec4(c, a * vA * uOpacity * 0.5);
          }`,
      })
    );
    this.points.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.points);
    this.eye = glowSprite(new THREE.Color('#6fb2ff'), 3, 0.6);
    this.group.add(this.eye);
  }
  update(amb, { opacity = 1, radius = 6, funnel = 1.6, form = 1, spin = 1, flow = 1, size = 1, inner = 0.12, eye = 0.6 } = {}) {
    this.group.visible = opacity > 0.001;
    Object.assign(this.u.uTime, { value: amb });
    this.u.uOpacity.value = opacity;
    this.u.uRadius.value = radius;
    this.u.uFunnel.value = funnel;
    this.u.uForm.value = form;
    this.u.uSpin.value = spin;
    this.u.uFlow.value = flow;
    this.u.uSize.value = size;
    this.u.uInner.value = inner;
    this.eye.position.y = -funnel * 0.9;
    this.eye.scale.setScalar(radius * 0.55);
    this.eye.material.opacity = opacity * eye * smoother(form);
  }
}

/** The real Sonar Vortex mark (8 blades from the official SVG), extruded in 3D. */
export class VortexMark {
  constructor(svgText) {
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    const data = new SVGLoader().parse(svgText);
    // Custom shading keeps the official brand blue exact (no env-light blowout).
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#0070d9') }, uRim: { value: new THREE.Color('#8cc8ff') }, uOpacity: { value: 1 }, uGlow: { value: 0 } },
      transparent: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uRim; uniform float uOpacity, uGlow; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          float facing = clamp(abs(dot(n, vV)), 0.0, 1.0);
          float key = max(dot(n, normalize(vec3(-0.3, 0.6, 0.75))), 0.0);
          float fres = pow(1.0 - facing, 2.5);
          vec3 c = uColor * (0.62 + 0.38 * key) + uRim * fres * 0.85 + uColor * uGlow * 0.6;
          gl_FragColor = vec4(c, uOpacity);
        }`,
    });
    this.edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe0ff'), transparent: true });
    this.blades = [];
    const rnd = mulberry32(5);
    data.paths.forEach((path) => {
      const shapes = path.toShapes(true);
      const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: 2.2,
        bevelEnabled: true,
        bevelThickness: 0.5,
        bevelSize: 0.35,
        bevelSegments: 3,
        curveSegments: 24,
      });
      geo.translate(-22, -22, -1.1);
      geo.computeBoundingBox();
      const c = new THREE.Vector3();
      geo.boundingBox.getCenter(c);
      geo.translate(-c.x, -c.y, 0);
      const mesh = new THREE.Mesh(geo, this.mat);
      const pivot = new THREE.Group();
      pivot.add(mesh);
      // SVG is y-down → flip into y-up space
      const home = new THREE.Vector3(c.x, -c.y, 0);
      mesh.scale.y = -1;
      const dir = home.clone().normalize();
      const start = dir.clone().multiplyScalar(60 + rnd() * 30).add(new THREE.Vector3((rnd() - 0.5) * 30, (rnd() - 0.5) * 30, 20 + rnd() * 40));
      this.blades.push({ pivot, home, start, spin: new THREE.Vector3(rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 8 - 4) });
      this.inner.add(pivot);
    });
    this.inner.scale.setScalar(1 / 44);
    this.halo = glowSprite(new THREE.Color('#1f6fd8'), 2.4, 0.5);
    this.group.add(this.halo);
  }
  /**
   * @param assemble 0 = blades scattered, 1 = mark formed
   */
  update(amb, { opacity = 1, size = 2, assemble = 1, spin = 0.25, tilt = 0, glow = 0.5, stagger = 0.11 } = {}) {
    this.group.visible = opacity > 0.001;
    this.group.scale.setScalar(size);
    this.mat.uniforms.uOpacity.value = opacity;
    this.mat.uniforms.uGlow.value = Math.max(0, glow - 0.5);
    this.blades.forEach((b, i) => {
      const k = easeOutCubic(clamp((assemble * (1 + stagger * 8) - i * stagger) / 1));
      b.pivot.position.lerpVectors(b.start, b.home, k);
      b.pivot.rotation.set(b.spin.x * (1 - k), b.spin.y * (1 - k), b.spin.z * (1 - k));
    });
    this.inner.rotation.z = -amb * spin;
    this.group.rotation.x = tilt;
    this.halo.material.opacity = opacity * glow * 0.6 * smoother(assemble);
    this.halo.scale.setScalar(2.6);
  }
}

/** A thin bright ring with a faint scan disc: Vortex's real-time verification plane. */
export class ScanRing {
  constructor(radius = 2.2) {
    this.group = new THREE.Group();
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd0ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 12, 160), this.ringMat);
    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.08, 0.01, 8, 160), this.ringMat);
    this.discU = { uOpacity: { value: 1 }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#2f8cff') }, uFlash: { value: 0 } };
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 96),
      new THREE.ShaderMaterial({
        uniforms: this.discU,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity, uTime, uFlash; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
            float sweep = pow(max(0.5 + 0.5*cos(a - uTime*2.2), 0.0), 18.0);
            float rings = 0.5 + 0.5*sin(r*40.0 - uTime*3.0);
            float al = (0.05 + 0.10*smoothstep(0.5,1.0,r) + sweep*0.18*r + rings*0.025 + uFlash*0.35) * smoothstep(1.0, 0.97, r);
            gl_FragColor = vec4(uColor, al * uOpacity);
          }`,
      })
    );
    this.group.add(this.disc, this.ring, this.ring2);
  }
  update(amb, { opacity = 1, color, flash = 0 } = {}) {
    this.group.visible = opacity > 0.001;
    this.ringMat.opacity = opacity;
    this.discU.uOpacity.value = opacity;
    this.discU.uTime.value = amb;
    this.discU.uFlash.value = flash;
    if (color) {
      this.ringMat.color.copy(color);
      this.discU.uColor.value.copy(color);
    } else {
      this.ringMat.color.set('#9fd0ff');
      this.discU.uColor.value.set('#2f8cff');
    }
    this.ring2.rotation.z = amb * 0.5;
  }
}

export { COLORS };
