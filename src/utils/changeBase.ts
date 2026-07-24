import { Matrix4, Vector3, Quaternion } from "three"

export function changeQuaternionBase(rotMat: Matrix4, qB: Quaternion) : void {
    /**
     * Convert rotation matrix reported in IMU frame to a quaternion defined in world frame.
     */

    // Define the basis vectors
    // const xAB = new Vector3(-1, 0, 0);
    // const yAB = new Vector3(0, 0, 1);
    // const zAB = new Vector3(0, 1, 0);
    
    const xAB = new Vector3(1, 0, 0);
    const yAB = new Vector3(0, 1, 0);
    const zAB = new Vector3(0, 0, 1);
    const S = new Matrix4().makeBasis(xAB, yAB, zAB);
    const qBA = new Quaternion().setFromRotationMatrix(S);

    // Apply q_b = q_ba * q_a * inv(q_ba) 
    qB.setFromRotationMatrix(rotMat.clone());  // depends if matrixRef is matrix or quaternion
    qB.premultiply(qBA).multiply(qBA.clone().invert());
}
