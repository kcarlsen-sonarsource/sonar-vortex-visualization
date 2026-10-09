// Pure timing / easing helpers. Everything in the story is a function of time,
// so the same frame always renders identically (required for frame-by-frame export).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
export const smoother = (x) => {
  x = clamp(x);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
/** Linear 0→1 between a and b. */
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
/** Smoothstep 0→1 between a and b. */
export const sramp = (t, a, b) => smoother(ramp(t, a, b));
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInCubic = (x) => Math.pow(clamp(x), 3);
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
export const easeInOutCubic = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (x, s = 1.4) => {
  x = clamp(x);
  return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
};
/** 0→1→0 window: fades in over [a, a+fi], out over [b-fo, b]. */
export const win = (t, a, b, fi = 0.5, fo = 0.5) => sramp(t, a, a + fi) * (1 - sramp(t, b - fo, b));
/** Short pulse peaking at t0. */
export const pulse = (t, t0, w = 0.3) => Math.exp(-Math.pow((t - t0) / w, 2));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piecewise camera path through keys [{t, pos:[x,y,z], look:[x,y,z]}] with smooth easing per segment. */
export function keyed(lt, keys, field) {
  if (lt <= keys[0].t) return keys[0][field];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (lt <= b.t) {
      const k = easeInOutCubic((lt - a.t) / (b.t - a.t));
      return a[field].map((v, j) => lerp(v, b[field][j], k));
    }
  }
  return keys[keys.length - 1][field];
}
