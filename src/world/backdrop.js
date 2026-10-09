import * as THREE from 'three';
import { mulberry32 } from '../util.js';

/** Deep navy gradient dome plus slow drifting dust for depth. */
export class Backdrop {
  constructor() {
    this.group = new THREE.Group();

    this.domeU = {
      uGlowDir: { value: new THREE.Vector3(0, 0.15, -1).normalize() },
      uGlow: { value: 1 },
      uTint: { value: new THREE.Color('#0b2a52') },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(400, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.domeU,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uGlowDir; uniform float uGlow; uniform vec3 uTint;
          varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            vec3 base = mix(vec3(0.004,0.016,0.035), vec3(0.010,0.032,0.065), smoothstep(-0.4, 0.6, d.y));
            float g = pow(max(dot(d, uGlowDir), 0.0), 6.0);
            vec3 c = base + uTint * g * 0.55 * uGlow;
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);

    const N = 2600;
    const rnd = mulberry32(7);
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rnd() - 0.5) * 90;
      pos[i * 3 + 1] = (rnd() - 0.35) * 50;
      pos[i * 3 + 2] = (rnd() - 0.5) * 90;
      seed[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustU = { uTime: { value: 0 }, uOpacity: { value: 1 } };
    this.dust = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.dustU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime; attribute float aSeed; varying float vA;
          void main(){
            vec3 p = position;
            p.x += sin(uTime*0.07 + aSeed*40.0)*1.2;
            p.y += sin(uTime*0.05 + aSeed*17.0)*0.8 + uTime*0.04*(0.5+aSeed);
            p.y = mod(p.y + 17.5, 50.0) - 17.5;
            p.z += cos(uTime*0.06 + aSeed*23.0)*1.2;
            vec4 mv = modelViewMatrix * vec4(p,1.0);
            float d = -mv.z;
            gl_PointSize = (0.8 + aSeed*aSeed*2.2) * 42.0 / max(d, 1.0);
            vA = smoothstep(80.0, 20.0, d) * smoothstep(1.5, 6.0, d) * (0.25 + 0.75*aSeed);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; varying float vA;
          void main(){
            float r = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, r);
            gl_FragColor = vec4(vec3(0.55,0.72,1.0)*0.55, a*vA*uOpacity*0.6);
          }`,
      })
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }
  update(amb, { glow = 1, dust = 1, glowDir } = {}) {
    this.dustU.uTime.value = amb;
    this.dustU.uOpacity.value = dust;
    this.domeU.uGlow.value = glow;
    if (glowDir) this.domeU.uGlowDir.value.copy(glowDir).normalize();
  }
}
