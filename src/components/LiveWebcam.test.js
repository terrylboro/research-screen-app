import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import LiveWebcam from './LiveWebcam';
import { useVideoDevices } from '../hooks/useVideoDevices';
jest.mock('@mantine/core', () => {
  const React = require('react');
  const wrapper = ({ children }) => React.createElement('div', null, children);
  return { Box: wrapper, Loader: wrapper, Stack: wrapper, Text: wrapper };
});
let cameras;
function Harness({ enabled = true }) {
  cameras = useVideoDevices();
  return <LiveWebcam enabled={enabled} deviceId={cameras.deviceId} onStreamReady={cameras.refresh} />;
}
function stream() { const stop = jest.fn(); return { getTracks: () => [{ stop }], stop }; }
let host, root, media, play;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  media = new EventTarget();
  media.enumerateDevices = jest.fn().mockResolvedValue([
    { kind: 'videoinput', deviceId: 'one', label: 'Built-in' },
    { kind: 'videoinput', deviceId: 'two', label: 'USB camera' },
    { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
  ]);
  media.getUserMedia = jest.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
  play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  host = document.createElement('div'); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); play.mockRestore(); });
it('lists video devices, switches streams, and falls back when a camera is unplugged', async () => {
  const first = stream(), second = stream(), fallback = stream();
  media.getUserMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(fallback);
  await act(async () => root.render(<Harness />));
  expect(cameras.devices.map(device => device.deviceId)).toEqual(['one', 'two']);
  expect(host.querySelector('video').srcObject).toBe(first);
  await act(async () => cameras.setDeviceId('two'));
  expect(first.stop).toHaveBeenCalledTimes(1);
  expect(media.getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { exact: 'two' } }, audio: false });
  expect(host.querySelector('video').srcObject).toBe(second);
  media.enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'one', label: 'Built-in' }]);
  await act(async () => media.dispatchEvent(new Event('devicechange')));
  expect(cameras.deviceId).toBeNull();
  expect(second.stop).toHaveBeenCalledTimes(1);
  expect(host.querySelector('video').srcObject).toBe(fallback);
  await act(async () => root.render(<Harness enabled={false} />));
  expect(fallback.stop).toHaveBeenCalledTimes(1);
  expect(host.querySelector('video').srcObject).toBeNull();
});
it('discards a stale stream when the selection changes before permission resolves', async () => {
  let resolveFirst;
  const stale = stream(), selected = stream();
  media.getUserMedia.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce(selected);
  await act(async () => root.render(<Harness />));
  await act(async () => cameras.setDeviceId('two'));
  await act(async () => resolveFirst(stale));
  expect(stale.stop).toHaveBeenCalledTimes(1);
  expect(host.querySelector('video').srcObject).toBe(selected);
});
