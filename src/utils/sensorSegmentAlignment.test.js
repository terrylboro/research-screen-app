import { calculateSensorToAnatomicalMatrix, evaluateMovementCycles } from './sensorSegmentAlignment';
const cycles = axis => [1, -1, 1, -1].flatMap(sign => Array.from({ length: 12 }, () => ({ gx: axis[0] * sign * 30, gy: axis[1] * sign * 30, gz: axis[2] * sign * 30 })));
it('rejects calibration with indistinguishable nod and shake axes', () => {
  expect(() => calculateSensorToAnatomicalMatrix(cycles([1, 0, 0]), cycles([1, 0, 0]), [0, 0, 0], [1, 0, 0])).toThrow(/too similar/);
});
it('accepts consistent bidirectional movements and rejects static input', () => {
  expect(evaluateMovementCycles(cycles([0, 1, 0]), [0, 0, 0], 0).acceptedSamples).not.toBeNull();
  expect(evaluateMovementCycles(cycles([0, 0, 0]), [0, 0, 0], 0).acceptedSamples).toBeNull();
});
