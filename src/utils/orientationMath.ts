const GRAVITY_EXPECTED = 9.8;
const GRAVITY_TOLERANCE = 2.0;

export function quaternionNormalize(q: number[]) {
  const [w, x, y, z] = q;
  const norm = Math.sqrt(w * w + x * x + y * y + z * z);
  if (norm === 0) return [1, 0, 0, 0];
  return [w / norm, x / norm, y / norm, z / norm];
}

export function quaternionToEuler(q: number[]) {
  const [w, x, y, z] = q;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1
    ? Math.sign(sinp) * (Math.PI / 2)
    : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return { roll, pitch, yaw };
}

export function quaternionRotateVector(q: number[], v: number[]) {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  const cx1 = y * vz - z * vy;
  const cy1 = z * vx - x * vz;
  const cz1 = x * vy - y * vx;
  const tx = cx1 + w * vx;
  const ty = cy1 + w * vy;
  const tz = cz1 + w * vz;
  const cx2 = y * tz - z * ty;
  const cy2 = z * tx - x * tz;
  const cz2 = x * ty - y * tx;
  return [vx + 2 * cx2, vy + 2 * cy2, vz + 2 * cz2];
}

export function calculateGravityInSensorFrame(q: number[], g = 9.807) {
  const conjugate = [q[0], -q[1], -q[2], -q[3]];
  return quaternionRotateVector(conjugate, [0, 0, g]);
}

/** Return an orientation whose predicted gravity approximately matches accel. */
export function initQuaternionFromGravity(
  accelX: number,
  accelY: number,
  accelZ: number
) {
  const norm = Math.sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ);
  if (Math.abs(norm - GRAVITY_EXPECTED) >= GRAVITY_TOLERANCE || norm === 0) {
    return [1, 0, 0, 0];
  }

  const gx = accelX / norm;
  const gy = accelY / norm;
  const gz = accelZ / norm;
  const vx = -gy;
  const vy = gx;
  const vectorNorm = Math.sqrt(vx * vx + vy * vy);

  if (vectorNorm < 1e-6) {
    return gz > 0 ? [1, 0, 0, 0] : [0, 1, 0, 0];
  }

  const angle = Math.acos(Math.max(-1, Math.min(1, gz)));
  const halfAngle = angle / 2;
  const scale = Math.sin(halfAngle) / vectorNorm;
  return quaternionNormalize([
    Math.cos(halfAngle),
    -vx * scale,
    -vy * scale,
    0,
  ]);
}

export function orientationNaNGuard(q: number[]) {
  const gravity = calculateGravityInSensorFrame(q);
  const euler = quaternionToEuler(q);
  return {
    gravityX: gravity[0], gravityY: gravity[1], gravityZ: gravity[2],
    userAccelX: 0, userAccelY: 0, userAccelZ: 0,
    qw: q[0], qx: q[1], qy: q[2], qz: q[3],
    roll: euler.roll, pitch: euler.pitch, yaw: euler.yaw,
  };
}
