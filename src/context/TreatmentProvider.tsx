import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
} from 'react';
// import * as THREE from 'three';
import { Euler, Matrix4, Quaternion } from 'three';
import { useBleDevice } from './BleProvider';
import { decodeIMUPacket, getConsecutiveImuPacketDeltaMs, IMUPacketTiming } from '../utils/imuDecoder';
import type { ReceivedMessage } from '../hooks/useBleDeviceInternal';

import { calculateHeadAngles } from '../utils/headKinematics';
import { samplesToCsv } from '../utils/recordingCsv';
import { MahonyImuFilter } from '../utils/mahonyImuFilter';
import { changeQuaternionBase } from '../utils/changeBase';

import { treatmentReducer, initialState } from './treatmentReducer';
import { TreatmentState, Action, EarSide, CanalType, TreatmentStage } from '../types/treatmentTypes';

// export type EarSide = 'left' | 'right' | null;
// export type CanalType = 'anterior' | 'posterior' | 'lateral' | null;



// export enum TreatmentStage {
//   STAGE_1,
//   STAGE_2,
//   STAGE_3
// }

type TreatmentContextValue = {
  affectedEar: EarSide;
  setAffectedEar: (ear: EarSide) => void;

  affectedCanal: CanalType;
  setAffectedCanal: (canal: CanalType) => void;

  selectedCanals: string[];
  setSelectedCanals: (canals: string[]) => void;

  alignedRef: React.MutableRefObject<boolean>;
  // setAlignedRef: (value: boolean) => void;

  showGuidanceArrows : boolean;
  setShowGuidanceArrows: (value: boolean) => void;

  alignmentRef: React.MutableRefObject<number> | null;

  resetTime: number | null;
  setResetTime: (time: number | null) => void;

  stageProgress: number;
  setStageProgress: (progress: number) => void;

  state: TreatmentState;
  dispatch: React.Dispatch<Action>;

  isTreating: boolean;
  setIsTreating: (value: boolean) => void;

  latestSampleText: string;
  latestImuSample: LatestImuSample | null;
  gyroscopeOffsets: GyroscopeOffsets;
  setGyroscopeOffsets: (offsets: GyroscopeOffsets) => void;
  clearGyroscopeOffsets: () => void;

  orientationRef: React.MutableRefObject<{
    roll: number;
    pitch: number;
    yaw: number;
  }>;

  isRecording: boolean;
  saveAsJson: boolean;
  setSaveAsJson: (enabled: boolean) => void;
  startRecording: () => void;
  stopRecording: () => void;

  matrixRef: React.MutableRefObject<Matrix4>;
  offsetMatrixRef: React.MutableRefObject<Matrix4>;

  calibrateOffset: () => void;
  startTreatment: () => void;
  stopTreatment: () => void;
  resetTreatment: () => void;
};

type RecordedImuSample = {
  receivedAt: string;
  elapsedMs: number;
  packetSequence: number;
  packetFrameIndex: number;
  deviceTimestampMs: number;
  sensorTimelineMs: number;
  frameIntervalMs: number | null;
  timingDiscontinuity: boolean;
  fusionUpdated: boolean;
  currentPosition: string;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  axG: number;
  ayG: number;
  azG: number;
  gxDps: number;
  gyDps: number;
  gzDps: number;
  quaternionW: number;
  quaternionX: number;
  quaternionY: number;
  quaternionZ: number;
  rollDegrees: number;
  pitchDegrees: number;
  yawDegrees: number;
  flexionDegrees: number | null;
  axialRotationDegrees: number | null;
  lateralFlexionDegrees: number | null;
};

export type GyroscopeOffsets = {
  gx: number;
  gy: number;
  gz: number;
};

export type LatestImuSample = {
  timestamp: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
};

const GYROSCOPE_OFFSETS_STORAGE_KEY = 'headspin_ble_gyroscope_offsets_70mdps_v2';

function isGyroscopeOffsets(value: unknown): value is GyroscopeOffsets {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const offsets = value as Partial<GyroscopeOffsets>;
  return (
    typeof offsets.gx === 'number' &&
    typeof offsets.gy === 'number' &&
    typeof offsets.gz === 'number'
  );
}

function readStoredGyroscopeOffsets(): GyroscopeOffsets {
  if (typeof window === 'undefined') {
    return { gx: 0, gy: 0, gz: 0 };
  }

  try {
    const storedOffsets = window.localStorage.getItem(GYROSCOPE_OFFSETS_STORAGE_KEY);
    if (!storedOffsets) {
      return { gx: 0, gy: 0, gz: 0 };
    }

    const parsedOffsets = JSON.parse(storedOffsets);
    return isGyroscopeOffsets(parsedOffsets) ? parsedOffsets : { gx: 0, gy: 0, gz: 0 };
  } catch {
    return { gx: 0, gy: 0, gz: 0 };
  }
}

function writeStoredGyroscopeOffsets(offsets: GyroscopeOffsets) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    GYROSCOPE_OFFSETS_STORAGE_KEY,
    JSON.stringify(offsets)
  );
}

function removeStoredGyroscopeOffsets() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(GYROSCOPE_OFFSETS_STORAGE_KEY);
}

function applyGyroscopeOffsets(
  sample: number[],
  offsets: GyroscopeOffsets
) {
  return [
    sample[0],
    sample[1],
    sample[2],
    sample[3] - offsets.gx,
    sample[4] - offsets.gy,
    sample[5] - offsets.gz,
  ];
}

const TreatmentContext = createContext<TreatmentContextValue | null>(null);

/**
 * Replace this with your real treatment rule.
 * This function takes your distilled orientation/alignment info
 * and maps it to UI-oriented treatment state.
 */


export function TreatmentProvider({children,}: {children: React.ReactNode;}) {

  // Instantiate the reducer to manage the app state
  const [state, dispatch] = useReducer(treatmentReducer, initialState);
  const initialGyroscopeOffsets = useMemo(readStoredGyroscopeOffsets, []);

  // Access BLE data from provider
  const ble = useBleDevice();

  useEffect(() => ble.subscribeToButtonMessages((message) => {
    // Firmware navigation commands: uint8 or little-endian uint16.
    // Ignore empty, malformed and unrelated notifications (e.g. power-down).
    if (message.data.byteLength !== 1 && message.data.byteLength !== 2) return;
    const command = message.data.byteLength === 2
      ? message.data.getUint16(0, true)
      : message.data.getUint8(0);
    if (command === 1) dispatch({ type: 'PROGRESS' });
    if (command === 2) dispatch({ type: 'RETURN_TO_PREVIOUS_STAGE' });
  }), [ble.subscribeToButtonMessages]);


  const [affectedEar, setAffectedEar] = useState<EarSide>(null);
  const [affectedCanal, setAffectedCanal] = useState<CanalType>('posterior');
  const [selectedCanals, setSelectedCanals] = useState<string[]>([]);

  // const [alignment, setAlignment] = useState<AlignmentState>('idle');
  const [resetTime, setResetTime] = useState<number | null>(null);

  const [stageProgress, setStageProgress] = useState(0);
  // const [currentStage, setCurrentStage] = useState<TreatmentStage>(TreatmentStage.STAGE_1);
  const [isTreating, setIsTreating] = useState(false);

  const [latestSampleText, setLatestSampleText] = useState('Waiting for data');
  const [latestImuSample, setLatestImuSample] = useState<LatestImuSample | null>(null);
  const [gyroscopeOffsets, setGyroscopeOffsetsState] = useState<GyroscopeOffsets>(
    initialGyroscopeOffsets
  );

  const [showGuidanceArrows, setShowGuidanceArrows] = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const [saveAsJson, setSaveAsJson] = useState(false);

  const matrixRef = useRef(new Matrix4());
  const offsetMatrixRef = useRef(new Matrix4());
  const recordedSamplesRef = useRef<RecordedImuSample[]>([]);
  const recordingStartTimestampRef = useRef<number | null>(null);
  const gyroscopeOffsetsRef = useRef<GyroscopeOffsets>(initialGyroscopeOffsets);
  const orientationRef = useRef({
    roll: 0,
    pitch: 0,
    yaw: 0,
  });

  const alignmentRef = useRef(0);
  // const [alignedRef, setAlignedRef] = useState(false);
  const alignedRef = useRef<boolean>(false);

  // Track the latest processed BLE messages so we do not reprocess the same one
  const previousPacketRef = useRef<IMUPacketTiming | null>(null);
  const sensorTimelineRef = useRef(0);
  const recordingRef = useRef(false);

  // Track hold timing for progress logic
  const holdStartRef = useRef<number | null>(null);

  const filterRef = useRef(new MahonyImuFilter());

  useEffect(() => {
    if (!ble.connected) {
      previousPacketRef.current = null;
      filterRef.current = new MahonyImuFilter();
      matrixRef.current.identity();
      offsetMatrixRef.current.identity();
      orientationRef.current = { roll: 0, pitch: 0, yaw: 0 };
      setLatestImuSample(null);
    }
  }, [ble.connected]);

  const calibrateOffset = useCallback(() => {
    offsetMatrixRef.current.copy(matrixRef.current).invert();
    // setCurrentStage('calibration');
    // setAlignment('aligned');
    setResetTime(Date.now());
  }, []);

  const startTreatment = useCallback(() => {
    setIsTreating(true);
    // setCurrentStage('alignment');
    setStageProgress(0);
    setResetTime(Date.now());
    holdStartRef.current = null;
  }, []);

  const stopTreatment = useCallback(() => {
    setIsTreating(false);
    holdStartRef.current = null;
  }, []);

  const resetTreatment = useCallback(() => {
    dispatch({ type: 'RESET' });
    setAffectedEar(null);
    setAffectedCanal('posterior');
    setSelectedCanals([]);
    setIsTreating(false);
    recordingRef.current = false;
    setIsRecording(false);
    setShowGuidanceArrows(true);
    setResetTime(null);
    setStageProgress(0);
    setLatestSampleText('Waiting for data');
    setLatestImuSample(null);

    matrixRef.current.identity();
    offsetMatrixRef.current.identity();
    orientationRef.current = { roll: 0, pitch: 0, yaw: 0 };
    alignmentRef.current = 0;
    alignedRef.current = false;

    holdStartRef.current = null;
    recordedSamplesRef.current = [];
    recordingStartTimestampRef.current = null;
    previousPacketRef.current = null;
    sensorTimelineRef.current = 0;
    recordingRef.current = false;
    filterRef.current = new MahonyImuFilter();
  }, []);

  const setGyroscopeOffsets = useCallback((offsets: GyroscopeOffsets) => {
    gyroscopeOffsetsRef.current = offsets;
    setGyroscopeOffsetsState(offsets);
    writeStoredGyroscopeOffsets(offsets);
  }, []);

  const clearGyroscopeOffsets = useCallback(() => {
    const emptyOffsets = { gx: 0, gy: 0, gz: 0 };
    gyroscopeOffsetsRef.current = emptyOffsets;
    setGyroscopeOffsetsState(emptyOffsets);
    removeStoredGyroscopeOffsets();
  }, []);

  const downloadRecording = useCallback((samples: RecordedImuSample[]) => {
    if (samples.length === 0) {
      return;
    }

    const now = new Date();
    const twoDigits = (value: number) => value.toString().padStart(2, '0');
    const formattedTimestamp = [
      twoDigits(now.getMonth() + 1),
      twoDigits(now.getDate()),
      twoDigits(now.getHours()),
      twoDigits(now.getMinutes()),
      twoDigits(now.getSeconds()),
    ];

    const recording = {
      format: 'treatment-imu-log',
      formatVersion: 3,
      processing: { filter: "Mahony", proportionalGain: 1.5, gyroDpsPerCount: 0.07, mount: "central-forehead", elapsedMsClock: "browser-arrival", sensorTimelineClock: "accumulated-valid-device-intervals" },
      imuDeviceName: ble.deviceName,
      startedAt: samples[0].receivedAt,
      stoppedAt: new Date().toISOString(),
      imuSampleCount: samples.length,
      imuSamples: samples,
    };

    const content = saveAsJson ? JSON.stringify(recording, null, 2) : samplesToCsv(samples);
    const blob = new Blob([content], { type: saveAsJson ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `imu-recording-${formattedTimestamp.join('-')}.${saveAsJson ? 'json' : 'csv'}`;
    link.click();

    window.URL.revokeObjectURL(url);
  }, [ble.deviceName, saveAsJson]);

  const startRecording = useCallback(() => {
    recordedSamplesRef.current = [];
    recordingStartTimestampRef.current = null;
    recordingRef.current = true;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    setIsRecording(false);
    downloadRecording(recordedSamplesRef.current);
    recordedSamplesRef.current = [];
    recordingStartTimestampRef.current = null;
  }, [downloadRecording]);

  // Timer checking action for hold-based progression logic
  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: 'TIMER_TICK', now: Date.now() });
    }, 50); // ~20Hz

    return () => clearInterval(id);
  }, []);

  const processImuMessage = useCallback((message: ReceivedMessage) => {
    try {
      const packet = decodeIMUPacket(message.data);
      if (!packet.frames.length) return;
      const packetInterval = getConsecutiveImuPacketDeltaMs(packet, previousPacketRef.current);
      previousPacketRef.current = packet;
      const frameInterval = packetInterval === null ? null : packetInterval / packet.frames.length;
      // Unknown intervals must not integrate gyro across a dropout. Keep every
      // raw frame in the research log, with a zero-duration fusion update.
      for (let index = 0; index < packet.frames.length; index++) {
        const frame = packet.frames[index];
        sensorTimelineRef.current += frameInterval ?? 0;
        const raw = [frame.ax_g, frame.ay_g, frame.az_g, frame.gx_dps, frame.gy_dps, frame.gz_dps];
        const data = applyGyroscopeOffsets(raw, gyroscopeOffsetsRef.current);
        const isNewest = index === packet.frames.length - 1;
        // Nominal central-forehead anatomical basis -> filter [z, -y, x].
        const pose = frameInterval !== null || isNewest
          ? filterRef.current.update(
              data[2] * 9.81, -data[1] * 9.81, data[0] * 9.81,
              data[5] * Math.PI / 180, -data[4] * Math.PI / 180, data[3] * Math.PI / 180,
              (frameInterval ?? 0) / 1000
            )
          : null;
        if (pose) {
          matrixRef.current.makeRotationFromQuaternion(new Quaternion(pose.qx, pose.qy, pose.qz, pose.qw));
        }
        const correctedQuaternion = new Quaternion();
        changeQuaternionBase(offsetMatrixRef.current.clone().multiply(matrixRef.current), correctedQuaternion);
        const euler = new Euler().setFromQuaternion(correctedQuaternion, 'XYZ');
        orientationRef.current = { roll: euler.x, pitch: euler.y, yaw: euler.z };
        if (recordingRef.current) {
          const headAngles = calculateHeadAngles(correctedQuaternion);
          if (recordingStartTimestampRef.current === null) recordingStartTimestampRef.current = message.timestamp;
          recordedSamplesRef.current.push({
            receivedAt: new Date(message.timestamp).toISOString(),
            elapsedMs: message.timestamp - recordingStartTimestampRef.current,
            packetSequence: packet.seq, packetFrameIndex: index, deviceTimestampMs: packet.t0_ms,
            sensorTimelineMs: sensorTimelineRef.current, frameIntervalMs: frameInterval,
            timingDiscontinuity: frameInterval === null, fusionUpdated: pose !== null,
            currentPosition: state.stage === TreatmentStage.COMPLETE ? 'complete' : `position_${state.stage + 1}`,
            ax: frame.ax, ay: frame.ay, az: frame.az, gx: frame.gx, gy: frame.gy, gz: frame.gz,
            axG: data[0], ayG: data[1], azG: data[2], gxDps: data[3], gyDps: data[4], gzDps: data[5],
            quaternionW: correctedQuaternion.w, quaternionX: correctedQuaternion.x,
            quaternionY: correctedQuaternion.y, quaternionZ: correctedQuaternion.z,
            flexionDegrees: headAngles?.flexion ?? null,
            axialRotationDegrees: headAngles?.axialRotation ?? null,
            lateralFlexionDegrees: headAngles?.lateralFlexion ?? null,
            rollDegrees: euler.x * 180 / Math.PI, pitchDegrees: euler.y * 180 / Math.PI, yawDegrees: euler.z * 180 / Math.PI,
          });
        }
        if (isNewest && pose) {
          setLatestImuSample({ timestamp: message.timestamp, ax: raw[0], ay: raw[1], az: raw[2], gx: raw[3], gy: raw[4], gz: raw[5] });
          setLatestSampleText(`Received data: ${data.map((v) => v.toFixed(2)).join(' | ')} | ${pose.roll.toFixed(3)} | ${pose.pitch.toFixed(3)} | ${pose.yaw.toFixed(3)}`);
        }
      }
    } catch (error) {
      console.warn('Unable to process IMU packet:', error);
    }
  }, [state.stage]);

  useEffect(() => ble.subscribeToImuMessages(processImuMessage), [ble.subscribeToImuMessages, processImuMessage]);

  const value = useMemo<TreatmentContextValue>(
    () => ({
      affectedEar,
      setAffectedEar,

      affectedCanal,
      setAffectedCanal,

      selectedCanals,
      setSelectedCanals,

      alignmentRef,

      alignedRef,
      // setAlignedRef,

      showGuidanceArrows,
      setShowGuidanceArrows,

      resetTime,
      setResetTime,

      stageProgress,
      setStageProgress,

      state,
      dispatch,

      isTreating,
      setIsTreating,

      latestSampleText,
      latestImuSample,
      gyroscopeOffsets,
      setGyroscopeOffsets,
      clearGyroscopeOffsets,

      orientationRef,
      isRecording,
      saveAsJson,
      setSaveAsJson,
      startRecording,
      stopRecording,

      matrixRef,
      offsetMatrixRef,

      calibrateOffset,
      startTreatment,
      stopTreatment,
      resetTreatment,
    }),
    [
      affectedEar,
      affectedCanal,
      selectedCanals,
      alignmentRef,
      resetTime,
      stageProgress,
      state,
      dispatch,
      isTreating,
      latestSampleText,
      latestImuSample,
      gyroscopeOffsets,
      setGyroscopeOffsets,
      clearGyroscopeOffsets,
      orientationRef,
      isRecording,
      saveAsJson,
      setSaveAsJson,
      startRecording,
      stopRecording,
      calibrateOffset,
      startTreatment,
      stopTreatment,
      resetTreatment,
    ]
  );

  return (
    <TreatmentContext.Provider value={value}>
      {children}
    </TreatmentContext.Provider>
  );
}

export function useTreatment() {
  const context = useContext(TreatmentContext);
  if (!context) {
    throw new Error('useTreatment must be used within a TreatmentProvider');
  }
  return context;
}
