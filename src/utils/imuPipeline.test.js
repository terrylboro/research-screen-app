import { decodeIMUPacket, getConsecutiveImuPacketDeltaMs } from './imuDecoder';
import { MahonyImuFilter } from './mahonyImuFilter';

it('decodes all chronological frames with the firmware scale and rejects truncated packets', () => {
  const view = new DataView(new ArrayBuffer(44));
  view.setUint8(0, 0x5a);
  view.setUint16(2, 3, true);
  for (let i = 0; i < 3; i++) view.setInt16(8 + i * 12 + 6, 100 * (i + 1), true);
  expect(decodeIMUPacket(view).frames.map(f => f.gx_dps)).toEqual([7, 14, 21]);
  expect(() => decodeIMUPacket(new DataView(view.buffer, 0, 43))).toThrow();
});

it('uses device cadence across rollovers and refuses gaps', () => {
  const previous = { seq: 255, n: 3, t0_ms: 0xfffffff0 };
  expect(getConsecutiveImuPacketDeltaMs({ seq: 0, n: 3, t0_ms: 14 }, previous)).toBe(30);
  expect(getConsecutiveImuPacketDeltaMs({ seq: 1, n: 3, t0_ms: 44 }, previous)).toBeNull();
  expect(getConsecutiveImuPacketDeltaMs({ seq: 0, n: 3, t0_ms: 500 }, previous)).toBeNull();
});

it('integrates a known angular speed and holds orientation at zero dt', () => {
  const filter = new MahonyImuFilter();
  for (let i = 0; i < 100; i++) filter.update(0, 0, 9.81, 0, 0, Math.PI / 2, 0.01);
  const pose = filter.update(0, 0, 9.81, 0, 0, 100, 0);
  expect(pose.yaw).toBeCloseTo(Math.PI / 2, 3);
});

it('rejects acceleration outside the gravity gate', () => {
  const filter = new MahonyImuFilter();
  filter.init(0, 0, 9.81);
  for (let i = 0; i < 100; i++) filter.update(19.62, 0, 0, 0, 0, 0, 0.01);
  expect(filter.q).toEqual([1, 0, 0, 0]);
});
