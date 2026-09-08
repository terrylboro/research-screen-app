import { samplesToCsv } from './recordingCsv';
it('escapes CSV text and leaves unavailable angles empty', () => {
  expect(samplesToCsv([{ label: 'a,"b"\nc', flexionDegrees: null }])).toBe('label,flexionDegrees\r\n"a,""b""\nc",\r\n');
  expect(samplesToCsv([])).toBe('');
});
