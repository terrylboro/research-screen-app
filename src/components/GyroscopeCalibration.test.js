import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import GyroscopeCalibration from './GyroscopeCalibration';
let mockTreatment;
let mockButton;
jest.mock('../context/TreatmentProvider', () => ({ useTreatment: () => mockTreatment }));
const mockBle = { subscribeToButtonMessages: listener => { mockButton = listener; return () => { mockButton = null; }; } };
jest.mock('../context/BleProvider', () => ({ useBleDevice: () => mockBle }));
jest.mock('@mantine/core', () => {
  const React = require('react');
  const result = {};
  for (const name of ['Alert', 'Badge', 'Button', 'Card', 'Group', 'Image', 'Progress', 'SimpleGrid', 'Stack', 'Text', 'Title']) {
    result[name] = ({ children, onClick, disabled, role, ...props }) => name === 'Image' ? null : React.createElement(name === 'Button' ? 'button' : 'div', { onClick, disabled, role, 'data-kind': name }, children);
  }
  return result;
});
let host, root, done, back;
beforeEach(() => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockTreatment = { latestImuSample: { timestamp: Date.now(), ax: 1, ay: 0, az: 0, gx: 0.1, gy: 0.2, gz: -0.1 }, setGyroscopeOffsets: jest.fn(), setSensorToAnatomicalMatrix: jest.fn(), calibrateOffset: jest.fn() };
  done = jest.fn(); back = jest.fn(); host = document.createElement('div'); root = createRoot(host);
  render();
});
afterEach(() => { act(() => root.unmount()); jest.useRealTimers(); });
function render() { act(() => root.render(<GyroscopeCalibration onComplete={done} onBack={back} />)); }
function tick(ms) { act(() => jest.advanceTimersByTime(ms)); }
function sample(gyro = [0.1, 0.2, -0.1]) {
  tick(50);
  mockTreatment.latestImuSample = { timestamp: Date.now(), ax: 1, ay: 0, az: 0, gx: gyro[0], gy: gyro[1], gz: gyro[2] };
  render();
}
function button(label) { return [...host.querySelectorAll('button')].find(node => node.textContent === label); }
function start() { act(() => button('Start calibration').click()); }
function movement(axis, step) {
  for (const sign of [1, -1, 1, -1]) {
    for (let i = 0; i < 12; i++) {
      const gyro = [0.1, 0.2, -0.1]; gyro[axis] += sign * 30; sample(gyro);
      if (mockTreatment.setSensorToAnatomicalMatrix.mock.calls.length || host.querySelectorAll('[data-kind="Badge"]')[step]?.textContent === 'Good') return;
    }
  }
}
it('runs all three checks, commits bias and axes, then recentres without recording', () => {
  start(); tick(3000);
  for (let i = 0; i < 60; i++) sample();
  expect(mockTreatment.setGyroscopeOffsets).not.toHaveBeenCalled();
  tick(500); movement(1, 1); tick(500); movement(0, 2);
  expect(mockTreatment.setGyroscopeOffsets).toHaveBeenCalledWith({ gx: 0.1, gy: 0.2, gz: -0.1 });
  const matrix = mockTreatment.setSensorToAnatomicalMatrix.mock.calls[0][0];
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((value, i) => expect(matrix[i]).toBeCloseTo(value));
  expect(done).not.toHaveBeenCalled();
  // A fresh pose in the calibrated basis must arrive before finishing.
  act(() => button('Finish calibration').click());
  expect(done).not.toHaveBeenCalled();
  for (let i = 0; i < 12; i++) sample();
  act(() => mockButton({ data: new DataView(Uint8Array.from([1, 0]).buffer) }));
  expect(mockTreatment.calibrateOffset).toHaveBeenCalledTimes(1);
  expect(done).toHaveBeenCalledTimes(1);
});
it('rejects empty still recordings and cancels pending automatic steps on unmount', () => {
  start(); tick(6000);
  expect(host.querySelector('[data-kind="Badge"]').textContent).toBe('Repeat');
  expect(mockTreatment.setSensorToAnatomicalMatrix).not.toHaveBeenCalled();
  act(() => root.unmount());
  tick(1000);
  expect(jest.getTimerCount()).toBe(0);
  expect(mockButton).toBeNull();
  root = createRoot(host);
});
it('routes the firmware back command to cancellation', () => {
  start();
  act(() => mockButton({ data: new DataView(Uint8Array.from([2]).buffer) }));
  expect(back).toHaveBeenCalledTimes(1);
  expect(mockTreatment.setGyroscopeOffsets).not.toHaveBeenCalled();
});
