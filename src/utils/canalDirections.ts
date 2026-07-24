import * as THREE from 'three';

export const canalDirections = {
        "posterior": {
            "directions": [
                new THREE.Vector3(1, -1, -0.2).normalize(), // stage 1 direction
                new THREE.Vector3(0.6, 0, -2).normalize(), // stage 2 direction
                // new THREE.Vector3(0.7, -1, 0.2).normalize() // stage 3 direction
                new THREE.Vector3(-0.7, +1, -0.2).normalize(), // stage 3 direction
                new THREE.Vector3(-0.9, 0.15, 1).normalize() // stage 4 direction
            ],
            "origins": [
                new THREE.Vector3(-1.3, 2, -2.3), // stage 1 origin
                new THREE.Vector3(-2.6, 2.0, 3), // stage 2 origin
                // new THREE.Vector3(-2.3, 2.2, 2.5) // stage 3 origin (reverse)
                // new THREE.Vector3(0, -1, 3) // stage 3 origin
                new THREE.Vector3(1.9, -4, 3.5), // stage 3 origin
                new THREE.Vector3(3, -2.4, 0.2) // stage 4 origin
            ],  
        },
        "anterior": {
            // TODO: update with actual directions and origins
            "directions": [
                new THREE.Vector3(0, 0, -1).normalize(), // stage 1 direction
            ],
            "origins": [
                new THREE.Vector3(-1.6, 2.2, 3), // stage 1 origin
            ]
        },
        "lateral": {
            // TODO: update with actual directions and origins
            "directions": [
                new THREE.Vector3(0, 0, -1).normalize(), // stage 1 direction
            ],
            "origins": [
                new THREE.Vector3(-1.6, 2.2, 3), // stage 1 origin
            ]
        },
    }