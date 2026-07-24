import { Progress, Text, Stack, Box } from '@mantine/core';

function getThresholdSections(progressPercent: number, greenThreshold: number) {
  const p = Math.max(0, Math.min(progressPercent, 100));
  const greenStart = Math.max(50, Math.min(greenThreshold, 100));

  const red = Math.min(p, 50);
  const orange = Math.max(0, Math.min(p - 50, greenStart - 50));
  const green = Math.max(0, Math.min(p - greenStart, 100 - greenStart));

  return { red, orange, green };
}

type AlignmentProgressProps = {
  score: number; // 0..1
  greenThreshold?: number; // percentage at which orange changes to green
};

export default function AlignmentProgress({
  score,
  greenThreshold = 85,
}: AlignmentProgressProps) {
  const percent = score * 100;
  const { red, orange, green } = getThresholdSections(percent, greenThreshold);

  return (
    <Stack gap="xs">
      <Progress.Root size="xl" radius="xl">
        {red > 0 && <Progress.Section value={red} color="red" />}
        {orange > 0 && <Progress.Section value={orange} color="orange" />}
        {green > 0 && <Progress.Section value={green} color="green" />}
      </Progress.Root>

      {/* <Box
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '85%',
            width: '15%',
            background: 'rgba(0, 255, 0, 0.05)',
            // opacity: 0.5,
            // transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        /> */}

      {/* <Text size="sm">{percent.toFixed(0)}%</Text> */}
    </Stack>
  );
}
