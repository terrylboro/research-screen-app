import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Quaternion } from 'three';
import { calculateHeadAngles } from '../utils/headKinematics';
import { TreatmentProvider, useTreatment } from './TreatmentProvider';

let mockListener;
let mockButtonListener;
const mockBle = { subscribeToButtonMessages: listener => { mockButtonListener = listener; return () => { mockButtonListener = null; }; }, connected: true, deviceName: 'Test IMU', subscribeToImuMessages: listener => { mockListener = listener; return () => {}; } };
jest.mock('./BleProvider', () => ({ useBleDevice: () => mockBle }));
let context;
function Probe() { context = useTreatment(); return null; }
function packet(seq, time) {
  const data = new DataView(new ArrayBuffer(44));
  data.setUint8(0, 0x5a); data.setUint8(1, seq); data.setUint16(2, 3, true); data.setUint32(4, time, true);
  for (let i = 0; i < 3; i++) { data.setInt16(8 + i * 12, 2049, true); data.setInt16(14 + i * 12, 100, true); }
  return { source: 'imu', id: seq, timestamp: 1000 + time, data };
}
it.each(['csv', 'json'])('records every frame and head angles in %s', (format) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  let download;
  let content;
  let mimeType;
  let filename;
  const originalBlob = global.Blob;
  global.Blob = class { constructor(parts, options) { content = parts[0]; mimeType = options.type; } };
  window.URL.createObjectURL = jest.fn(() => 'blob:test');
  window.URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { filename = this.download; });
  try {
    act(() => root.render(<TreatmentProvider><Probe /></TreatmentProvider>));
    expect(context.saveAsJson).toBe(false);
    if (format === 'json') act(() => context.setSaveAsJson(true));
    act(() => context.startRecording());
    act(() => { mockListener(packet(0, 100)); mockListener(packet(1, 130)); mockListener(packet(2, 160)); });
    act(() => context.stopRecording());
    expect(filename.endsWith(`.${format}`)).toBe(true);
    expect(mimeType).toBe(format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8');
    if (format === 'json') {
      download = JSON.parse(content);
      expect(download.formatVersion).toBe(3);
    } else {
      const [header, ...rows] = content.trim().split('\r\n').map(row => row.split(','));
      const samples = rows.map(row => Object.fromEntries(header.map((key, i) => {
        const value = row[i];
        return [key, value === '' ? null : value === 'true' ? true : value === 'false' ? false : Number.isNaN(Number(value)) ? value : Number(value)];
      })));
      download = { imuSampleCount: samples.length, imuSamples: samples };
    }
    for (const sample of download.imuSamples) {
      const angles = calculateHeadAngles(new Quaternion(sample.quaternionX, sample.quaternionY, sample.quaternionZ, sample.quaternionW));
      expect(sample.flexionDegrees).toBeCloseTo(angles.flexion);
      expect(sample.axialRotationDegrees).toBeCloseTo(angles.axialRotation);
      expect(sample.lateralFlexionDegrees).toBeCloseTo(angles.lateralFlexion);
    }
    expect(download.imuSampleCount).toBe(9);
    expect(download.imuSamples.map(s => s.packetFrameIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
    expect(download.imuSamples[3]).toMatchObject({ gx: 100, gxDps: 7, frameIntervalMs: 10, timingDiscontinuity: false, elapsedMs: 30 });
    expect(download.imuSamples[8].sensorTimelineMs).toBe(60);
    expect(download.imuSamples[8].quaternionW).toEqual(expect.any(Number));
    expect(download.imuSamples[0].timingDiscontinuity).toBe(true);
  } finally {
    act(() => root.unmount()); global.Blob = originalBlob; click.mockRestore();
  }
});


it('handles firmware navigation in order, ignores other commands, and bounds stages', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  const press = bytes => mockButtonListener({ source: 'button', data: new DataView(Uint8Array.from(bytes).buffer) });
  try {
    act(() => root.render(<TreatmentProvider><Probe /></TreatmentProvider>));
    act(() => { press([2]); press([]); press([3]); press([1, 0, 0]); });
    expect(context.state.stage).toBe(0);
    act(() => { press([1]); press([1, 0]); press([1]); });
    expect(context.state.stage).toBe(3);
    act(() => press([2, 0]));
    expect(context.state.stage).toBe(2);
    expect(context.state.timerElapsedTime).toBe(0);
    expect(context.state.isAligned).toBe(false);
    act(() => { press([1]); press([1]); press([1]); });
    expect(context.state.stage).toBe(4);
    act(() => press([2]));
    expect(context.state.stage).toBe(3);
  } finally {
    act(() => root.unmount());
    expect(mockButtonListener).toBeNull();
  }
});

it('applies the mounting matrix before fusion while publishing raw calibration samples', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(<TreatmentProvider><Probe /></TreatmentProvider>));
    act(() => context.setSensorToAnatomicalMatrix([0, 1, 0, -1, 0, 0, 0, 0, 1]));
    act(() => mockListener(packet(0, 100)));
    expect(context.latestImuSample.ax).toBeCloseTo(1, 2);
    expect(context.latestImuSample.ay).toBe(0);
    const q = new Quaternion().setFromRotationMatrix(context.matrixRef.current);
    expect(q.angleTo(new Quaternion())).toBeCloseTo(Math.PI / 2);
    act(() => context.calibrateOffset());
    const relative = context.offsetMatrixRef.current.clone().multiply(context.matrixRef.current);
    expect(new Quaternion().setFromRotationMatrix(relative).angleTo(new Quaternion())).toBeCloseTo(0);
  } finally { act(() => root.unmount()); }
});

it('pauses hold timing and firmware treatment navigation during calibration', () => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(<TreatmentProvider><Probe /></TreatmentProvider>));
    act(() => context.dispatch({ type: 'ALIGNMENT_ENTER' }));
    act(() => jest.advanceTimersByTime(250));
    const elapsed = context.state.timerElapsedTime;
    act(() => context.setCalibrationActive(true));
    act(() => {
      mockButtonListener({ data: new DataView(Uint8Array.from([1]).buffer) });
      jest.advanceTimersByTime(10000);
    });
    expect(context.state.stage).toBe(0);
    expect(context.state.timerElapsedTime).toBe(elapsed);
    act(() => context.setCalibrationActive(false));
    act(() => context.dispatch({ type: 'ALIGNMENT_ENTER' }));
    act(() => jest.advanceTimersByTime(100));
    expect(context.state.timerElapsedTime - elapsed).toBeLessThanOrEqual(100);
  } finally { act(() => root.unmount()); jest.useRealTimers(); }
});
