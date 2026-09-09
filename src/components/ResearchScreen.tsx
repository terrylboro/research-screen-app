import { useEffect, useRef, useState } from 'react';
import { Button, Card, Group, Stack, Text, Box, Switch, Select } from '@mantine/core';
import HeadRendering from './HeadRendering';
import CanalRendering from './CanalRendering';
import HeadOrientationValues from './HeadOrientationValues';
import { useTreatment } from '../context/TreatmentProvider';
import { TreatmentStage } from '../types/treatmentTypes';
import AlignmentProgress from '../custom/alignmentProgress';
import LiveWebcam from './LiveWebcam';
import SimpleTimer from '../custom/simpleTimer';
import './ResearchScreen.css';
import { useVideoDevices } from '../hooks/useVideoDevices';

export default function ResearchScreen() {
  const treatment = useTreatment();
  const cameras = useVideoDevices();
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ width: '100%', height: '100%', scale: 1 });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      // Scale the complete layout on short/narrow screens instead of scrolling.
      const scale = Math.min(1, width / 1000, height / 560);
      setFit({ width: `${width / scale}px`, height: `${height / scale}px`, scale });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <Box className="research-viewport" ref={viewportRef}>
      <Box className="research-screen" style={{ width: fit.width, height: fit.height, transform: `scale(${fit.scale})` }}>
        <Stack className="research-video-column" gap="md">
          <Card className="research-video-card" withBorder shadow="sm" radius="md">
            <Stack className="research-card-content" gap="md">
              <Group justify="space-between">
                <Text fw={600}>Canal Video</Text>
                <Select
                aria-label="Camera source"
                value={cameras.deviceId ?? 'default-camera'}
                onChange={(value) => cameras.setDeviceId(value === 'default-camera' ? null : value)}
                data={[
                  ...cameras.devices.map((device, index) => ({ value: device.deviceId, label: device.label || `Camera ${index + 1}` })),
                ]}
                allowDeselect={false}
                error={cameras.error}
              />
                <Switch checked={cameraEnabled} label="Camera" onChange={(event) => setCameraEnabled(event.currentTarget.checked)} />
              </Group>
              
              <Box className="research-video-space">
                <Box className="research-video-frame">
                  <LiveWebcam width="100%" height="100%" enabled={cameraEnabled} deviceId={cameras.deviceId} onStreamReady={cameras.refresh} />
                </Box>
              </Box>
            </Stack>
          </Card>
          <HeadOrientationValues />
        </Stack>

        <Stack className="research-model-column" gap="md">
          <Card withBorder shadow="sm" radius="md">
            <Stack className="research-card-content" gap="sm">
              <Text fw={600}>Head Position</Text>
              <Box className="research-head-frame"><HeadRendering calibrateMode={false} /></Box>
            </Stack>
          </Card>
          <Card withBorder shadow="sm" radius="md">
            <Stack className="research-card-content" gap="sm">
              <Group justify="space-between">
                <Text fw={600}>Canal Alignment</Text>
                <Text size="sm">{(treatment.alignmentRef!.current * 100).toFixed(0)}%</Text>
              </Group>
              {/* <Switch checked={treatment.showGuidanceArrows} label="Show arrows" onChange={(event) => treatment.setShowGuidanceArrows(event.currentTarget.checked)} /> */}
              <AlignmentProgress score={treatment.alignmentRef!.current} greenThreshold={treatment.state.stage === TreatmentStage.STAGE_2 ? 75 : 85} />
              <Box className="research-canal-frame"><CanalRendering /></Box>
            </Stack>
          </Card>
        </Stack>

        <Card className="research-interface" withBorder shadow="sm" radius="md">
          <Stack gap="md">
            <Text fw={600}>Current Position Control</Text>
            <Button h={48} disabled={treatment.state.stage === TreatmentStage.COMPLETE} onClick={() => treatment.dispatch({ type: 'PROGRESS' })}>Progress</Button>
            <Button h={48} disabled={treatment.state.stage === TreatmentStage.STAGE_1} onClick={() => treatment.dispatch({ type: 'RETURN_TO_PREVIOUS_STAGE' })}>Go Back</Button>
            <Text fw={600}>Recording</Text>
            <Switch label={treatment.saveAsJson ? "Saving as JSON file" : "Saving as CSV file"} checked={treatment.saveAsJson} onChange={(event) => treatment.setSaveAsJson(event.currentTarget.checked)} />
            <Button h={48} variant={treatment.isRecording ? 'light' : 'filled'} color={treatment.isRecording ? 'red' : 'blue'} onClick={treatment.isRecording ? treatment.stopRecording : treatment.startRecording}>
              {treatment.isRecording ? 'Stop Recording' : 'Record'}
            </Button>
            <SimpleTimer />
          </Stack>
        </Card>
      </Box>
    </Box>
  );
}
