import { useEffect, useRef } from "react"
import * as THREE from "three";
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { BLUE_COLOUR, ORANGE_COLOUR, BROWN_COLOUR, BACKGR_COLOUR, RED_COLOUR, BACKGR_COLOUR_CSS} from "../utils/config";

import { changeQuaternionBase } from "../utils/changeBase";
import {applyYawOffset} from "../utils/applyYawOffset"
import { useTreatment } from "../context/TreatmentProvider";
import { Text } from "@mantine/core";

// interface Props {
//     ear: "left" | "right" | "unselected"
//     matrixRef: React.MutableRefObject<THREE.Matrix4>
//     offsetMatrixRef: React.MutableRefObject<THREE.Matrix4> 
// }
type HeadRenderingProps = {
    calibrateMode: boolean
}

const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 1000;

function applyFixedCameraPose(camera: THREE.PerspectiveCamera, position: THREE.Vector3, rotation: THREE.Euler) {
    camera.position.copy(position);
    camera.rotation.copy(rotation);
    camera.near = CAMERA_NEAR;
    camera.far = CAMERA_FAR;
    camera.updateProjectionMatrix();
}

// const HeadRendering = ({ear, matrixRef, offsetMatrixRef}: Props) => {
const HeadRendering = ({calibrateMode} : HeadRenderingProps) => {

    const { matrixRef, offsetMatrixRef, state } = useTreatment();
    const selectedEarText = state.affectedEar
        ? `${state.affectedEar[0].toUpperCase()}${state.affectedEar.slice(1)} ear selected`
        : 'No ear selected';

    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const scene = useRef<THREE.Scene>()
    const renderer = useRef<THREE.WebGLRenderer>()
    const meshParts = useRef<THREE.Mesh[]>([])
    const headGroup = useRef(new THREE.Group());

    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {

        // Renderer initialisation
        canvasRef.current = document.getElementById("headCanvas") as HTMLCanvasElement;
        const container = document.getElementById("headCanvasContainer") as HTMLDivElement;

        renderer.current = new THREE.WebGLRenderer({canvas: canvasRef.current, antialias: true})
        // const size = document.documentElement.clientWidth * 0.207
		// renderer.current.setSize(size, size)
        renderer.current.setSize(container.clientWidth, container.clientHeight, false)

        // Scene initialisation
        scene.current = new THREE.Scene()
        scene.current.background = new THREE.Color(BACKGR_COLOUR)

        // Camera initialisation
        const camera = new THREE.PerspectiveCamera(12, 1)
        cameraRef.current = camera
        // If we are performing the manoeuvre, we want to see the back of head
        const CAMERA_POSITION = calibrateMode ? new THREE.Vector3(100, 0, 0) : new THREE.Vector3(-100, 0, 0) ;
        const CAMERA_ROTATION = calibrateMode ? new THREE.Euler(Math.PI / 2, Math.PI / 2, 0, 'XYZ') : new THREE.Euler(Math.PI / 2, -Math.PI / 2, 0, 'XYZ');
        applyFixedCameraPose(camera, CAMERA_POSITION, CAMERA_ROTATION);


        // Add lights
        const background = new THREE.AmbientLight(0xffffff, 0.1)
        scene.current.add(background)

        const pointLight2 = new THREE.PointLight(0xffffff, 2000)
        pointLight2.castShadow = true
        pointLight2.position.set(17, 20, 0)
        scene.current.add(pointLight2)

        const pointLight3 = new THREE.PointLight(0xffffff, 2000)
        pointLight3.castShadow = true
        pointLight3.position.set(-17, 20, 0)
        scene.current.add(pointLight3)

        // Add the head group to allow ear rotation to be offset
        scene.current.add(headGroup.current);


        // Load Ear Mesh
        const loader = new PLYLoader()
        let earMeshPath;
        earMeshPath = (state.affectedEar !== "right") ? (process.env.PUBLIC_URL + "/rh_meshes/capsule_3x.ply") : (process.env.PUBLIC_URL + "/new_right_meshes/capsule.ply");
        loader.load(earMeshPath, (geometry) => {

            const material = new THREE.MeshStandardMaterial({color: BLUE_COLOUR, flatShading: true})
            const loadedMesh = new THREE.Mesh(geometry.center(), material)

            loadedMesh.position.set(0, state.affectedEar === "left" ? 3.5 : -3.5, 0)
            headGroup.current!.add(loadedMesh);
        })

        // Load head mesh
        loader.load(process.env.PUBLIC_URL + "/rh_meshes/head.ply", (geometry) => {

            const material = new THREE.MeshPhongMaterial({color: 0x555555, flatShading: true, transparent: true, opacity: 0.5})
            const loadedMesh = new THREE.Mesh(geometry.center(), material)

            // scene.current!.add(loadedMesh)
            meshParts.current.push(loadedMesh)
            headGroup.current.add(loadedMesh)
        })



        let loop: number = requestAnimationFrame(animate)

        function animate() {
            const qB = new THREE.Quaternion();
            const corrected = offsetMatrixRef.current.clone().multiply(matrixRef.current);
            changeQuaternionBase(corrected, qB);
            // Applying offset
            // applyYawOffset(offsetMatrixRef.current.clone(), qB)
            headGroup.current.setRotationFromQuaternion(qB);
            renderer.current!.render(scene.current!, cameraRef.current!)
            // }
            loop = requestAnimationFrame(animate)
        }

        return () => {
            cancelAnimationFrame(loop)
            scene.current!.clear() 
            meshParts.current = [] // flush any previous loadings
        }
    }, [state.affectedEar, matrixRef, offsetMatrixRef])


    return (
    <div id="headCanvasContainer" style={{ height: "100%", aspectRatio: "1 / 1", alignItems: "center", backgroundColor: "#000000", position: "relative"}}>
        {calibrateMode && (
            <Text
                size="sm"
                c="white"
                fw={600}
                style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 1,
                }}
            >
                {selectedEarText}
            </Text>
        )}
        <canvas ref={canvasRef} id={"headCanvas"}
            style={{ width: "100%", height: "100%", display: "block", margin: "0 auto" }}
        />
    </div>
    )
}

export default HeadRendering
