import { Quaternion, Vector3 } from 'three';
import { calculateHeadAngles } from './headKinematics';
const rotation = (axis, degrees) => new Quaternion().setFromAxisAngle(new Vector3(...axis), degrees * Math.PI / 180);

it('reports neutral and isolated anatomical rotations', () => {
  expect(calculateHeadAngles(new Quaternion())).toEqual({ flexion: -0, axialRotation: 0, lateralFlexion: -0 });
  expect(calculateHeadAngles(rotation([0, 1, 0], 120)).flexion).toBeCloseTo(-120);
  expect(calculateHeadAngles(rotation([1, 0, 0], -35)).lateralFlexion).toBeCloseTo(-35);
  expect(calculateHeadAngles(rotation([0, 0, 1], 70)).axialRotation).toBeCloseTo(70);
});
it('separates flexion beyond 90 degrees from longitudinal twist', () => {
  const q = rotation([0, 1, 0], 120).multiply(rotation([0, 0, 1], -65));
  const result = calculateHeadAngles(q);
  expect(result.flexion).toBeCloseTo(-120);
  expect(result.axialRotation).toBeCloseTo(-65);
  expect(result.lateralFlexion).toBeCloseTo(0);
  const negated = new Quaternion(-q.x, -q.y, -q.z, -q.w);
  expect(calculateHeadAngles(negated).axialRotation).toBeCloseTo(result.axialRotation);
});
it('uses inverse neutral times current and flags singular or invalid quaternions', () => {
  const neutral = rotation([1, 0, 0], 20).multiply(rotation([0, 0, 1], 40));
  const current = neutral.clone().multiply(rotation([0, 1, 0], 30));
  expect(calculateHeadAngles(neutral.clone().invert().multiply(current)).flexion).toBeCloseTo(-30);
  expect(calculateHeadAngles(rotation([1, 0, 0], 180))).toBeNull();
  expect(calculateHeadAngles(new Quaternion(0, 0, 0, 0))).toBeNull();
});
