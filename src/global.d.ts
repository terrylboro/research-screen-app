// Global Web Bluetooth minimal types for TypeScript
interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string | null;
  gatt?: BluetoothRemoteGATTServer | null;
  watchAdvertisements?: () => Promise<void>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

type BluetoothServiceUUID = string | number;

interface BluetoothRemoteGATTService {
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
  getCharacteristic(uuid: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  uuid: string;
  properties: { notify?: boolean; indicate?: boolean; read?: boolean; write?: boolean };
  value?: DataView | null;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  readValue(): Promise<DataView>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
}

interface BluetoothCharacteristicValueChangedEvent extends Event {
  target: EventTarget & { value: DataView | null };
}

interface RequestDeviceOptions {
  filters?: Array<{ services?: BluetoothServiceUUID[]; name?: string; namePrefix?: string }>;
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  getAvailability?(): Promise<boolean>;
}

declare global {
  interface Navigator {
    bluetooth?: Bluetooth;
  }
}

export {};
