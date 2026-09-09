import { useCallback, useEffect, useRef, useState } from 'react';

export function useVideoDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const id = ++request.current;
    try {
      const available = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput' && device.deviceId);
      if (!mounted.current || id !== request.current) return;
      setDevices(available);
      setDeviceId(selected => selected && available.some(device => device.deviceId === selected) ? selected : null);
      setError(null);
    } catch {
      if (mounted.current && id === request.current) setError('Unable to list cameras. Check camera permissions.');
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const media = navigator.mediaDevices;
    media?.addEventListener('devicechange', refresh);
    return () => {
      mounted.current = false;
      request.current++;
      media?.removeEventListener('devicechange', refresh);
    };
  }, [refresh]);
  return { devices, deviceId, setDeviceId, refresh, error };
}
