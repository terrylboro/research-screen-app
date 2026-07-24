import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, NumberFormatter, Stack, Text } from '@mantine/core';
import { GyroscopeOffsets, useTreatment } from '../context/TreatmentProvider';

const CALIBRATION_DURATION_MS = 3000;

type GyroscopeSample = Pick<GyroscopeOffsets, 'gx' | 'gy' | 'gz'>;

type GyroscopeCalibrationProps = {
  onComplete: () => void;
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function calculateOffsets(samples: GyroscopeSample[]): GyroscopeOffsets {
  return {
    gx: median(samples.map((sample) => sample.gx)),
    gy: median(samples.map((sample) => sample.gy)),
    gz: median(samples.map((sample) => sample.gz)),
  };
}

export default function GyroscopeCalibration({
  onComplete,
}: GyroscopeCalibrationProps) {
  const { latestImuSample, gyroscopeOffsets, setGyroscopeOffsets } = useTreatment();
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [lastResult, setLastResult] = useState<GyroscopeOffsets | null>(null);
  const samplesRef = useRef<GyroscopeSample[]>([]);
  const lastTimestampRef = useRef<number | null>(null);

  const finishCalibration = useCallback(() => {
    setIsCalibrating(false);

    if (samplesRef.current.length === 0) {
      return;
    }

    const offsets = calculateOffsets(samplesRef.current);
    setGyroscopeOffsets(offsets);
    setLastResult(offsets);
  }, [setGyroscopeOffsets]);

  const startCalibration = () => {
    samplesRef.current = [];
    lastTimestampRef.current = null;
    setLastResult(null);
    setIsCalibrating(true);
  };

  useEffect(() => {
    if (!isCalibrating || !latestImuSample) {
      return;
    }

    if (lastTimestampRef.current === latestImuSample.timestamp) {
      return;
    }

    lastTimestampRef.current = latestImuSample.timestamp;
    samplesRef.current.push({
      gx: latestImuSample.gx,
      gy: latestImuSample.gy,
      gz: latestImuSample.gz,
    });
  }, [isCalibrating, latestImuSample]);

  useEffect(() => {
    if (!isCalibrating) {
      return;
    }

    const timeout = window.setTimeout(finishCalibration, CALIBRATION_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [finishCalibration, isCalibrating]);

  const displayedOffsets = lastResult ?? gyroscopeOffsets;

  return (
    <Stack gap="md">
      <Text>
        Place the device on a flat, stable surface and leave it completely still
        during calibration.
      </Text>

      <Alert color={lastResult ? 'green' : 'blue'} title={lastResult ? 'Calibration complete' : 'Current offsets'}>
        <Group gap="lg">
          {(['gx', 'gy', 'gz'] as const).map((axis) => (
            <Text key={axis} size="sm">
              {axis.toUpperCase()}:{' '}
              <NumberFormatter value={displayedOffsets[axis]} decimalScale={5} />
            </Text>
          ))}
        </Group>
      </Alert>

      <Button onClick={startCalibration} loading={isCalibrating}>
        {lastResult ? 'Recalibrate' : 'Calibrate for 3 seconds'}
      </Button>

      <Button color="green" onClick={onComplete} disabled={isCalibrating || !lastResult}>
        Done
      </Button>
    </Stack>
  );
}
