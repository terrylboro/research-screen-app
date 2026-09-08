// src/imuDecoder.ts

// Firmware sensitivities, matching the NHS-style acquisition pipeline.
const ACCEL_MG_PER_LSB = 0.061;   // mg/LSB for ±2g
const GYRO_MDPS_PER_LSB = 4.375 * 16;  // mdps/LSB for ±245 dps

const MG_TO_G = (16 >> 1) / 1000.0;
const MDPS_TO_DPS = 1.0 / 1000.0;

export const SOF_IMU = 0x5a;

export type IMUFrame = {
  // raw
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;

  // converted
  ax_g: number; ay_g: number; az_g: number;
  gx_dps: number; gy_dps: number; gz_dps: number;
};

export type IMUPacket = {
  sof: number;
  seq: number;
  n: number;
  t0_ms: number;
  frames: IMUFrame[];
};


export type IMUPacketTiming = Pick<IMUPacket, 'seq' | 'n' | 't0_ms'>;

const MAX_IMU_PACKET_INTERVAL_MS = 250;
const UINT32_RANGE = 0x1_0000_0000;

/**
 * Return the device-clock time between consecutive packet transmissions.
 * Divide by the frame count for chronological per-frame integration.
 * No browser-arrival timing is involved.
 */
export function getConsecutiveImuPacketDeltaMs(
  current: IMUPacketTiming,
  previous: IMUPacketTiming | null
): number | null {
  if (!previous || current.seq !== ((previous.seq + 1) & 0xff)) {
    return null;
  }

  const packetDeltaMs = (current.t0_ms - previous.t0_ms + UINT32_RANGE) % UINT32_RANGE;
  return packetDeltaMs > 0 && packetDeltaMs <= MAX_IMU_PACKET_INTERVAL_MS
    ? packetDeltaMs
    : null;
}

export class IMUDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IMUDecodeError";
  }
}

function requireBytes(view: DataView, needed: number) {
  if (view.byteLength < needed) {
    throw new IMUDecodeError(`Packet too short: got ${view.byteLength}, need >= ${needed}`);
  }
}

export function decodeIMUPacket(input: DataView | ArrayBuffer): IMUPacket {
  const view = input instanceof DataView ? input : new DataView(input);

  // Header: sof(1) + seq(1) + n(2) + t0_ms(4) = 8 bytes
  requireBytes(view, 8);

  const sof = view.getUint8(0);
  if (sof !== SOF_IMU) {
    throw new IMUDecodeError(`Bad SOF: expected 0x${SOF_IMU.toString(16)}, got 0x${sof.toString(16)}`);
  }

  const seq = view.getUint8(1);
  const n = view.getUint16(2, true);
  const t0_ms = view.getUint32(4, true);

  const frameSize = 12; // 6 * int16
  const expectedLen = 8 + n * frameSize;
  requireBytes(view, expectedLen);

  const frames: IMUFrame[] = [];
  let off = 8;

  for (let i = 0; i < n; i++) {
    const ax = view.getInt16(off + 0, true);
    const ay = view.getInt16(off + 2, true);
    const az = view.getInt16(off + 4, true);
    const gx = view.getInt16(off + 6, true);
    const gy = view.getInt16(off + 8, true);
    const gz = view.getInt16(off + 10, true);

    frames.push({
        // raw
        ax, ay, az,
        gx, gy, gz,

        // converted
        ax_g: ax * ACCEL_MG_PER_LSB * MG_TO_G,
        ay_g: ay * ACCEL_MG_PER_LSB * MG_TO_G,
        az_g: az * ACCEL_MG_PER_LSB * MG_TO_G,

        gx_dps: gx * GYRO_MDPS_PER_LSB * MDPS_TO_DPS,
        gy_dps: gy * GYRO_MDPS_PER_LSB * MDPS_TO_DPS,
        gz_dps: gz * GYRO_MDPS_PER_LSB * MDPS_TO_DPS,
    });

    off += frameSize;
  }
  return { sof, seq, n, t0_ms, frames };
}

export function newestImuFrame(packet: IMUPacket): IMUFrame | null {
  return packet.frames[packet.frames.length - 1] ?? null;
}
