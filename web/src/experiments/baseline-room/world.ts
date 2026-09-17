/**
 * A room, in millimetres, seen from above.
 *
 * Fly behavioural rigs are overwhelmingly top-down: a floor, walls, a light
 * source, and a tracked animal. This keeps that convention because it is what
 * the published measurements we are checking against were made in, and it
 * keeps ray casting cheap enough to run every simulation step.
 */

export interface Rect {
  x: number; y: number; w: number; h: number;
  kind: "furniture" | "window" | "wall";
  /** 0 = black, 1 = bright. */
  luminance: number;
  label?: string;
}

export interface FlyState {
  x: number; y: number;
  /** Radians, 0 = +x. */
  heading: number;
  /** mm/s along the heading. */
  speed: number;
  /** rad/s. */
  turn: number;
  /** Counts down while an escape is in progress. */
  escapeFor: number;
}

export const ROOM_W = 1200;
export const ROOM_H = 800;

/** A small apartment: window wall, a couch, a table, a doorway. */
export const FURNITURE: Rect[] = [
  { x: 0, y: 0, w: ROOM_W, h: 14, kind: "wall", luminance: 0.3 },
  { x: 0, y: ROOM_H - 14, w: ROOM_W, h: 14, kind: "wall", luminance: 0.3 },
  { x: 0, y: 0, w: 14, h: ROOM_H, kind: "wall", luminance: 0.3 },
  { x: ROOM_W - 14, y: 0, w: 14, h: ROOM_H, kind: "wall", luminance: 0.3 },
  { x: 250, y: 0, w: 420, h: 16, kind: "window", luminance: 1, label: "window" },
  { x: 120, y: 520, w: 300, h: 150, kind: "furniture", luminance: 0.07, label: "couch" },
  { x: 640, y: 300, w: 240, h: 160, kind: "furniture", luminance: 0.1, label: "table" },
  { x: 980, y: 560, w: 170, h: 120, kind: "furniture", luminance: 0.08, label: "bin" },
];

export interface Threat {
  active: boolean;
  /** Angular size on the retina, radians. Grows as it approaches. */
  size: number;
  /** Azimuth in world frame. */
  bearing: number;
  /** Seconds until contact; drives the expansion. */
  ttc: number;
}

export interface World {
  fly: FlyState;
  threat: Threat;
  /** Rotating stripe pattern for the optomotor assay, rad/s. 0 = off. */
  drumSpeed: number;
  drumPhase: number;
  /** Wall-contact accumulator, for the centrophobism assay. */
  trail: { x: number; y: number }[];
}

export function makeWorld(): World {
  return {
    fly: {
      x: ROOM_W * 0.5, y: ROOM_H * 0.55,
      heading: -Math.PI / 5,
      speed: 0, turn: 0, escapeFor: 0,
    },
    threat: { active: false, size: 0, bearing: 0, ttc: 0 },
    drumSpeed: 0,
    drumPhase: 0,
    trail: [],
  };
}

/**
 * Luminance along one ray, plus the distance to whatever stopped it.
 * A slab test per rectangle is plenty at this scene size.
 */
export function castRay(w: World, angle: number, maxDist = 2000) {
  const { x, y } = w.fly;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = maxDist;
  let lum = 0.5; // open space reads as mid grey

  for (const r of FURNITURE) {
    const t = slabHit(x, y, dx, dy, r);
    if (t !== null && t < best) {
      best = t;
      lum = r.luminance;
    }
  }

  // The rotating drum of the optomotor assay is painted onto whatever the fly
  // is looking at, the same way a real arena projects stripes onto the wall.
  if (w.drumSpeed !== 0) {
    const stripe = Math.sin(angle * 8 + w.drumPhase);
    lum = Math.max(0, Math.min(1, lum + stripe * 0.45));
  }

  // A looming object occludes everything inside its angular extent.
  if (w.threat.active) {
    let d = angle - w.threat.bearing;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < w.threat.size * 0.5) {
      lum = 0.02;
      best = Math.min(best, 60);
    }
  }

  return { dist: best, lum };
}

function slabHit(px: number, py: number, dx: number, dy: number, r: Rect): number | null {
  const inv = (v: number) => (v === 0 ? 1e9 : 1 / v);
  const tx1 = (r.x - px) * inv(dx), tx2 = (r.x + r.w - px) * inv(dx);
  const ty1 = (r.y - py) * inv(dy), ty2 = (r.y + r.h - py) * inv(dy);
  const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
  const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
  if (tmax < 0 || tmin > tmax) return null;
  return tmin > 0 ? tmin : null;
}

/** Advance the body. dt in seconds. */
export function stepBody(w: World, dt: number) {
  const f = w.fly;

  if (f.escapeFor > 0) {
    // An escape is ballistic: the fly commits and the brain does not steer it.
    f.escapeFor -= dt;
    f.speed = 420;
  }

  f.heading += f.turn * dt;
  const nx = f.x + Math.cos(f.heading) * f.speed * dt;
  const ny = f.y + Math.sin(f.heading) * f.speed * dt;

  // Walls are solid. On contact the fly slides along them rather than
  // stopping dead, which is what walking flies actually do.
  const hit = blocked(nx, ny);
  if (!hit) {
    f.x = nx; f.y = ny;
  } else {
    if (!blocked(nx, f.y)) f.x = nx;
    else if (!blocked(f.x, ny)) f.y = ny;
    else f.heading += 2.2 * dt;
  }

  f.x = Math.max(20, Math.min(ROOM_W - 20, f.x));
  f.y = Math.max(20, Math.min(ROOM_H - 20, f.y));

  w.drumPhase += w.drumSpeed * dt;

  if (w.threat.active) {
    w.threat.ttc -= dt;
    // Angular size of an object on a constant-velocity collision course.
    const half = Math.atan2(55, Math.max(20, w.threat.ttc * 900));
    w.threat.size = Math.min(Math.PI * 0.9, half * 2);
    if (w.threat.ttc <= -0.35) {
      w.threat.active = false;
      w.threat.size = 0;
    }
  }

  w.trail.push({ x: f.x, y: f.y });
  if (w.trail.length > 900) w.trail.shift();
}

function blocked(x: number, y: number): boolean {
  for (const r of FURNITURE) {
    if (r.kind === "window") continue;
    if (x > r.x - 8 && x < r.x + r.w + 8 && y > r.y - 8 && y < r.y + r.h + 8) {
      return true;
    }
  }
  return false;
}

/** Shortest distance from the fly to any wall or object, in mm. */
export function distanceToWall(w: World): number {
  let best = Infinity;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    best = Math.min(best, castRay(w, a, 1600).dist);
  }
  return best;
}

export function launchThreat(w: World, fromBearing?: number) {
  w.threat.active = true;
  w.threat.ttc = 1.1;
  w.threat.size = 0.02;
  w.threat.bearing =
    fromBearing ?? w.fly.heading + (Math.random() - 0.5) * 1.2;
}
