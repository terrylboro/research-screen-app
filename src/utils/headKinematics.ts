import { Quaternion, Vector3 } from 'three';

/** Port of HeadspinVerification HeadKinematics.calculate(), default axes/signs.
 * Input is already neutral-relative: inverse(neutral) * current.
 * X = lateral-flexion axis, Y = flexion axis, Z = longitudinal axis.
 */
export function calculateHeadAngles(relative: Quaternion) {
  const norm = relative.length();
  if (!Number.isFinite(norm) || norm < 1e-12) return null;
  const q = relative.clone().normalize();
  // Projection onto Z defines the twist. A 180-degree swing is singular.
  if (Math.hypot(q.z, q.w) < 1e-12) return null;
  const axis = new Vector3(0, 0, 1).applyQuaternion(q);
  const degrees = 180 / Math.PI;
  const twist = 2 * Math.atan2(q.z, q.w) * degrees;
  return {
    flexion: Math.atan2(axis.x, axis.z) * degrees * -1, // Sign flip so that positive values correspond to neck extension
    axialRotation: ((twist + 180) % 360 + 360) % 360 - 180,
    lateralFlexion: Math.atan2(-axis.y, Math.hypot(axis.x, axis.z)) * degrees,
  };
}
