export type GyroscopeBias = { gx: number; gy: number; gz: number };

export type StationaryImuSample = GyroscopeBias & {
  timestamp: number;
  ax: number;
  ay: number;
  az: number;
};

export type OpportunisticCalibrationEvent = {
  timestamp: number;
  durationMs: number;
  sampleCount: number;
  candidateBias: GyroscopeBias;
  previousBias: GyroscopeBias;
  updatedBias: GyroscopeBias;
  medianCorrectedGyroNormDps: number;
  medianAccelNormG: number;
};

const WINDOW_MS = 750;
const MINIMUM_STATIONARY_MS = 2000;
const COOLDOWN_MS = 5000;
const MAX_SAMPLE_GAP_MS = 250;
const ACCEL_TOLERANCE_G = 0.05;
const ACCEL_STD_THRESHOLD_G = 0.02;
const MIN_GYRO_NORM_THRESHOLD_DPS = 0.5;
const MIN_GYRO_STD_THRESHOLD_DPS = 0.25;
const UPDATE_ALPHA = 0.1;
const MAX_UPDATE_PER_AXIS_DPS = 0.05;

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const centre = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - centre) ** 2, 0) / (values.length - 1));
}

function norm(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export class StationaryGyroscopeCalibrator {
  private window: StationaryImuSample[] = [];
  private stationarySamples: StationaryImuSample[] = [];
  private candidateStartTimestamp: number | null = null;
  private lastSampleTimestamp: number | null = null;
  private cooldownUntil = 0;

  resetCandidate() {
    this.window = [];
    this.stationarySamples = [];
    this.candidateStartTimestamp = null;
    this.lastSampleTimestamp = null;
  }

  addSample(
    sample: StationaryImuSample,
    currentBias: GyroscopeBias,
    stationaryNoiseRmsDps: number
  ): OpportunisticCalibrationEvent | null {
    if (
      this.lastSampleTimestamp !== null &&
      (sample.timestamp <= this.lastSampleTimestamp || sample.timestamp - this.lastSampleTimestamp > MAX_SAMPLE_GAP_MS)
    ) {
      this.resetCandidate();
    }
    this.lastSampleTimestamp = sample.timestamp;

    if (sample.timestamp < this.cooldownUntil) return null;

    this.window.push(sample);
    this.window = this.window.filter((item) => sample.timestamp - item.timestamp <= WINDOW_MS);
    if (this.window.length < 3 || sample.timestamp - this.window[0].timestamp < WINDOW_MS * 0.8) return null;

    const correctedGyroNorms = this.window.map((item) =>
      norm(item.gx - currentBias.gx, item.gy - currentBias.gy, item.gz - currentBias.gz)
    );
    const accelNorms = this.window.map((item) => norm(item.ax, item.ay, item.az));
    const gyroStdNorm = norm(
      standardDeviation(this.window.map((item) => item.gx)),
      standardDeviation(this.window.map((item) => item.gy)),
      standardDeviation(this.window.map((item) => item.gz))
    );
    const accelStdNorm = norm(
      standardDeviation(this.window.map((item) => item.ax)),
      standardDeviation(this.window.map((item) => item.ay)),
      standardDeviation(this.window.map((item) => item.az))
    );
    const gyroNormThreshold = Math.max(MIN_GYRO_NORM_THRESHOLD_DPS, stationaryNoiseRmsDps * 4);
    const gyroStdThreshold = Math.max(MIN_GYRO_STD_THRESHOLD_DPS, stationaryNoiseRmsDps * 3);
    const strictlyStationary =
      Math.max(...correctedGyroNorms) < gyroNormThreshold &&
      Math.abs(median(accelNorms) - 1) < ACCEL_TOLERANCE_G &&
      gyroStdNorm < gyroStdThreshold &&
      accelStdNorm < ACCEL_STD_THRESHOLD_G;
    const remainsStationary =
      Math.max(...correctedGyroNorms) < gyroNormThreshold * 1.5 &&
      Math.abs(median(accelNorms) - 1) < ACCEL_TOLERANCE_G * 1.5 &&
      gyroStdNorm < gyroStdThreshold * 1.5 &&
      accelStdNorm < ACCEL_STD_THRESHOLD_G * 1.5;
    const stationaryForCurrentState = this.candidateStartTimestamp === null
      ? strictlyStationary
      : remainsStationary;

    if (!stationaryForCurrentState) {
      this.stationarySamples = [];
      this.candidateStartTimestamp = null;
      return null;
    }

    if (this.candidateStartTimestamp === null) {
      this.candidateStartTimestamp = this.window[0].timestamp;
      this.stationarySamples = [...this.window];
      return null;
    }

    const newestStoredTimestamp = this.stationarySamples[this.stationarySamples.length - 1]?.timestamp ?? -Infinity;
    this.stationarySamples.push(...this.window.filter((item) => item.timestamp > newestStoredTimestamp));
    const durationMs = sample.timestamp - this.candidateStartTimestamp;
    if (durationMs < MINIMUM_STATIONARY_MS) return null;

    const candidateBias: GyroscopeBias = {
      gx: median(this.stationarySamples.map((item) => item.gx)),
      gy: median(this.stationarySamples.map((item) => item.gy)),
      gz: median(this.stationarySamples.map((item) => item.gz)),
    };
    const updateAxis = (previous: number, candidate: number) =>
      previous + clamp((candidate - previous) * UPDATE_ALPHA, -MAX_UPDATE_PER_AXIS_DPS, MAX_UPDATE_PER_AXIS_DPS);
    const updatedBias: GyroscopeBias = {
      gx: updateAxis(currentBias.gx, candidateBias.gx),
      gy: updateAxis(currentBias.gy, candidateBias.gy),
      gz: updateAxis(currentBias.gz, candidateBias.gz),
    };
    const event: OpportunisticCalibrationEvent = {
      timestamp: sample.timestamp,
      durationMs,
      sampleCount: this.stationarySamples.length,
      candidateBias,
      previousBias: { ...currentBias },
      updatedBias,
      medianCorrectedGyroNormDps: median(correctedGyroNorms),
      medianAccelNormG: median(accelNorms),
    };

    this.cooldownUntil = sample.timestamp + COOLDOWN_MS;
    this.resetCandidate();
    return event;
  }
}
