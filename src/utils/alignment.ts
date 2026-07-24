import { Mesh, Vector3, Object3D, MathUtils, Quaternion } from "three"

export const meshPartsLength: {[key: string]: number} = {posterior: 5, anterior: 5, lateral: 3, all: 5}

const meshPartsEnds: {[key: string]: number[]} = {
    posterior: [2, 420, 128, 356, 531, 49],
    anterior: [306, 372, 492, 128, 167, 229],
    lateral: [289, 510, 322, 330, 410, 74]
}

export const getAlignment = (canal: string, stage: number, mesh: Mesh) => {

    const top = new Vector3()
    top.set(
        mesh.geometry.attributes.position.array[3 * meshPartsEnds[canal][2*(stage-1)]],
        mesh.geometry.attributes.position.array[3 * meshPartsEnds[canal][2*(stage-1)] + 1],
        mesh.geometry.attributes.position.array[3 * meshPartsEnds[canal][2*(stage-1)] + 2]
    )   
    const bottom = new Vector3()
    bottom.set(
        mesh.geometry.attributes.position.array[3 * meshPartsEnds[canal][2*(stage-1)+1]],
        mesh.geometry.attributes.position.array[3 * meshPartsEnds[canal][2*(stage-1)+1] + 1],
        mesh.geometry.attributes.position.array[3 * meshPartsEnds[canal][2*(stage-1)+1] + 2]
    )
    mesh.localToWorld(top)
    mesh.localToWorld(bottom)

    // This whole function picks a point at the top of the canal segment, one at the bottom,
    // and calculates how vertical is the line connecting them

    return (top.y - bottom.y)/top.distanceTo(bottom)
}

export function getCanalAlignment(
    localDir: Vector3,
    object: Object3D,
    targetWorld = new Vector3(0, 0, 1),
    thresholdDeg = 10
) {
    const worldDir = localDir.clone().normalize();

  // rotate local direction into world space using object world rotation
  worldDir.applyQuaternion(object.getWorldQuaternion(new Quaternion()));

  const targetDir = targetWorld.clone().normalize();

  const dot = MathUtils.clamp(worldDir.dot(targetDir), -1, 1);
  const angleRad = Math.acos(dot);
  const angleDeg = MathUtils.radToDeg(angleRad);

  return {
    isAligned: Math.max(0, dot) >= (1 - thresholdDeg/100), //angleDeg <= thresholdDeg,
    score: Math.max(0, dot),
    angleDeg,
    worldDir,
    targetDir,
  };
}