export type Vector3Tuple = [number, number, number];
export type SensorToAnatomicalMatrix = [
  number, number, number,
  number, number, number,
  number, number, number,
];

type AngularVelocitySample = { gx: number; gy: number; gz: number };

const EPSILON = 1e-10;
const MINIMUM_ANGULAR_SPEED_DPS = 0.5;
const MINIMUM_DOMINANT_VARIANCE = 0.75;
const MINIMUM_AXIS_SEPARATION_DEGREES = 60;
const MAXIMUM_GRAVITY_SHAKE_ANGLE_DEGREES = 30;
const MAXIMUM_CYCLE_AXIS_DIFFERENCE_DEGREES = 15;

function dot(a: Vector3Tuple, b: Vector3Tuple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function scale(vector: Vector3Tuple, factor: number): Vector3Tuple {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(vector: Vector3Tuple): Vector3Tuple {
  const magnitude = Math.sqrt(dot(vector, vector));
  if (magnitude < EPSILON) throw new Error('Calibration movement did not contain a usable rotation axis.');
  return scale(vector, 1 / magnitude);
}

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

type AxisAnalysis = { axis: Vector3Tuple; dominance: number; cycles: number };

/** Dominant axis after excluding stationary and very low-speed samples. */
function analyseRotationAxis(samples: AngularVelocitySample[], bias: Vector3Tuple, noiseFloorDps = 0): AxisAnalysis {
  if (samples.length < 3) throw new Error('Not enough motion samples were collected.');

  const corrected = samples.map((sample) => [
    sample.gx - bias[0], sample.gy - bias[1], sample.gz - bias[2],
  ] as Vector3Tuple);
  const peakSpeed = corrected.reduce((peak, velocity) => Math.max(peak, Math.sqrt(dot(velocity, velocity))), 0);
  const speedThreshold = Math.max(MINIMUM_ANGULAR_SPEED_DPS, noiseFloorDps * 3, peakSpeed * 0.1);
  const moving = corrected.filter((velocity) => Math.sqrt(dot(velocity, velocity)) >= speedThreshold);
  if (moving.length < 10) throw new Error('Too little deliberate movement was recorded. Please move slowly but continuously.');

  const covariance = Array.from({ length: 3 }, () => [0, 0, 0]);
  moving.forEach((velocity) => {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        covariance[row][column] += velocity[row] * velocity[column];
      }
    }
  });

  const seedIndex = covariance[1][1] > covariance[0][0]
    ? (covariance[2][2] > covariance[1][1] ? 2 : 1)
    : (covariance[2][2] > covariance[0][0] ? 2 : 0);
  let axis: Vector3Tuple = seedIndex === 0 ? [1, 0, 0] : seedIndex === 1 ? [0, 1, 0] : [0, 0, 1];
  for (let iteration = 0; iteration < 30; iteration += 1) {
    axis = normalize([
      dot(covariance[0] as Vector3Tuple, axis),
      dot(covariance[1] as Vector3Tuple, axis),
      dot(covariance[2] as Vector3Tuple, axis),
    ]);
  }

  const dominantVariance = dot(axis, [
    dot(covariance[0] as Vector3Tuple, axis),
    dot(covariance[1] as Vector3Tuple, axis),
    dot(covariance[2] as Vector3Tuple, axis),
  ]);
  const totalVariance = covariance[0][0] + covariance[1][1] + covariance[2][2];
  const dominance = dominantVariance / Math.max(totalVariance, EPSILON);

  const projectionThreshold = Math.max(MINIMUM_ANGULAR_SPEED_DPS, peakSpeed * 0.2);
  let lastSign = 0;
  let lobes = 0;
  corrected.forEach((velocity) => {
    const projection = dot(velocity, axis);
    const sign = projection >= projectionThreshold ? 1 : projection <= -projectionThreshold ? -1 : 0;
    if (sign !== 0 && sign !== lastSign) {
      lobes += 1;
      lastSign = sign;
    }
  });

  return { axis, dominance, cycles: Math.floor(lobes / 2) };
}

export type MovementCycleEvaluation = {
  detectedCycles: number;
  needsThirdCycle: boolean;
  acceptedSamples: AngularVelocitySample[] | null;
  error: string | null;
};

/** Splits bidirectional motion into cycles and checks cycle-axis repeatability. */
export function evaluateMovementCycles(
  samples: AngularVelocitySample[],
  gyroscopeBias: Vector3Tuple,
  noiseFloorDps: number
): MovementCycleEvaluation {
  if (samples.length < 10) return { detectedCycles: 0, needsThirdCycle: false, acceptedSamples: null, error: null };

  let overall: AxisAnalysis;
  try {
    overall = analyseRotationAxis(samples, gyroscopeBias, noiseFloorDps);
  } catch {
    return { detectedCycles: 0, needsThirdCycle: false, acceptedSamples: null, error: null };
  }

  const corrected = samples.map((sample) => [
    sample.gx - gyroscopeBias[0], sample.gy - gyroscopeBias[1], sample.gz - gyroscopeBias[2],
  ] as Vector3Tuple);
  const projections = corrected.map((velocity) => dot(velocity, overall.axis));
  const peakProjection = projections.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  const threshold = Math.max(MINIMUM_ANGULAR_SPEED_DPS, noiseFloorDps * 3, peakProjection * 0.15);

  const lobes: Array<{ start: number; end: number; sign: number }> = [];
  let activeLobe: { start: number; end: number; sign: number } | null = null;
  projections.forEach((projection, index) => {
    const sign = projection >= threshold ? 1 : projection <= -threshold ? -1 : 0;
    if (sign === 0) return;
    if (!activeLobe || activeLobe.sign !== sign) {
      if (activeLobe) lobes.push(activeLobe);
      activeLobe = { start: index, end: index, sign };
    } else {
      activeLobe.end = index;
    }
  });
  if (activeLobe) lobes.push(activeLobe);

  const cycles: AngularVelocitySample[][] = [];
  for (let index = 0; index + 1 < lobes.length; index += 2) {
    if (lobes[index].sign === lobes[index + 1].sign) continue;
    cycles.push(samples.slice(lobes[index].start, lobes[index + 1].end + 1));
  }

  const validCycles = cycles.slice(0, 3).flatMap((cycleSamples) => {
    try {
      const analysis = analyseRotationAxis(cycleSamples, gyroscopeBias, noiseFloorDps);
      return analysis.dominance >= MINIMUM_DOMINANT_VARIANCE
        ? [{ samples: cycleSamples, axis: analysis.axis }]
        : [];
    } catch {
      return [];
    }
  });

  if (validCycles.length < 2) {
    if (cycles.length < 2) {
      return { detectedCycles: cycles.length, needsThirdCycle: false, acceptedSamples: null, error: null };
    }
    if (cycles.length < 3) {
      return { detectedCycles: cycles.length, needsThirdCycle: true, acceptedSamples: null, error: null };
    }
    return {
      detectedCycles: cycles.length,
      needsThirdCycle: false,
      acceptedSamples: null,
      error: 'Fewer than two movements were sufficiently single-plane. Please repeat this calibration movement.',
    };
  }

  const axisDifference = (first: Vector3Tuple, second: Vector3Tuple) =>
    Math.acos(Math.min(1, Math.abs(dot(first, second)))) * 180 / Math.PI;
  const firstDifference = axisDifference(validCycles[0].axis, validCycles[1].axis);
  if (firstDifference <= MAXIMUM_CYCLE_AXIS_DIFFERENCE_DEGREES) {
    return {
      detectedCycles: cycles.length,
      needsThirdCycle: false,
      acceptedSamples: [...validCycles[0].samples, ...validCycles[1].samples],
      error: null,
    };
  }

  if (cycles.length < 3) {
    return { detectedCycles: cycles.length, needsThirdCycle: true, acceptedSamples: null, error: null };
  }

  const pairs: Array<[number, number, number]> = [];
  for (let first = 0; first < validCycles.length; first += 1) {
    for (let second = first + 1; second < validCycles.length; second += 1) {
      pairs.push([first, second, axisDifference(validCycles[first].axis, validCycles[second].axis)]);
    }
  }
  pairs.sort((a, b) => a[2] - b[2]);
  const bestPair = pairs[0];
  if (bestPair && bestPair[2] <= MAXIMUM_CYCLE_AXIS_DIFFERENCE_DEGREES) {
    return {
      detectedCycles: cycles.length,
      needsThirdCycle: false,
      acceptedSamples: [...validCycles[bestPair[0]].samples, ...validCycles[bestPair[1]].samples],
      error: null,
    };
  }

  return {
    detectedCycles: cycles.length,
    needsThirdCycle: false,
    acceptedSamples: null,
    error: 'The movement axes were not consistent. Please repeat this calibration movement.',
  };
}

function orientLike(axis: Vector3Tuple, reference: Vector3Tuple): Vector3Tuple {
  return dot(axis, reference) < 0 ? scale(axis, -1) : axis;
}

/**
 * Estimates the rigid sensor-to-app-anatomical rotation while preserving the
 * coordinate order expected by TreatmentProvider's established orientation-
 * filter input mapping. In that basis, output X is the head-shake (vertical/yaw) axis,
 * output Y is the nod (mediolateral/pitch) axis, and output Z is the derived
 * orthogonal axis.
 */
export function calculateSensorToAnatomicalMatrix(
  nodSamples: AngularVelocitySample[],
  shakeSamples: AngularVelocitySample[],
  gyroscopeBias: Vector3Tuple,
  stationaryGravity: Vector3Tuple,
  noiseFloorDps = 0,
  referenceMatrix: SensorToAnatomicalMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1]
): SensorToAnatomicalMatrix {
  let nod = analyseRotationAxis(nodSamples, gyroscopeBias, noiseFloorDps);
  let shake = analyseRotationAxis(shakeSamples, gyroscopeBias, noiseFloorDps);
  if (nod.dominance < MINIMUM_DOMINANT_VARIANCE) throw new Error('Please repeat head nods with less sideways movement.');
  if (shake.dominance < MINIMUM_DOMINANT_VARIANCE) throw new Error('Please repeat head shakes with less nodding movement.');

  const rawAxisSeparation = Math.acos(Math.min(1, Math.abs(dot(nod.axis, shake.axis)))) * 180 / Math.PI;
  if (rawAxisSeparation < MINIMUM_AXIS_SEPARATION_DEGREES) {
    throw new Error(`The nod and shake movements are too similar. Please repeat and ensure they go in distinct directions.`);
  }

  const gravityDirection = normalize(stationaryGravity);
  const angleFromGravity = (axis: Vector3Tuple) =>
    Math.acos(Math.min(1, Math.abs(dot(gravityDirection, axis)))) * 180 / Math.PI;
  const recordedShakeGravityAngle = angleFromGravity(shake.axis);
  const recordedNodGravityAngle = angleFromGravity(nod.axis);

  // If the nominal nod recording matches the upright shake axis while the
  // nominal shake does not, both valid movements were performed in reverse.
  if (
    recordedShakeGravityAngle > MAXIMUM_GRAVITY_SHAKE_ANGLE_DEGREES &&
    recordedNodGravityAngle <= MAXIMUM_GRAVITY_SHAKE_ANGLE_DEGREES
  ) {
    [nod, shake] = [shake, nod];
  } else if (recordedShakeGravityAngle > MAXIMUM_GRAVITY_SHAKE_ANGLE_DEGREES) {
    throw new Error(
      'The Step 3 movement looked like another nod rather than a side-to-side head shake. Please repeat the head-shake movement.'
    );
  }

  let shakeAxis = orientLike(
    shake.axis,
    referenceMatrix.slice(0, 3) as Vector3Tuple
  );
  let nodAxis = orientLike(
    nod.axis,
    referenceMatrix.slice(3, 6) as Vector3Tuple
  );
  let gravityAxis = orientLike(gravityDirection, referenceMatrix.slice(0, 3) as Vector3Tuple);
  gravityAxis = orientLike(gravityAxis, shakeAxis);
  const gravityShakeAngle = Math.acos(Math.min(1, dot(gravityAxis, shakeAxis))) * 180 / Math.PI;
  if (gravityShakeAngle > MAXIMUM_GRAVITY_SHAKE_ANGLE_DEGREES) {
    throw new Error(`The shake axis was ${gravityShakeAngle.toFixed(0)}° from upright. Check sensor placement and repeat calibration.`);
  }
  shakeAxis = normalize(add(shakeAxis, gravityAxis));

  // Symmetric orthogonalisation distributes cross-axis error between both
  // measured axes rather than treating either movement as perfectly executed.
  const sumDirection = normalize(add(shakeAxis, nodAxis));
  const differenceDirection = normalize(subtract(shakeAxis, nodAxis));
  shakeAxis = normalize(add(sumDirection, differenceDirection));
  nodAxis = normalize(subtract(sumDirection, differenceDirection));
  const derivedAxis = normalize(cross(shakeAxis, nodAxis));
  nodAxis = normalize(cross(derivedAxis, shakeAxis));

  return [...shakeAxis, ...nodAxis, ...derivedAxis] as SensorToAnatomicalMatrix;
}

export function applySensorToAnatomicalMatrix(
  matrix: SensorToAnatomicalMatrix,
  x: number,
  y: number,
  z: number
): Vector3Tuple {
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z,
    matrix[3] * x + matrix[4] * y + matrix[5] * z,
    matrix[6] * x + matrix[7] * y + matrix[8] * z,
  ];
}
