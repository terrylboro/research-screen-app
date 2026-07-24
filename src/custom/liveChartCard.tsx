import React, { memo, startTransition, useEffect, useRef, useState } from 'react';
import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import { LineChart } from '@mantine/charts';

type ChartSample = {
  sample: string;
  pitch: number;
  roll: number;
  yaw: number;
};

type LiveChartCardProps = {
  title?: string;
  points?: number;
  updateIntervalMs?: number;
  orientationRef: React.MutableRefObject<OrientationSnapshot>;
};

export type OrientationSnapshot = Omit<ChartSample, 'sample'>;

function toDegrees(valueInRadians: number) {
  return Number(((valueInRadians * 180) / Math.PI).toFixed(2));
}

function createChartSample(step: number, orientation: OrientationSnapshot): ChartSample {
  return {
    sample: `${step}`,
    ...orientation,
  };
}

function createInitialData(points: number, orientation: OrientationSnapshot) {
  return Array.from(
    { length: points },
    (_, index) => createChartSample(index + 1, orientation)
  );
}

function LiveChartCard({
  title = 'Live IMU Orientation',
  points = 30,
  updateIntervalMs = 250,
  orientationRef,
}: LiveChartCardProps) {
  const nextStepRef = useRef(1);
  const [data, setData] = useState<ChartSample[]>([]);

  useEffect(() => {
    setData([]);
    nextStepRef.current = 1;
  }, [points]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const orientation = {
        pitch: toDegrees(orientationRef.current.pitch),
        roll: toDegrees(orientationRef.current.roll),
        yaw: toDegrees(orientationRef.current.yaw),
      };

      startTransition(() => {
        setData((currentData) => {
          const nextSample = createChartSample(nextStepRef.current, orientation);
          nextStepRef.current += 1;

          const seededData =
            currentData.length === 0
              ? createInitialData(Math.max(points - 1, 0), orientation)
              : currentData;

          return [...seededData.slice(-(points - 1)), nextSample];
        });
      });
    }, updateIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [orientationRef, points, updateIntervalMs]);

  const latestPoint = data[data.length - 1];

  return (
    <Card withBorder shadow="sm" radius="md" p="xs" style={{ flex: 1, height: '100%' }}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>{title}</Title>
          </div>

          <Badge color="teal" variant="light">
            Live IMU
          </Badge>
        </Group>

        <LineChart
          h={220}
          data={data}
          dataKey="sample"
          withLegend={false}
          withDots={false}
          series={[
            { name: 'pitch', color: 'blue.6' },
            { name: 'roll', color: 'grape.6' },
            { name: 'yaw', color: 'orange.6' },
          ]}
          curveType="natural"
          strokeWidth={3}
          gridAxis="xy"
          xAxisLabel="Sample"
          yAxisLabel="Degrees"
          yAxisProps={{ domain: [-180, 180] }}
          tickLine="none"
        />

        <Group justify="left">
          <Text size="xl" c="orange.6">
            Yaw: {latestPoint?.yaw.toFixed(1) ?? '0.0'} deg
          </Text>
          <Text size="xl" c="blue.6">
            Pitch: {latestPoint?.pitch.toFixed(1) ?? '0.0'} deg
          </Text>
          <Text size="xl" c="grape.6">
            Roll: {latestPoint?.roll.toFixed(1) ?? '0.0'} deg
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}

export default memo(LiveChartCard);
