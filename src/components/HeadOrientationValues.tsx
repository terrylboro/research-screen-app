import { useEffect, useState } from 'react';
import { Box, Card, Group, Stack, Text } from '@mantine/core';
import { Quaternion } from 'three';
import { useTreatment } from '../context/TreatmentProvider';
import { calculateHeadAngles } from '../utils/headKinematics';

export default function HeadOrientationValues() {
  const { matrixRef, offsetMatrixRef, latestImuSample } = useTreatment();
  const [angles, setAngles] = useState<ReturnType<typeof calculateHeadAngles>>(null);
  useEffect(() => {
    const update = () => setAngles(calculateHeadAngles(new Quaternion().setFromRotationMatrix(
      offsetMatrixRef.current.clone().multiply(matrixRef.current)
    )));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [matrixRef, offsetMatrixRef]);
  const values = [
    ['Flexion', angles?.flexion],
    ['Axial rotation', angles?.axialRotation],
    ['Lateral flexion', angles?.lateralFlexion],
  ] as const;
  return (
    <Card withBorder shadow="sm" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Head Orientation (Degrees)</Text>
        </Group>
        <Box className="research-angle-values">
          {values.map(([label, value]) => (
            <Box key={label}>
              <Text size="sm" c="dimmed">{label}</Text>
              <Text size="xl" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {latestImuSample && value !== undefined ? `${(Math.abs(value) < 0.05 ? 0 : value).toFixed(1)}` : ''}
              </Text>
            </Box>
          ))}
        </Box>
        {!latestImuSample && <Text size="xs" c="dimmed">Waiting for IMU data</Text>}
        {latestImuSample && !angles && <Text size="xs" c="dimmed">Angles undefined at this orientation</Text>}
      </Stack>
    </Card>
  );
}
