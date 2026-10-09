import * as THREE from 'three';

export const COLORS = {
  bg: new THREE.Color('#020913'),
  ink: new THREE.Color('#e9ebf0'),
  accent: new THREE.Color('#126ed3'),
  accentHi: new THREE.Color('#4f9cf0'),
  mark: new THREE.Color('#0070d9'),
  ice: new THREE.Color('#bfe0ff'),
  error: new THREE.Color('#f2555f'),
  warn: new THREE.Color('#f2a65f'),
  pass: new THREE.Color('#34c27a'),
  agent: new THREE.Color('#dfe6ff'),
};

let glowTex;
/** Soft radial sprite used for halos and point glows. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function glowSprite(color, scale = 1, opacity = 1) {
  const m = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}

/** A glowing segment from a→b that grows with `progress` and carries travelling pulses. */
export class Beam {
  constructor(color = COLORS.accentHi, radius = 0.025) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geo.translate(0, 0.5, 0);
    this.uniforms = {
      uColor: { value: new THREE.Color(color) },
      uProgress: { value: 1 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uPulse: { value: 1 },
    };
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying float vY;
          void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uProgress, uOpacity, uTime, uPulse;
          varying float vY;
          void main(){
            if (vY > uProgress) discard;
            float head = smoothstep(uProgress - 0.12, uProgress, vY) * step(uProgress, 0.999);
            float p = pow(max(0.5 + 0.5 * sin((vY * 6.0 - uTime * 3.0) * 3.14159), 0.0), 6.0) * uPulse;
            float a = (0.55 + 0.45 * p + head) * uOpacity;
            gl_FragColor = vec4(uColor * (1.0 + head * 1.5 + p * 0.8), a);
          }`,
      })
    );
    this.radius = radius;
    this.mesh.frustumCulled = false;
  }
  set(a, b, { progress = 1, opacity = 1, time = 0, pulse = 1, color } = {}) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    this.mesh.position.copy(a);
    this.mesh.scale.set(this.radius, len, this.radius);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.uniforms.uProgress.value = progress;
    this.uniforms.uOpacity.value = opacity;
    this.uniforms.uTime.value = time;
    this.uniforms.uPulse.value = pulse;
    if (color) this.uniforms.uColor.value.copy(color);
    this.mesh.visible = opacity > 0.001 && progress > 0.001;
  }
}

/** Fake-fog GLSL helper shared by custom shaders. */
export const FOG_GLSL = /* glsl */ `
  uniform vec3 uFogColor; uniform float uFogDensity;
  vec3 applyFog(vec3 c, float depth){ float f = 1.0 - exp(-uFogDensity*uFogDensity*depth*depth); return mix(c, uFogColor, clamp(f,0.0,1.0)); }
`;
