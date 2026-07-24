import React, { createContext, useContext } from 'react';
import { useBleDeviceInternal } from '../hooks/useBleDeviceInternal';

type BleContextValue = ReturnType<typeof useBleDeviceInternal>;

const BleContext = createContext<BleContextValue | null>(null);

export function BleProvider({ children }: { children: React.ReactNode }) {
  const ble = useBleDeviceInternal({
    initialServiceUUID: '12345678-1234-5678-1234-56789abcdef0',
    initialCharUUID: '12345678-1234-5678-1234-56789abcdef2',
  });

  return <BleContext.Provider value={ble}>{children}</BleContext.Provider>;
}

export function useBleDevice() {
  const context = useContext(BleContext);

  if (!context) {
    throw new Error('useBleDevice must be used within a BleProvider');
  }

  return context;
}