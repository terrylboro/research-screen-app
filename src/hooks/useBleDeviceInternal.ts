import { useCallback, useEffect, useRef, useState } from 'react';

export type ReceivedMessage = {
  id: number;
  timestamp: number;
  data: DataView;
  source: 'imu' | 'button';
};

export type ButtonCommand = 'progress' | 'return';

const BUTTON_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef4';
const BATTERY_SERVICE_UUID = 0x180f;
const BATTERY_LEVEL_UUID = 0x2a19;

type UseBleDeviceOptions = {
  initialServiceUUID?: string;
  initialCharUUID?: string;
};

export function useBleDeviceInternal(options?: UseBleDeviceOptions) {
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  const [serviceUUID, setServiceUUID] = useState(
    options?.initialServiceUUID ?? '12345678-1234-5678-1234-56789abcdef0'
  );
  const [charUUID, setCharUUID] = useState(
    options?.initialCharUUID ?? '12345678-1234-5678-1234-56789abcdef2'
  );

  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [latestMessage, setLatestMessage] = useState<ReceivedMessage | null>(null);
  const [latestButtonMessage, setLatestButtonMessage] = useState<ReceivedMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const buttonCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const batteryCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const disconnectHandlerRef = useRef<((event: Event) => void) | null>(null);
  const messageIdRef = useRef(0);

  const appendMessage = useCallback((value: DataView, source: ReceivedMessage['source']) => {

    const msg = {
    id: messageIdRef.current,
    timestamp: Date.now(),
    data: value,
    source,
    };
    messageIdRef.current += 1;

    setLatestMessage(msg);
    if (source === 'button') {
      setLatestButtonMessage(msg);
    }

    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, []);

  /* Handle button press characteristics */
  const onButtonCharacteristicValueChanged = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (target?.value) {
      appendMessage(target.value, 'button');
    }
  }, [appendMessage]);

  const onCharacteristicValueChanged = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (target?.value) {
      appendMessage(target.value, 'imu');
    }
  }, [appendMessage]);

  const onBatteryLevelChanged = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;

    if (!value || value.byteLength === 0) {
      return;
    }

    setBatteryLevel(value.getUint8(0));
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);

    if (!navigator.bluetooth) {
      setError('Web Bluetooth API not available in this browser. Use Chrome or Edge.');
      setConnecting(false);
      return false;
    }

    try {
      const trimmedServiceUUID = serviceUUID.trim();
      const trimmedCharUUID = charUUID.trim();

      let options: RequestDeviceOptions;

      if (trimmedServiceUUID) {
        options = {
          filters: [{ services: [trimmedServiceUUID] }],
          optionalServices: [trimmedServiceUUID, BATTERY_SERVICE_UUID],
        };
      } else {
        options = {
          acceptAllDevices: true,
          optionalServices: trimmedCharUUID
            ? [trimmedCharUUID, BATTERY_SERVICE_UUID]
            : [BATTERY_SERVICE_UUID],
        };
      }

      const device = await navigator.bluetooth.requestDevice(options);
      deviceRef.current = device;
      setDeviceName(device.name || device.id || 'Unknown');

      const handleDisconnected = () => {
        setConnected(false);
        setBatteryLevel(null);
      };

      disconnectHandlerRef.current = handleDisconnected;
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt!.connect();
      let service: BluetoothRemoteGATTService;

      if (trimmedServiceUUID) {
        service = await server.getPrimaryService(trimmedServiceUUID);
      } else if (trimmedCharUUID) {
        service = await server.getPrimaryService(trimmedCharUUID);
      } else {
        setError('Please provide a service UUID or characteristic UUID.');
        return false;
      }

      let chosenCharacteristic: BluetoothRemoteGATTCharacteristic;

      if (!trimmedCharUUID) {
        const chars = await service.getCharacteristics();
        const notifyChar = chars.find(
          (c) => c.properties.notify || c.properties.indicate || c.properties.read
        );

        if (!notifyChar) {
          setError('No suitable characteristic found (notify/indicate/read).');
          return false;
        }

        chosenCharacteristic = notifyChar;
      } else {
        chosenCharacteristic = await service.getCharacteristic(trimmedCharUUID);
      }

      characteristicRef.current = chosenCharacteristic;

      if (chosenCharacteristic.properties.notify || chosenCharacteristic.properties.indicate) {
        chosenCharacteristic.addEventListener(
          'characteristicvaluechanged',
          onCharacteristicValueChanged as EventListener
        );
        await chosenCharacteristic.startNotifications();
      } else if (chosenCharacteristic.properties.read) {
        const value = await chosenCharacteristic.readValue();
        appendMessage(value, 'imu');
      }

      try {
        const buttonCharacteristic = await service.getCharacteristic(BUTTON_CHAR_UUID);
        buttonCharacteristicRef.current = buttonCharacteristic;

        if (buttonCharacteristic.properties.notify || buttonCharacteristic.properties.indicate) {
          buttonCharacteristic.addEventListener(
            'characteristicvaluechanged',
            onButtonCharacteristicValueChanged as EventListener
          );
          await buttonCharacteristic.startNotifications();
        } else if (buttonCharacteristic.properties.read) {
          const value = await buttonCharacteristic.readValue();
          appendMessage(value, 'button');
        }
      } catch (buttonError: any) {
        setError(buttonError?.message || String(buttonError));
        return false;
      }

      // The required IMU and button characteristics are ready, so report the
      // connection immediately. Optional battery discovery must not hold the UI
      // in its connecting state if a peripheral is slow to answer.
      setConnected(true);

      void (async () => {
        try {
          const batteryService = await server.getPrimaryService(BATTERY_SERVICE_UUID);
          const batteryCharacteristic = await batteryService.getCharacteristic(
            BATTERY_LEVEL_UUID
          );

          if (deviceRef.current !== device || !device.gatt?.connected) {
            return;
          }

          batteryCharacteristicRef.current = batteryCharacteristic;

          if (batteryCharacteristic.properties.read) {
            const initialValue = await batteryCharacteristic.readValue();
            if (initialValue.byteLength > 0 && deviceRef.current === device) {
              setBatteryLevel(initialValue.getUint8(0));
            }
          }

          if (
            batteryCharacteristic.properties.notify ||
            batteryCharacteristic.properties.indicate
          ) {
            batteryCharacteristic.addEventListener(
              'characteristicvaluechanged',
              onBatteryLevelChanged as EventListener
            );
            await batteryCharacteristic.startNotifications();
          }
        } catch (batteryError) {
          if (deviceRef.current === device) {
            batteryCharacteristicRef.current = null;
            setBatteryLevel(null);
          }
          console.warn('Battery Service unavailable:', batteryError);
        }
      })();

      return true;
    } catch (e: any) {
      setError(e?.message || String(e));
      setConnected(false);
      return false;
    } finally {
      setConnecting(false);
    }
  }, [
    serviceUUID,
    charUUID,
    onCharacteristicValueChanged,
    onButtonCharacteristicValueChanged,
    onBatteryLevelChanged,
    appendMessage,
  ]);

  const disconnect = useCallback(async () => {
    try {
      if (batteryCharacteristicRef.current) {
        try {
          await batteryCharacteristicRef.current.stopNotifications();
        } catch {
          // ignore
        }

        batteryCharacteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          onBatteryLevelChanged as EventListener
        );
        batteryCharacteristicRef.current = null;
      }

      if (buttonCharacteristicRef.current) {
        try {
          await buttonCharacteristicRef.current.stopNotifications();
        } catch {
          // ignore
        }

        buttonCharacteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          onButtonCharacteristicValueChanged as EventListener
        );
        buttonCharacteristicRef.current = null;
      }

      if (characteristicRef.current) {
        try {
          await characteristicRef.current.stopNotifications();
        } catch {
          // ignore
        }

        characteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          onCharacteristicValueChanged as EventListener
        );
        characteristicRef.current = null;
      }

      if (deviceRef.current && disconnectHandlerRef.current) {
        deviceRef.current.removeEventListener(
          'gattserverdisconnected',
          disconnectHandlerRef.current
        );
      }

      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }

      deviceRef.current = null;
      setConnected(false);
      setConnecting(false);
      setDeviceName(null);
      setMessages([]);
      setLatestMessage(null);
      setLatestButtonMessage(null);
      setBatteryLevel(null);
      setError(null);
      messageIdRef.current = 0;
    } catch {
      // ignore
    }
  }, [
    onCharacteristicValueChanged,
    onButtonCharacteristicValueChanged,
    onBatteryLevelChanged,
  ]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  return {
    deviceName,
    connected,
    connecting,
    batteryLevel,
    serviceUUID,
    setServiceUUID,
    charUUID,
    setCharUUID,
    messages,
    latestMessage,
    latestButtonMessage,
    error,
    connect,
    disconnect,
    clearMessages,
  };
}

// Working Bluetooth code from App.tsx
// // Bluetooth
//   const [deviceName, setDeviceName] = useState<string | null>(null);
//   const [connected, setConnected] = useState(false);

//   const [serviceUUID, setServiceUUID] = useState("12345678-1234-5678-1234-56789abcdef0");
//   const [charUUID, setCharUUID] = useState("12345678-1234-5678-1234-56789abcdef2");

//   const [messages, setMessages] = useState<ReceivedMessage[]>([]);
//   const [error, setError] = useState<string | null>(null);

//   const deviceRef = useRef<BluetoothDevice | null>(null);
//   const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

//   function onCharacteristicValueChanged(event: Event) {
//     const target = event.target as BluetoothRemoteGATTCharacteristic;
//     if (target?.value) {
//       appendMessage(target.value as DataView);
//     }
//   }

//   async function connect() {
//     setError(null);
//     if (!navigator.bluetooth) {
//       setError('Web Bluetooth API not available in this browser. Use Chrome or Edge.');
//       return;
//     }

//     try {
//       let options: RequestDeviceOptions;
//       if (serviceUUID.trim()) {
//         options = {
//           filters: [{ services: [serviceUUID.trim()] }],
//           optionalServices: [serviceUUID.trim()]
//         };
//       } else {
//         options = {
//           acceptAllDevices: true,
//           optionalServices: charUUID.trim() ? [charUUID.trim()] : undefined
//         };
//       }

//       const device = await navigator.bluetooth.requestDevice(options);
//       deviceRef.current = device;
//       setDeviceName(device.name || device.id || 'Unknown');

//       device.addEventListener('gattserverdisconnected', () => {
//         setConnected(false);
//       });

//       const server = await device.gatt!.connect();
//       let service: BluetoothRemoteGATTService;

//       if (serviceUUID.trim()) {
//         service = await server.getPrimaryService(serviceUUID.trim());
//       } else if (charUUID.trim()) {
//         service = await server.getPrimaryService(charUUID.trim());
//       } else {
//         setError('Please provide a service UUID or characteristic UUID.');
//         return;
//       }

//       if (!charUUID.trim()) {
//         const chars = await service.getCharacteristics();
//         const notifyChar = chars.find((c: BluetoothRemoteGATTCharacteristic) =>
//           c.properties.notify || c.properties.indicate || c.properties.read
//         );
//         if (!notifyChar) {
//           setError('No suitable characteristic found (notify/indicate/read).');
//           return;
//         }
//         characteristicRef.current = notifyChar;
//       } else {
//         characteristicRef.current = await service.getCharacteristic(charUUID.trim());
//       }

//       const char = characteristicRef.current!;
//       if (char.properties.notify || char.properties.indicate) {
//         await char.startNotifications();
//         char.addEventListener('characteristicvaluechanged', onCharacteristicValueChanged as EventListener);
//       } else if (char.properties.read) {
//         const value = await char.readValue();
//         appendMessage(value);
//       }

//       setConnected(true);
//     } catch (e: any) {
//       setError(e?.message || String(e));
//     }
//   }

//   async function disconnect() {
//     try {
//       if (characteristicRef.current) {
//         try {
//           await characteristicRef.current.stopNotifications();
//         } catch {
//           // ignore
//         }
//         characteristicRef.current.removeEventListener('characteristicvaluechanged', onCharacteristicValueChanged as EventListener);
//         characteristicRef.current = null;
//       }
//       if (deviceRef.current?.gatt?.connected) {
//         deviceRef.current.gatt.disconnect();
//       }
//       deviceRef.current = null;
//       setConnected(false);
//       setDeviceName(null);
//     } catch {
//       // ignore
//     }
//   }
