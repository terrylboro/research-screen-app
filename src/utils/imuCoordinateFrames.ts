import type { SensorToAnatomicalMatrix, Vector3Tuple } from './sensorSegmentAlignment';

/**
 * Nominal sensor orientation for the production central-forehead mount:
 *
 * - sensor +X points towards the crown of the head;
 * - sensor Y is the mediolateral/nod axis;
 * - sensor Z is the remaining right-handed axis.
 *
 * Guided calibration may refine this matrix when the physical device is not
 * mounted perfectly, but treated ear never changes the physical sensor basis.
 */
export const CENTRAL_FOREHEAD_REFERENCE_MATRIX: SensorToAnatomicalMatrix = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

/** Map the calibrated anatomical basis into the orientation-filter basis. */
export function anatomicalToFilterVector(
  x: number,
  y: number,
  z: number
): Vector3Tuple {
  return [z, -y, x];
}
