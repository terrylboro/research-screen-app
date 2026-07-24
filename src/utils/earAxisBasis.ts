import { EarSide } from '../types/treatmentTypes';

/**
 * Convert a sensor vector into the right-ear reference basis used by the app.
 * Mounting the device on the left ear reverses its Y and Z axes while leaving
 * X unchanged (equivalent to a 180-degree rotation around X).
 */
export function applyEarAxisBasis(
  x: number,
  y: number,
  z: number,
  affectedEar: EarSide
): [number, number, number] {
  return affectedEar === 'left' ? [x, -y, -z] : [x, y, z];
}
