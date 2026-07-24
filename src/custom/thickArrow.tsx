import {Vector3, Group, CylinderGeometry, MeshStandardMaterial, Mesh, ConeGeometry, Quaternion} from "three"

import { TreatmentProvider } from "../context/TreatmentProvider";

export function createThickArrow(
  dir: Vector3,
  origin: Vector3,
  length: number,
  color: number,
  alignment: number = 0,
) {
    const group = new Group();

    // Shaft (cylinder)
    const shaftLength = length * 0.8;
    const shaftRadius = 0.15; //+ 0.5 * alignment;

    const shaftGeometry = new CylinderGeometry(
        shaftRadius,
        shaftRadius,
        shaftLength,
        16
    );

    const material = new MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 1 });

    const shaft = new Mesh(shaftGeometry, material);

    // Move so base starts at origin
    shaft.position.y = shaftLength / 2;

    group.add(shaft);

    // Arrow head (cone)
    const headLength = length * 0.2;
    const headRadius = 0.5;

    const headGeometry = new ConeGeometry(headRadius, headLength, 16);
    const head = new Mesh(headGeometry, material);

    //   head.position.y = shaftLength + headLength / 2;
    head.position.y = -(headLength) / 2;
    head.rotation.x = -Math.PI;

    group.add(head);

    // Align to direction
    group.position.copy(origin);

    const quaternion = new Quaternion();
    quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0), // default up
        dir.clone().normalize()
    );

    group.applyQuaternion(quaternion);

    return group;
}