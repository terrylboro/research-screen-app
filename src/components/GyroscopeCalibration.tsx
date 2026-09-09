import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Image, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { GyroscopeOffsets, LatestImuSample, useTreatment } from '../context/TreatmentProvider';
import { CENTRAL_FOREHEAD_REFERENCE_MATRIX } from '../utils/imuCoordinateFrames';
import { useBleDevice } from '../context/BleProvider';
import { calculateSensorToAnatomicalMatrix, evaluateMovementCycles } from '../utils/sensorSegmentAlignment';

const STATIC_RECORDING_DURATION_MS = 3000;
const STATIC_SETTLING_DURATION_MS = 3000;
const DYNAMIC_RECORDING_DURATION_MS = 30000;
// Match the NHS stillness thresholds, allowing small postural tremor.
const STATIC_ACCEL_NORM_TOLERANCE_G = 0.1;
const STATIC_ACCEL_VARIABILITY_LIMIT_G = 0.04;
const STATIC_GYRO_NOISE_LIMIT_DPS = 3;
type RecordedStep = 'still' | 'nod' | 'shake';
type StepStatus = 'pending' | 'active' | 'good' | 'bad';
type CalibrationSample = Pick<LatestImuSample, 'ax' | 'ay' | 'az' | 'gx' | 'gy' | 'gz'>;

type GuidedCalibrationScreenProps = {
  onBack: () => void;
  onComplete: () => void;
};

const steps = [
  { id: 'still', title: 'Look forwards and Hold Still', instruction: 'Look directly forwards and hold the patient\'s head completely still for 3 seconds.', image: 'HeadSpin Device Placement Central.webp', imageAlt: 'Cartoon patient looking forwards with the sensor centred on the head', buttonLabel: 'Start calibration' },
  { id: 'nod', title: 'Nod Head Twice', instruction: 'Guide the patient through 2 controlled head nods, as though they are saying "yes".', image: 'Calibration Demonstration Nod.webp', imageAlt: 'Cartoon patient demonstrating a gentle downward nod' },
  { id: 'shake', title: 'Shake Head Twice', instruction: 'Guide the patient through 2 controlled head shakes, as though they are saying "no".', image: 'Calibration Demonstration Shake.webp', imageAlt: 'Cartoon patient demonstrating a gentle side-to-side head turn' },
] as const;

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function vectorNorm(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

function stationaryOffsets(samples: CalibrationSample[]): GyroscopeOffsets {
  return {
    gx: median(samples.map((sample) => sample.gx)),
    gy: median(samples.map((sample) => sample.gy)),
    gz: median(samples.map((sample) => sample.gz)),
  };
}

function stationaryGyroscopeNoise(samples: CalibrationSample[], offsets: GyroscopeOffsets) {
  if (samples.length === 0) return Number.POSITIVE_INFINITY;
  const squaredMagnitudes = samples.map((sample) => {
    const gx = sample.gx - offsets.gx;
    const gy = sample.gy - offsets.gy;
    const gz = sample.gz - offsets.gz;
    return gx * gx + gy * gy + gz * gz;
  });
  return Math.sqrt(squaredMagnitudes.reduce((sum, value) => sum + value, 0) / squaredMagnitudes.length);
}

function validateStationarySamples(samples: CalibrationSample[], noiseFloor: number) {
  if (samples.length < 10) return 'Too few sensor samples were received during the still recording.';
  const accelNorms = samples.map((sample) => vectorNorm(sample.ax, sample.ay, sample.az));
  const accelStdNorm = vectorNorm(
    standardDeviation(samples.map((sample) => sample.ax)),
    standardDeviation(samples.map((sample) => sample.ay)),
    standardDeviation(samples.map((sample) => sample.az))
  );
  if (Math.abs(median(accelNorms) - 1) >= STATIC_ACCEL_NORM_TOLERANCE_G) return 'The device experienced acceleration during the still recording.';
  if (accelStdNorm >= STATIC_ACCEL_VARIABILITY_LIMIT_G || noiseFloor >= STATIC_GYRO_NOISE_LIMIT_DPS) return 'The head or device moved during the still recording.';
  return null;
}

export default function GuidedCalibrationScreen({
  onBack,
  onComplete,
}: GuidedCalibrationScreenProps) {
  const {
    latestImuSample,
    setGyroscopeOffsets,
    setSensorToAnatomicalMatrix,
    calibrateOffset,
  } = useTreatment();
  const ble = useBleDevice();
  const [appliedAt, setAppliedAt] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [statuses, setStatuses] = useState<StepStatus[]>(['pending', 'pending', 'pending']);
  const [stepErrors, setStepErrors] = useState<(string | null)[]>([null, null, null]);
  const [isRecordingStep, setIsRecordingStep] = useState(false);
  const [remainingMs, setRemainingMs] = useState(STATIC_RECORDING_DURATION_MS);
  const [detectedCycles, setDetectedCycles] = useState(0);
  const [needsThirdCycle, setNeedsThirdCycle] = useState(false);
  const [readyForTreatment, setReadyForTreatment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const samplesRef = useRef<Record<RecordedStep, CalibrationSample[]>>({ still: [], nod: [], shake: [] });
  const statusesRef = useRef<StepStatus[]>(statuses);
  const latestImuSampleRef = useRef(latestImuSample);
  const lastTimestampRef = useRef<number | null>(null);
  const recordingStartsAtRef = useRef(0);
  const offsetsRef = useRef<GyroscopeOffsets>({ gx: 0, gy: 0, gz: 0 });
  const noiseFloorRef = useRef(0);
  const completionLockedRef = useRef(false);
  const initialPassCompleteRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const beginStepRef = useRef<(index: number) => void>(() => {});
  statusesRef.current = statuses;
  latestImuSampleRef.current = latestImuSample;
  onCompleteRef.current = onComplete;

  const nextStepTimerRef = useRef<number | null>(null);
  const scheduleStep = useCallback((index: number) => {
    if (nextStepTimerRef.current !== null) window.clearTimeout(nextStepTimerRef.current);
    nextStepTimerRef.current = window.setTimeout(() => {
      nextStepTimerRef.current = null;
      beginStepRef.current(index);
    }, 500);
  }, []);
  useEffect(() => () => {
    if (nextStepTimerRef.current !== null) window.clearTimeout(nextStepTimerRef.current);
  }, []);

  const updateStatuses = useCallback((next: StepStatus[]) => {
    statusesRef.current = next;
    setStatuses(next);
  }, []);

  const beginStep = useCallback((index: number) => {
    if (!latestImuSampleRef.current || Date.now() - latestImuSampleRef.current.timestamp > 1000) {
      setError('Waiting for motion data from the device. Check the connection and try again.');
      return;
    }
    const stepId = steps[index].id;
    samplesRef.current[stepId] = [];
    lastTimestampRef.current = null;
    recordingStartsAtRef.current = performance.now() + (index === 0 ? STATIC_SETTLING_DURATION_MS : 0);
    completionLockedRef.current = false;
    setStepIndex(index);
    updateStatuses(statusesRef.current.map((status, itemIndex) => itemIndex === index ? 'active' : status));
    setStepErrors((items) => items.map((item, itemIndex) => itemIndex === index ? null : item));
    setError(null);
    setDetectedCycles(0);
    setNeedsThirdCycle(false);
    setRemainingMs(index === 0 ? STATIC_RECORDING_DURATION_MS : DYNAMIC_RECORDING_DURATION_MS);
    setIsRecordingStep(true);
  }, [updateStatuses]);
  beginStepRef.current = beginStep;

  const calculateFinalAlignment = useCallback(() => {
    try {
      const alignmentMatrix = calculateSensorToAnatomicalMatrix(
        samplesRef.current.nod,
        samplesRef.current.shake,
        [offsetsRef.current.gx, offsetsRef.current.gy, offsetsRef.current.gz],
        [
          median(samplesRef.current.still.map((sample) => sample.ax)),
          median(samplesRef.current.still.map((sample) => sample.ay)),
          median(samplesRef.current.still.map((sample) => sample.az)),
        ],
        noiseFloorRef.current,
        CENTRAL_FOREHEAD_REFERENCE_MATRIX
      );
      // Commit only after all three recordings and axis checks pass.
      setGyroscopeOffsets(offsetsRef.current);
      setSensorToAnatomicalMatrix(alignmentMatrix);
      setAppliedAt(Date.now());
      setReadyForTreatment(true);
      setStepIndex(3);
      setError(null);
      return true;
    } catch (calibrationError) {
      const message = calibrationError instanceof Error ? calibrationError.message : 'The movement axes could not be calculated.';
      const lowerMessage = message.toLowerCase();
      const failedIndices = lowerMessage.includes('too similar') ? [1, 2] : lowerMessage.includes('nod') && !lowerMessage.includes('shake') ? [1] : [2];
      const nextStatuses = [...statusesRef.current];
      const nextErrors = [...stepErrors];
      failedIndices.forEach((index) => {
        nextStatuses[index] = 'bad';
        nextErrors[index] = message;
      });
      updateStatuses(nextStatuses);
      setStepErrors(nextErrors);
      setError(message);
      scheduleStep(failedIndices[0]);
      return false;
    }
  }, [setGyroscopeOffsets, setSensorToAnatomicalMatrix, stepErrors, updateStatuses, scheduleStep]);

  const finishStep = useCallback((index: number, passed: boolean, message: string | null, acceptedSamples?: CalibrationSample[]) => {
    if (acceptedSamples) samplesRef.current[steps[index].id] = acceptedSamples;
    setIsRecordingStep(false);
    setNeedsThirdCycle(false);
    const nextStatuses = [...statusesRef.current];
    nextStatuses[index] = passed ? 'good' : 'bad';
    updateStatuses(nextStatuses);
    setStepErrors((items) => items.map((item, itemIndex) => itemIndex === index ? message : item));
    if (message) setError(message);

    if (!initialPassCompleteRef.current && index < 2) {
      scheduleStep(index + 1);
      return;
    }
    if (index === 2) initialPassCompleteRef.current = true;

    const failedIndex = nextStatuses.findIndex((status) => status !== 'good');
    if (failedIndex >= 0) {
      scheduleStep(failedIndex);
      return;
    }
    calculateFinalAlignment();
  }, [calculateFinalAlignment, updateStatuses, scheduleStep]);

  const finishStepRef = useRef(finishStep);
  finishStepRef.current = finishStep;

  const handlePrimaryAction = useCallback(() => {
    if (isRecordingStep || nextStepTimerRef.current !== null) return;
    if (readyForTreatment) {
      const sample = latestImuSampleRef.current;
      if (!sample || appliedAt === null || sample.timestamp - appliedAt < 500 || Date.now() - sample.timestamp > 1000) {
        setError('Waiting for fresh calibrated motion data before recentering.');
        return;
      }
      calibrateOffset();
      onCompleteRef.current();
      return;
    }
    beginStepRef.current(stepIndex);
  }, [calibrateOffset, isRecordingStep, readyForTreatment, stepIndex, appliedAt]);
  const primaryActionRef = useRef(handlePrimaryAction);
  primaryActionRef.current = handlePrimaryAction;

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => ble.subscribeToButtonMessages((message) => {
    if (message.data.byteLength !== 1 && message.data.byteLength !== 2) return;
    const command = message.data.byteLength === 2 ? message.data.getUint16(0, true) : message.data.getUint8(0);
    if (command === 1) primaryActionRef.current();
    if (command === 2) onBackRef.current();
  }), [ble.subscribeToButtonMessages]);

  useEffect(() => {
    if (!isRecordingStep || stepIndex > 2 || !latestImuSample) return;
    // Ignore handling movement during the silent settling period, including retries.
    if (performance.now() < recordingStartsAtRef.current) return;
    if (lastTimestampRef.current === latestImuSample.timestamp) return;
    lastTimestampRef.current = latestImuSample.timestamp;
    const stepId = steps[stepIndex].id;
    samplesRef.current[stepId].push({
      ax: latestImuSample.ax, ay: latestImuSample.ay, az: latestImuSample.az,
      gx: latestImuSample.gx, gy: latestImuSample.gy, gz: latestImuSample.gz,
    });
    if (stepIndex === 0) return;

    const evaluation = evaluateMovementCycles(
      samplesRef.current[stepId],
      [offsetsRef.current.gx, offsetsRef.current.gy, offsetsRef.current.gz],
      noiseFloorRef.current
    );
    setDetectedCycles(Math.min(3, evaluation.detectedCycles));
    setNeedsThirdCycle(evaluation.needsThirdCycle);
    if (evaluation.error && !completionLockedRef.current) {
      completionLockedRef.current = true;
      samplesRef.current[stepId] = [];
      finishStepRef.current(stepIndex, false, evaluation.error);
    } else if (evaluation.acceptedSamples && !completionLockedRef.current) {
      completionLockedRef.current = true;
      finishStepRef.current(stepIndex, true, null, evaluation.acceptedSamples as CalibrationSample[]);
    }
  }, [isRecordingStep, latestImuSample, stepIndex]);

  useEffect(() => {
    if (!isRecordingStep || stepIndex > 2) return;
    const currentStepIndex = stepIndex;
    const recordingDuration = currentStepIndex === 0 ? STATIC_RECORDING_DURATION_MS : DYNAMIC_RECORDING_DURATION_MS;
    const startedAt = recordingStartsAtRef.current;
    const intervalId = window.setInterval(() => setRemainingMs(
      Math.max(0, Math.min(recordingDuration, recordingDuration - (performance.now() - startedAt)))
    ), 50);
    const timeoutId = window.setTimeout(() => {
      if (completionLockedRef.current) return;
      completionLockedRef.current = true;
      const stepId = steps[currentStepIndex].id;
      const samples = samplesRef.current[stepId];
      if (currentStepIndex === 0) {
        const candidateOffsets = stationaryOffsets(samples);
        const candidateNoise = stationaryGyroscopeNoise(samples, candidateOffsets);
        offsetsRef.current = candidateOffsets;
        noiseFloorRef.current = candidateNoise;
        const validationError = validateStationarySamples(samples, candidateNoise);
        finishStepRef.current(0, validationError === null, validationError);
      } else {
        samplesRef.current[stepId] = [];
        finishStepRef.current(currentStepIndex, false, 'The movement was not completed within 30 seconds.');
      }
    }, Math.max(0, startedAt + recordingDuration - performance.now()));
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [isRecordingStep, stepIndex]);

  const activeStep = stepIndex < 3 ? steps[stepIndex] : null;
  const recordingProgress = isRecordingStep
    ? stepIndex === 0 ? (STATIC_RECORDING_DURATION_MS - remainingMs) / STATIC_RECORDING_DURATION_MS : Math.min(detectedCycles / 2, 0.99)
    : 0;

  return (
    <Card withBorder shadow="sm" radius="md" p="sm" maw={900} w="100%" mx="auto">
      <Stack gap="md">
        <Stack gap={4} ta="center">
          <Title order={3}>Head movement calibration</Title>
          <Text c="dimmed" size="lg">{readyForTreatment ? 'Calibration passed. Return to your neutral position.' : 'Press Start once. The remaining checks will run automatically.'}</Text>
        </Stack>

        {!readyForTreatment ? (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {steps.map((item, index) => {
                const status = statuses[index];
                const background = status === 'good' ? 'green.0' : status === 'bad' ? 'red.0' : status === 'active' ? 'blue.0' : undefined;
                const colour = status === 'good' ? 'green' : status === 'bad' ? 'red' : status === 'active' ? 'blue' : 'gray';
                return (
                  <Card key={item.id} withBorder p="sm" bg={background} style={{ borderColor: `var(--mantine-color-${colour}-6)` }}>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Badge size="lg" color={colour}>{status === 'good' ? 'Good' : status === 'bad' ? 'Repeat' : status === 'active' ? 'Collecting' : `Step ${index + 1}`}</Badge>
                        {status === 'active' && index === 0 && <Text fw={700} size="xl">{Math.max(1, Math.ceil(remainingMs / 1000))}s</Text>}
                      </Group>
                      <Title order={5}>{item.title}</Title>
                      <Image
                        src={`${process.env.PUBLIC_URL}/calibration/${encodeURIComponent(item.image)}`}
                        alt={item.imageAlt}
                        h={120}
                        fit="contain"
                        radius="md"
                      />
                      <Text c="dimmed">{item.instruction}</Text>
                      {stepErrors[index] && status === 'bad' && <Text c="red.8" size="sm">{stepErrors[index]}</Text>}
                    </Stack>
                  </Card>
                );
              })}
            </SimpleGrid>
            <Progress value={((statuses.filter((status) => status === 'good').length + recordingProgress) / 3) * 100} size="xl" radius="xl" animated={isRecordingStep} />
            {activeStep && <Text ta="center" size="xl" fw={700} role="status" aria-live="polite">{activeStep.instruction}</Text>}
            {isRecordingStep && stepIndex > 0 && (
              <Text ta="center" size="lg" fw={600} c={needsThirdCycle ? 'orange.8' : undefined}>
                {needsThirdCycle ? 'The first 2 movements differed — please complete 1 additional movement.' : `${Math.min(detectedCycles, 2)} of 2 complete movements detected`}
              </Text>
            )}
          </>
        ) : (
          <Stack align="center" justify="center" gap="md" py="xl" mih={280} role="status" aria-live="polite">
            <Title order={1} ta="center">Look straight ahead</Title>
            <Text size="xl" ta="center" maw={620}>Return to looking directly forwards and hold your head still. When you are ready, finish calibration to recentre the head and return to research.</Text>
          </Stack>
        )}

        {error && !isRecordingStep && <Alert color="red" title="Calibration status">{error}</Alert>}
        <Group grow>
          <Button variant="default" onClick={onBack}>Cancel</Button>
          <Button color="green" onClick={handlePrimaryAction} disabled={isRecordingStep} loading={isRecordingStep}>
            {readyForTreatment ? 'Finish calibration' : stepIndex === 0 && statuses[0] === 'pending' ? 'Start calibration' : 'Retry calibration'}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
