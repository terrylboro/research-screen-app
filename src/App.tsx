import { useState } from 'react';
import { AppShell, Badge, Button, Group, Modal, Select, Text, useMantineTheme } from '@mantine/core';
import ResearchScreen from './components/ResearchScreen';
import GyroscopeCalibration from './components/GyroscopeCalibration';
import { useBleDevice } from './context/BleProvider';
import { useTreatment } from './context/TreatmentProvider';
import { CanalType, EarSide } from './types/treatmentTypes';

function App(): JSX.Element {
  const theme = useMantineTheme();
  const ble = useBleDevice();
  const treatment = useTreatment();
  const [calibrationOpen, setCalibrationOpen] = useState(false);

  const selectEar = (ear: string | null) => {
    if (ear === 'left' || ear === 'right') {
      treatment.dispatch({ type: 'SELECT_EAR', ear: ear as EarSide });
    }
  };

  const selectCanal = (canal: string | null) => {
    if (canal === 'anterior' || canal === 'posterior' || canal === 'lateral') {
      treatment.dispatch({ type: 'SELECT_CANAL', canal: canal as CanalType });
    }
  };

  return (
    <AppShell header={{ height: 60 }} padding="md" style={{ height: '100vh', overflow: 'hidden' }}>
      <AppShell.Header style={{ background: theme.colors.blue[6], color: theme.white }}>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Text fw={700} size="xl">HeadSpin Research</Text>
            <Badge color={ble.connected ? 'green' : 'gray'} variant="filled">
              {ble.connected ? `Connected${ble.deviceName ? `: ${ble.deviceName}` : ''}` : 'Disconnected'}
            </Badge>
            {ble.batteryLevel !== null && <Badge color="teal">{ble.batteryLevel}% battery</Badge>}
          </Group>

          <Group gap="sm" wrap="nowrap">
            <Select
              aria-label="Affected ear"
              data={[{ value: 'left', label: 'Left ear' }, { value: 'right', label: 'Right ear' }]}
              value={treatment.state.affectedEar ?? 'left'}
              onChange={selectEar}
              allowDeselect={false}
              w={120}
            />
            <Select
              aria-label="Affected canal"
              data={[
                { value: 'posterior', label: 'Posterior' },
                { value: 'anterior', label: 'Anterior' },
                { value: 'lateral', label: 'Lateral' },
              ]}
              value={treatment.state.affectedCanal ?? 'posterior'}
              onChange={selectCanal}
              allowDeselect={false}
              w={130}
            />
            <Button
              color={ble.connected ? 'red' : 'green'}
              loading={ble.connecting}
              onClick={() => void (ble.connected ? ble.disconnect() : ble.connect())}
            >
              {ble.connected ? 'Disconnect' : 'Connect Bluetooth'}
            </Button>
            <Button
              color="teal"
              disabled={!ble.connected}
              onClick={() => setCalibrationOpen(true)}
            >
              Calibrate gyroscope
            </Button>
            <Button
              color="cyan"
              disabled={!ble.connected}
              onClick={treatment.calibrateOffset}
            >
              Recenter head
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <Modal
        opened={calibrationOpen}
        onClose={() => setCalibrationOpen(false)}
        title="Gyroscope calibration"
        centered
        closeOnClickOutside={false}
      >
        <GyroscopeCalibration onComplete={() => setCalibrationOpen(false)} />
      </Modal>

      <AppShell.Main style={{ height: '100vh', overflow: 'hidden', background: theme.colors.gray[0] }}>
        {ble.error && (
          <Text c="red" size="sm" role="alert" mb="xs">
            {ble.error}
          </Text>
        )}
        <ResearchScreen />
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
