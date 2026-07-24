import { useEffect, useRef, useState } from "react"
import * as THREE from "three";
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { getCanalAlignment, meshPartsLength } from "../utils/alignment";
import { BLUE_COLOUR, ORANGE_COLOUR, BROWN_COLOUR, BACKGR_COLOUR, GREEN_COLOUR, RED_COLOUR, BACKGR_COLOUR_CSS} from "../utils/config";
import { changeQuaternionBase } from "../utils/changeBase";
import {applyYawOffset} from "../utils/applyYawOffset"
import { useTreatment } from "../context/TreatmentProvider";

import { Slider, Stack, Text, Group, Button } from '@mantine/core';
import { TreatmentStage } from "../types/treatmentTypes";

import { canalDirections } from "../utils/canalDirections";
import { createThickArrow } from "../custom/thickArrow";
import { useSound } from "use-sound";
import { getHighlightedMeshPart } from "../utils/meshPartDisplay";

// Set camera position and rotation constants for the scene
const CAMERA_POSITION = new THREE.Vector3(-50, 0, 0);
const CAMERA_ROTATION = new THREE.Euler(Math.PI / 2, -Math.PI / 2, 0, 'XYZ');
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 1000;

function applyFixedCameraPose(camera: THREE.PerspectiveCamera) {
  camera.position.copy(CAMERA_POSITION);
  camera.rotation.copy(CAMERA_ROTATION);
  camera.near = CAMERA_NEAR;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}



// {canal, ear, affectedCanal, matrixRef, offsetMatrixRef, stage, alignmentRef, alignedRef}: Props
const CanalRendering = () => {

    const [active, setActive] = useState(true)

    // Using TreatmentProvider context to get the necessary variables for rendering and alignment
    const {matrixRef, offsetMatrixRef, alignmentRef, alignedRef, state, dispatch, showGuidanceArrows, setShowGuidanceArrows} = useTreatment();

    // Setup sounds
    const [playAligned] = useSound(process.env.PUBLIC_URL + "/sounds/aligned.mp3")
    const [playNotAligned] = useSound(process.env.PUBLIC_URL + "/sounds/naligned.mp3")
    const [playNext] = useSound(process.env.PUBLIC_URL + "/sounds/stagedone.mp3")
    const highlightedMeshPart = getHighlightedMeshPart(state.affectedCanal, state.stage, state.isAligned)

    // Scene setting variables
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const scene = useRef<THREE.Scene>()
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const meshParts = useRef<THREE.Mesh[]>([])

    const canalColours = {"posterior": BLUE_COLOUR, "anterior": ORANGE_COLOUR, "lateral": BROWN_COLOUR, "all": 0, "unselected": 0x333333}
    const coloursAll = [BLUE_COLOUR, ORANGE_COLOUR, BROWN_COLOUR, 0x333333, 0x333333]

    // Group mesh control variables
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const canalGroup = useRef<THREE.Group>(new THREE.Group());
    const arrowRef = useRef<THREE.Group | null>(new THREE.Group());

    // Add clock for animation pulsing
    const clock = new THREE.Clock();

    // Function to clear the scene and reset variables when canal changes
    function clearCanalGroup() {
        canalGroup.current.children.forEach((child) => {
            if ((child as THREE.Mesh).geometry) {
            (child as THREE.Mesh).geometry.dispose();
            }

            if ((child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material;
            if (Array.isArray(mat)) {
                mat.forEach(m => m.dispose());
            } else {
                mat.dispose();
            }
            }
        });
        canalGroup.current.clear();
    }

    useEffect(() => {

        if (!canvasRef.current) return;
        const rendererInstance = new THREE.WebGLRenderer({canvas: canvasRef.current, antialias: true})
        rendererRef.current = rendererInstance;
        const container = document.getElementById("canalCanvasContainer") as HTMLDivElement;
        // const size = active ? document.documentElement.clientWidth * 0.207 : 0
        // rendererInstance.setSize(size, size)
        rendererInstance.setSize(container.clientWidth, container.clientHeight, false)

        // Clear previous canal from scene
        clearCanalGroup()
        meshParts.current = [] // flush any previous meshes from memory


        // Scene initialisation
        const sceneInstance = new THREE.Scene()
        scene.current = sceneInstance
        sceneInstance.background = new THREE.Color(BACKGR_COLOUR)

        // Camera initialisation
        const camera = new THREE.PerspectiveCamera(12, 1)
        cameraRef.current = camera
        applyFixedCameraPose(camera);


        // // camera.current.rotation.y = Math.PI;
        // camera.current.position.set(40, 0, 0)
        // camera.current.lookAt(0, 0, 0)
        // camera.current.rotation.z = -Math.PI / 2;
        // // Centre the meshes on the origin
        canalGroup.current.position.set(0, 0, 0);


        // Add lights
        const sectionHighlight = new THREE.AmbientLight(0xffffff, 0.8)
        sceneInstance.add(sectionHighlight)

        const pointLight1 = new THREE.PointLight(0xffffff, 200)
        pointLight1.castShadow = true
        pointLight1.position.set(0, 0, 35)
        sceneInstance.add(pointLight1)

        const pointLight2 = new THREE.PointLight(0xffffff, 1300)
        pointLight2.castShadow = true
        pointLight2.position.set(0, 15, 8)
        sceneInstance.add(pointLight2)

        const pointLight3 = new THREE.PointLight(0xffffff, 200)
        pointLight3.castShadow = true
        pointLight3.position.set(0, -20, 0)
        sceneInstance.add(pointLight3)

        // Add canalGroup which allows arrows to be grouped with mesh
        sceneInstance.add(canalGroup.current);

        let resizeFrame: number | null = null;
        let lastRendererSize = { width: 0, height: 0 };

        // Resize window to fit mesh well
        function resizeRenderer() {
            if (resizeFrame !== null) {
                cancelAnimationFrame(resizeFrame);
            }

            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = null;

                const size = Math.max(1, Math.min(container.clientWidth, container.clientHeight));
                if (lastRendererSize.width === size && lastRendererSize.height === size) {
                    return;
                }

                lastRendererSize = { width: size, height: size };
                rendererInstance.setSize(size, size, false);
                camera.aspect = 1;
                camera.updateProjectionMatrix();
            });
        }

        resizeRenderer();
        const resizeObserver = new ResizeObserver(resizeRenderer);
        resizeObserver.observe(container);

        disposeObject(canalGroup.current);

        if (showGuidanceArrows) {
            if (state.stage !== TreatmentStage.COMPLETE) {
                arrowRef.current = createThickArrow(
                // canalDirections[state.affectedCanal!].directions[state.stage!],
                // canalDirections[state.affectedCanal!].origins[state.stage!],
                (state.affectedEar !== "right") ? canalDirections[state.affectedCanal!].directions[state.stage!] : canalDirections[state.affectedCanal!].directions[state.stage!].clone().setY(canalDirections["posterior"].directions[state.stage!].y * -1),
                (state.affectedEar !== "right") ? canalDirections[state.affectedCanal!].origins[state.stage!] : canalDirections[state.affectedCanal!].origins[state.stage!].clone().setY(canalDirections["posterior"].origins[state.stage!].y * -1),
                10,
                (state.isAligned) ? GREEN_COLOUR : ORANGE_COLOUR,
                alignmentRef!.current,
            );
            canalGroup.current.add(arrowRef.current);
            }
        }

        // Load Canal Mesh
        const loader = new PLYLoader()
        let color = 0
        for (let i = 0; i < meshPartsLength[state.affectedCanal ? state.affectedCanal : 5]; i++) {
            // const meshPath = "rh_meshes/" + state.affectedCanal + "_" + i.toString() + ".ply"

            // const meshPath = (state.affectedEar !== "right") ? (process.env.PUBLIC_URL + "/rh_meshes/" + state.affectedCanal + "_" + i.toString() + ".ply") : (process.env.PUBLIC_URL + "/right_rh_meshes/" + state.affectedCanal + "_" + i.toString() + "_right" + ".ply");
            const meshPath = (state.affectedEar !== "right") ? (process.env.PUBLIC_URL + "/rh_meshes/" + state.affectedCanal + "_" + i.toString() + ".ply") : (process.env.PUBLIC_URL + "/new_right_meshes/" + state.affectedCanal + "_" + i.toString() + ".ply");

            loader.load(meshPath, (geometry) => {


                color = canalColours["unselected"]

                const material = new THREE.MeshStandardMaterial({
                    color,
                    side: THREE.DoubleSide,
                    flatShading: true,
                })
                const loadedMesh = new THREE.Mesh(geometry, material)

                loadedMesh.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 1))
                if (state.affectedEar === "right") {
                    // loadedMesh.applyMatrix4(new THREE.Matrix4().makeScale(1, -1, 1))
                    // loadedMesh.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI))
                    // loadedMesh.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI))
                } else {
                    // loadedMesh.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1))
                    // loadedMesh.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI))
                }
                canalGroup.current.add(loadedMesh)
                meshParts.current[i] = loadedMesh
            })
        }

        // Main animation loop
        let loop: number = requestAnimationFrame(animate)
        function animate() {

            // Opacity pulsing effect
            const t = clock.getElapsedTime();
            const opacity = 0.95 + 0.3 * Math.sin(t * 4);

            const meshCount = meshPartsLength[state.affectedCanal ? state.affectedCanal : 5];
            const meshesLoaded = meshParts.current.length >= meshCount && meshParts.current.slice(0, meshCount).every(Boolean);

            if (meshesLoaded) {

                // Rotate the group
                const qB = new THREE.Quaternion();

                // Add in the offset matrix to correct for any yaw drift in the IMU data
                const corrected = offsetMatrixRef.current.clone().multiply(matrixRef.current);
                changeQuaternionBase(corrected, qB);
                canalGroup.current.setRotationFromQuaternion(qB);
 
                const segmentID = (state.stage===TreatmentStage.COMPLETE) ? 4 : ((state.affectedCanal !== "lateral") ? state.stage + 1 : state.stage + 1);

                const canalAlignRes =  getCanalAlignment(
                    // canalDirections["posterior"].directions[segmentID!-1], // the target direction for the current stage and canal
                    (state.affectedEar !== "right") ? canalDirections["posterior"].directions[segmentID!-1] : canalDirections["posterior"].directions[segmentID!-1].clone().setY(canalDirections["posterior"].directions[segmentID!-1].y * -1), // flip Y for right ear
                    canalGroup.current,  //.children[segmentID] as THREE.Object3D, // the current segment mesh
                    new THREE.Vector3(0, 0, 1),
                    // (state.stage === TreatmentStage.STAGE_2) ? new THREE.Vector3(Math.sin(15 * Math.PI/180), 0, 15 * Math.PI/180) : new THREE.Vector3(0, 0, 1), // target world direction (upwards)          
                    (state.stage === TreatmentStage.STAGE_2) ? 25 : 15 // threshold in percentage (i.e. 100 - this number)
                )
    
                alignmentRef!.current = canalAlignRes.score
                alignedRef!.current = canalAlignRes.isAligned

                const dimOtherMeshes =
                    state.stage === TreatmentStage.STAGE_1 && canalAlignRes.score > 0.85

                meshParts.current.forEach((mesh, index) => {
                    const shouldDim = false //dimOtherMeshes && index !== 1
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

                    materials.forEach((material) => {
                        const transparencyChanged = material.transparent !== shouldDim
                        material.transparent = shouldDim
                        material.opacity = shouldDim ? 0.3 : 1
                        material.depthWrite = !shouldDim
                        if (transparencyChanged) material.needsUpdate = true
                    })
                })
    
                if (alignedRef!.current && !state.isAligned) {
                    // Handle the case where the canal becomes aligned
                    // dispatch({ type: 'TOGGLE_ALIGNED' })
                    if (state.stage !== TreatmentStage.COMPLETE) playAligned();
                    dispatch({ type: 'ALIGNMENT_ENTER' })
                }

                else if (!alignedRef!.current && state.isAligned) {
                    if (state.stage !== TreatmentStage.COMPLETE) playNotAligned();
                    // Handle case where canal loses alignment
                    dispatch({ type: 'ALIGNMENT_EXIT'})
                }
                
                // else {
                if (state.stage === TreatmentStage.COMPLETE) {
                    meshParts.current.forEach((mesh) => {
                        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                        materials.forEach((material) => {
                            if (material instanceof THREE.MeshStandardMaterial) {
                                material.color.setHex(GREEN_COLOUR)
                            }
                        })
                    })
                }
                else if (state.isAligned) {
                    const material = new THREE.MeshStandardMaterial({color: GREEN_COLOUR, side: THREE.DoubleSide, flatShading: true})
                    meshParts.current[segmentID!].material = material
                } 
                else {
                    const material = new THREE.MeshStandardMaterial({color: RED_COLOUR, side: THREE.DoubleSide, flatShading: true})
                    meshParts.current[segmentID!].material = material
                }
    
                // }

            // Make the arrow pulse
            const arrowMesh = arrowRef.current;
            arrowMesh?.traverse((child) => {
                if ((child as THREE.Mesh).material) {
                    const mat = (child as THREE.Mesh).material as THREE.Material & { opacity?: number };
                    if ('opacity' in mat) {
                        mat.opacity = opacity;
                    }
                }
            });


            rendererInstance.render(sceneInstance, camera)
            }
            loop = requestAnimationFrame(animate)
        }

        return () => {
            cancelAnimationFrame(loop) 
            if (resizeFrame !== null) {
                cancelAnimationFrame(resizeFrame);
            }
            resizeObserver.disconnect();
            sceneInstance.clear()
            rendererInstance.dispose()
            rendererRef.current = null;
            cameraRef.current = null;
            meshParts.current = [] // flush any previous loadings
        }

    }, [state.isAligned, state.affectedCanal, state.affectedEar, state.stage, matrixRef, offsetMatrixRef, showGuidanceArrows])


    return (
            <div id="canalCanvasContainer" style={{flex: 1, minHeight: 0, width: "100%", height: "100%", maxHeight: "100%", maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: BACKGR_COLOUR_CSS, position: "relative", overflow: "hidden"}}>
            
            <canvas ref={canvasRef}
                style={{ width: "auto", height: "100%", maxWidth: "100%", maxHeight: "100%", aspectRatio: "1 / 1", display: "block" }}
            />
        </div>
        
        
        
    )
}

export default CanalRendering

// <Stack align="center" gap="md" >
// <Text size="lg" >{(alignmentRef.current * 100).toFixed(1)}%</Text>
//         </Stack>
