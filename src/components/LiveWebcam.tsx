import { useEffect, useRef, useState } from "react";
import { Box, Loader, Stack, Text } from "@mantine/core";

type LiveWebcamProps = {
  width?: number | string;
  height?: number | string;
  enabled?: boolean;
};

const LiveWebcam = ({
  width = "100%",
  height = 320,
  enabled = true,
}: LiveWebcamProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const startStream = async () => {
      if (!enabled) {
        stopStream();
        setError(null);
        setIsLoading(false);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not support webcam streaming.");
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        setIsLoading(true);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to access the webcam.";
        setError(message);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    startStream();

    return () => {
      isCancelled = true;
      stopStream();
    };
  }, [enabled]);

  return (
    <Box
      w={width}
      h={height}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        backgroundColor: "#111",
        border: "1px solid rgba(255, 255, 255, 0.12)",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: error || !enabled ? "none" : "block",
        }}
      />

      {(!enabled || isLoading || error) && (
        <Stack
          align="center"
          justify="center"
          gap="xs"
          h="100%"
          px="md"
          style={{ position: "absolute", inset: 0 }}
        >
          {enabled && isLoading && !error && <Loader color="blue" />}
          <Text c="white" ta="center" size="sm">
            {!enabled ? "Camera stream is off" : error ?? "Connecting to webcam..."}
          </Text>
        </Stack>
      )}
    </Box>
  );
};

export default LiveWebcam;
