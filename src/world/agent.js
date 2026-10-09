import * as THREE from 'three';
import { COLORS, glowSprite } from './common.js';

/** The AI coding agent: a luminous core inside a faceted shell with orbit rings. */
export class Agent {
  constructor() {
    this.group = new THREE.Group();
    this.coreMat = new THREE.MeshBasicMaterial({ color: COLORS.agent.clone(), transparent: true });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 4), this.coreMat);
    this.group.add(this.core);

    this.halo = glowSprite(COLORS.agent.clone(), 3.2, 0.55);
    this.group.add(this.halo);

    this.shellMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#9db8ff'), transparent: true, opacity: 0.55 });
    this.shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.78, 1)), this.shellMat);
    this.group.add(this.shell);

    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a9c2ff'), transparent: true, opacity: 0.7 });
    this.rings = [0, 1].map((i) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.12 + i * 0.16, 0.012, 8, 128), this.ringMat);
      this.group.add(r);
      return r;
    });
    this.tint = COLORS.agent.clone();
  }
  /**
   * @param amb ambient time (idle motion)
   * @param o opacity, scale, tint (Color), energy (0..2 brightness), pulse
   */
  update(amb, { opacity = 1, scale = 1, tint = COLORS.agent, energy = 1, pulse = 0 } = {}) {
    const g = this.group;
    g.visible = opacity > 0.001;
    g.scale.setScalar(scale * (1 + pulse * 0.12));
    this.tint.copy(tint);
    this.coreMat.color.copy(this.tint).multiplyScalar(0.9 + energy * 0.5 + pulse);
    this.coreMat.opacity = opacity;
    this.halo.material.color.copy(this.tint);
    this.halo.material.opacity = opacity * (0.35 + 0.25 * energy + pulse * 0.5);
    this.halo.scale.setScalar(2.6 + energy * 0.9 + pulse * 1.5);
    this.shellMat.opacity = opacity * 0.5;
    this.shellMat.color.copy(this.tint).lerp(new THREE.Color('#7fa6ff'), 0.5);
    this.ringMat.opacity = opacity * 0.6;
    this.ringMat.color.copy(this.shellMat.color);
    this.shell.rotation.set(amb * 0.21, amb * 0.33, 0);
    this.rings[0].rotation.set(1.2 + Math.sin(amb * 0.4) * 0.1, amb * 0.5, 0.3);
    this.rings[1].rotation.set(-0.9, -amb * 0.37, 1.1 + Math.cos(amb * 0.3) * 0.1);
  }
}
