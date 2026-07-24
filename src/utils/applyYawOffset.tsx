import { Matrix4, Vector3, Quaternion, Euler } from "three"

export function applyYawOffset(rotMat: Matrix4, qB: Quaternion) : void {
    /**
     * Apply yaw rotational offset according to matrix value saved during user button press.
     */

    // Define the offset
    const euler = new Euler().setFromRotationMatrix(rotMat.clone());
    const zOffMat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -euler.z);

    // Apply q_b = q_ba * q_a * inv(q_ba) 
    qB.multiply(zOffMat);
}
