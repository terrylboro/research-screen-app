import { useState } from 'react';
import {
  Button,
  Card,
  Group,
  Stack,
  Text,
  Flex,
  Box,
  Switch,
} from '@mantine/core';

import HeadRendering from  './HeadRendering';
import CanalRendering from './CanalRendering';
import { useTreatment } from '../context/TreatmentProvider';
import { TreatmentStage } from '../types/treatmentTypes';
import AlignmentProgress from '../custom/alignmentProgress';
import LiveChartCard from '../custom/liveChartCard';
import LiveWebcam from '../components/LiveWebcam';
import SimpleTimer from '../custom/simpleTimer';

export default function ResearchScreen() {

  const treatment = useTreatment();
  const [cameraEnabled, setCameraEnabled] = useState(true);

  return (
    <Box
      style={{
        height: 'calc(100vh - 60px - 32px)',
        minHeight: 0,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'minmax(0, 0.9fr) minmax(0, 1.1fr)',
        gap: 16,
      }}
    >

      <Flex gap="xl" wrap="nowrap" w="100%" align="stretch" style={{ minHeight: 0, overflow: 'hidden' }}>
        <Box style={{ flex: 4, minWidth: 0, display: 'flex' }}>
          <LiveChartCard
            title="Orientation Data Stream"
            orientationRef={treatment.orientationRef}
            points={25}
            updateIntervalMs={250}
          />
        </Box>
        <Box style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <Card withBorder shadow="sm" radius="md" style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <Stack h="100%" style={{ minHeight: 0 }}>
              <Text fw={600}>Head Position</Text>

              <Box style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
                <HeadRendering calibrateMode={false} />
              </Box>

            </Stack>
          </Card>
        </Box>

      </Flex>
      


      <Flex gap="xl" wrap="nowrap" w="100%" align="stretch" style={{ minHeight: 0, overflow: 'hidden' }}>

        {/* <Card withBorder shadow="sm" radius="md">
        <Text fw={600}>Latest data</Text>
        <Text fw={600}>aX | aY | aZ | gX | gY | gZ | Roll | Pitch | Yaw</Text>
        <Text>{treatment.latestSampleText}</Text>
        </Card> */}

        <Box style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <Card withBorder shadow="sm" radius="md" style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <Stack h="100%" style={{ minHeight: 0 }}>
              <Text fw={600}>Stage Progress</Text>

              {/* <Text fw={600} >Hold time</Text>
              <Slider
                  defaultValue={45}
                  min={30} max={60}
                  step={15}
                  marks={sliderMarks}
                  label={(val) => sliderMarks.find((mark) => mark.value === val)!.label} 
                  onChange={(value) => treatment.dispatch({type: 'SET_HOLD_DURATION', holdDuration: value as HoldDurationType})}
              /> */}

              {/* <Switch mt="md" defaultChecked label="Show arrows" onChange={() => treatment.setShowGuidanceArrows(!treatment.showGuidanceArrows)}/> */}

              <Button
                h={48}
                onClick={() => treatment.dispatch({ type: 'PROGRESS' })}
              >
                Progress Stage
              </Button>

              <Button
                h={48}
                onClick={() => treatment.dispatch({ type: 'RESET_PROGRESS' })}
              >
                Restart Manoeuvre
              </Button>

              <Text fw={600}>Recording</Text>
              
              <Button
                h={48}
                variant={treatment.isRecording ? 'light' : 'filled'}
                color={treatment.isRecording ? 'red' : 'blue'}
                onClick={() => {
                  if (treatment.isRecording) {
                    treatment.stopRecording();
                    return;
                  }

                  treatment.startRecording();
                }}
                >
                {treatment.isRecording ? 'Stop Recording' : 'Record'}
              </Button>
              
              <SimpleTimer />

              

              {/* < Stepper active={treatment.state.stage} orientation="vertical" mt="md" size="sm" radius="xl" color={(treatment.state.stage === TreatmentStage.COMPLETE) ? "green" : "blue"} styles={{ step: { cursor: "default" } }}>
                <Stepper.Step label="Position 1" description="45 degrees left" />
                <Stepper.Step label="Position 2" description="45 degrees right" />
                <Stepper.Step label="Position 3" description="135 degrees right" />
                <Stepper.Step label="Position 4" description="Upright, chin tucked" />
              </Stepper> */}

              

              {/* <Button mt="md" onClick={() => {}}>
                Record
              </Button> */}

            </Stack>
          </Card>
        </Box>

        <Box style={{ flex: 2, minWidth: 0, display: 'flex' }}>
          <Card withBorder shadow="sm" radius="md" style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <Stack h="100%" style={{ minHeight: 0 }}>
              <Group justify="space-between">
                <Text fw={600}>Canal Alignment</Text>
                <Text size="sm">{(treatment.alignmentRef!.current * 100).toFixed(0)}%</Text>
                <Switch mt="md" defaultChecked label="Show arrows" onChange={() => treatment.setShowGuidanceArrows(!treatment.showGuidanceArrows)}/>
              </Group>
              {/* <Text fw={600}>Canal Alignment</Text> */}
              
              <AlignmentProgress
                score={treatment.alignmentRef!.current}
                greenThreshold={
                  treatment.state.stage === TreatmentStage.STAGE_2 ? 75 : 85
                }
              />
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  background: 'BACKGR_COLOUR_CSS',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >

                <CanalRendering/>
              </div>

              {/* <Text fw={600}>Progress</Text>
              < Progress value={treatment.state.stageProgress * 100}
                color={treatment.state.stage === TreatmentStage.COMPLETE ? "green" : "blue"}
                animated = {treatment.state.stage === TreatmentStage.COMPLETE}
                mt="xs" size="xl" radius="xl" /> */}
            </Stack>
          </Card>
        </Box>

        {/* <Box style={{ flex: 2, minWidth: 0, display: 'flex' }}>
          <Card withBorder shadow="sm" radius="md" style={{ flex: 1, minHeight: 480, height: '100%' }}>
            <Stack h="100%" >
              <Text fw={600}>Head Position</Text>

              <HeadRendering calibrateMode={false} />

            </Stack>
          </Card>
        </Box> */}

        <Box style={{ flex: 2, minWidth: 0, display: 'flex' }}>
          <Card withBorder shadow="sm" radius="md" style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <Stack h="100%" style={{ minHeight: 0 }}>
              <Group justify="space-between">
                <Text fw={600}>Canal Video</Text>
                <Switch
                  checked={cameraEnabled}
                  label="Camera"
                  onChange={(event) => setCameraEnabled(event.currentTarget.checked)}
                />
              </Group>
              <LiveWebcam height="100%" enabled={cameraEnabled} />

            </Stack>
          </Card>
        </Box>
      </Flex> 

      {/* <Card withBorder shadow="sm" radius="md"> */}
        {/* <Text fw={600}>Progress</Text> */}
        {/* < Stepper active={treatment.state.stage} mt="md" size="md" radius="xl" color={(treatment.state.stage === TreatmentStage.COMPLETE) ? "green" : "blue"} styles={{ step: { cursor: "default" } }}>
          <Stepper.Step label="Position 1" />
          <Stepper.Step label="Position 2" />
          <Stepper.Step label="Position 3" />
          <Stepper.Step label="Position 4" />
        </Stepper> */}
        {/* < Progress value={treatment.state.stageProgress * 100}
          color={treatment.state.stage === TreatmentStage.COMPLETE ? "green" : "blue"}
          animated = {treatment.state.stage === TreatmentStage.COMPLETE}
          mt="md" size="xl" radius="xl" /> */}
        
      {/* </Card> */}

      
    </Box>
  );
}

// Useful components
// {/* <Card withBorder shadow="sm" radius="md">
//         <Text fw={600}>Latest data</Text>
//         <Text fw={600}>aX | aY | aZ | gX | gY | gZ | Roll | Pitch | Yaw</Text>
//         <Text>{treatment.latestSampleText}</Text>
//         </Card> */}
