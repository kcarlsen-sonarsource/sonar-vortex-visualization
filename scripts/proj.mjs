// Quick layout check: node scripts/proj.mjs '[camx,camy,camz]' '[lookx,looky,lookz]' '[[x,y,z],...]'
import * as THREE from 'three';
const [pos, look, pts] = process.argv.slice(2).map((s) => JSON.parse(s));
const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 1000);
cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld();
for (const p of pts) { const v = new THREE.Vector3(...p).project(cam); console.log(JSON.stringify(p), '->', Math.round((v.x * 0.5 + 0.5) * 1920), Math.round((-v.y * 0.5 + 0.5) * 1080)); }
