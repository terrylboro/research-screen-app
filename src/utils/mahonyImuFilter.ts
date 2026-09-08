import {
  calculateGravityInSensorFrame,
  initQuaternionFromGravity,
  orientationNaNGuard,
  quaternionNormalize,
  quaternionToEuler,
} from './orientationMath';

const STANDARD_GRAVITY = 9.81;
const DEFAULT_MIN_ACCEL_G = 0.85;
const DEFAULT_MAX_ACCEL_G = 1.15;

/**
 * Gyroscope-led IMU orientation with slow proportional gravity correction.
 *
 * Gyroscope integration remains immediate. Accelerometer feedback corrects
 * roll/pitch proportionally to the actual gravity-direction error, and is
 * ignored when acceleration magnitude is implausible. With no magnetometer,
 * yaw remains gyro-only.
 */
export class MahonyImuFilter {
  q: number[] = [1, 0, 0, 0];
  initialized = false;

  constructor(
    readonly proportionalGain = 1.5,
    readonly minimumAccelG = DEFAULT_MIN_ACCEL_G,
    readonly maximumAccelG = DEFAULT_MAX_ACCEL_G
  ) {}

  init(accelX: number, accelY: number, accelZ: number) {
    this.q = initQuaternionFromGravity(accelX, accelY, accelZ);
    this.initialized = true;
  }

  update(
    accelX: number,
    accelY: number,
    accelZ: number,
    gyroX: number,
    gyroY: number,
    gyroZ: number,
    dt: number
  ) {
    if (
      !Number.isFinite(accelX) ||
      !Number.isFinite(accelY) ||
      !Number.isFinite(accelZ) ||
      !Number.isFinite(gyroX) ||
      !Number.isFinite(gyroY) ||
      !Number.isFinite(gyroZ) ||
      !Number.isFinite(dt)
    ) {
      return orientationNaNGuard(this.q);
    }

    if (!this.initialized) {
      this.init(accelX, accelY, accelZ);
    }

    if (dt > 0) {
      const accelNorm = Math.sqrt(
        accelX * accelX + accelY * accelY + accelZ * accelZ
      );
      const accelG = accelNorm / STANDARD_GRAVITY;
      let correctedGyroX = gyroX;
      let correctedGyroY = gyroY;
      let correctedGyroZ = gyroZ;

      if (
        accelNorm > 0 &&
        accelG >= this.minimumAccelG &&
        accelG <= this.maximumAccelG
      ) {
        const measuredGravity = [
          accelX / accelNorm,
          accelY / accelNorm,
          accelZ / accelNorm,
        ];
        const predictedGravity = calculateGravityInSensorFrame(this.q, 1);

        // measured × predicted gives the body-frame correction which rotates
        // the estimated gravity direction towards the accelerometer direction.
        const errorX = measuredGravity[1] * predictedGravity[2] -
          measuredGravity[2] * predictedGravity[1];
        const errorY = measuredGravity[2] * predictedGravity[0] -
          measuredGravity[0] * predictedGravity[2];
        const errorZ = measuredGravity[0] * predictedGravity[1] -
          measuredGravity[1] * predictedGravity[0];

        correctedGyroX += this.proportionalGain * errorX;
        correctedGyroY += this.proportionalGain * errorY;
        correctedGyroZ += this.proportionalGain * errorZ;
      }

      const [w, x, y, z] = this.q;
      const halfDt = 0.5 * dt;
      this.q = quaternionNormalize([
        w + (-x * correctedGyroX - y * correctedGyroY - z * correctedGyroZ) * halfDt,
        x + (w * correctedGyroX + y * correctedGyroZ - z * correctedGyroY) * halfDt,
        y + (w * correctedGyroY - x * correctedGyroZ + z * correctedGyroX) * halfDt,
        z + (w * correctedGyroZ + x * correctedGyroY - y * correctedGyroX) * halfDt,
      ]);
    }

    const gravity = calculateGravityInSensorFrame(this.q);
    const euler = quaternionToEuler(this.q);
    return {
      gravityX: gravity[0],
      gravityY: gravity[1],
      gravityZ: gravity[2],
      userAccelX: accelX - gravity[0],
      userAccelY: accelY - gravity[1],
      userAccelZ: accelZ - gravity[2],
      qw: this.q[0],
      qx: this.q[1],
      qy: this.q[2],
      qz: this.q[3],
      roll: euler.roll,
      pitch: euler.pitch,
      yaw: euler.yaw,
    };
  }
}
