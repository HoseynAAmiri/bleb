// Time-based drag inertia with friction, edge bounces, and rolling. No effect on health here.
export function throwBleb({ position, velocity, bounds, move, roll, landed }) {
  let p = {...position}, v = {...velocity}, angle = 0, frame, previous = performance.now(), stopped = false;
  function step(now) {
    if (stopped) return;
    const dt = Math.min(.04, Math.max(.001, (now - previous) / 1000)); previous = now;
    v.x *= Math.exp(-3.2 * dt); v.y *= Math.exp(-3.2 * dt);
    p.x += v.x * dt; p.y += v.y * dt;
    const b = bounds();
    for (const axis of ['x', 'y']) {
      if (p[axis] < 4 || p[axis] > b[axis]) { p[axis] = Math.max(4, Math.min(b[axis], p[axis])); v[axis] *= -.45; }
    }
    angle += v.x * dt / 35 * 180 / Math.PI; move(p); roll(angle);
    if (Math.hypot(v.x, v.y) < 25) { stopped = true; landed(p, angle); return; }
    frame = requestAnimationFrame(step);
  }
  frame = requestAnimationFrame(step);
  return () => { stopped = true; cancelAnimationFrame(frame); };
}
