import { useEffect, useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';

function formatElapsedTime(elapsedMs: number) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function SimpleTimer() {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setElapsedMs((currentElapsedMs) => currentElapsedMs + 1000);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRunning]);

  return (
    <Stack gap="md" >
      <Text fw={600}>Timer</Text>
      <Text size="3rem" fw={700} lh={1} ta="center">
        {formatElapsedTime(elapsedMs)}
      </Text>

      <Group>
        <Button onClick={() => setIsRunning(true)} disabled={isRunning}>
          Start
        </Button>
        <Button color="red" onClick={() => setIsRunning(false)} disabled={!isRunning}>
          Stop
        </Button>
        <Button
          variant="light"
          onClick={() => {
            setIsRunning(false);
            setElapsedMs(0);
          }}
        >
          Reset
        </Button>
      </Group>
    </Stack>
  );
}
