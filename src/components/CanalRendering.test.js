import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import CanalRendering from './CanalRendering';
import { initialState } from '../context/treatmentReducer';

const mockRender = jest.fn();
const mockDispose = jest.fn();
const mockLoad = jest.fn();
const mockSound = jest.fn();
let mockTreatment;
let mockAligned = false;
jest.mock('../context/TreatmentProvider', () => ({ useTreatment: () => mockTreatment }));
jest.mock('use-sound', () => ({ useSound: () => [mockSound] }));
jest.mock('../utils/alignment', () => ({ meshPartsLength: { posterior: 5 }, getCanalAlignment: () => ({ score: mockAligned ? 0.95 : 0.5, isAligned: mockAligned }) }));
jest.mock('three', () => {
  const actual = jest.requireActual('three');
  return { ...actual, WebGLRenderer: jest.fn().mockImplementation(() => ({ setSize() {}, render: mockRender, dispose: mockDispose })) };
});
jest.mock('three/examples/jsm/loaders/PLYLoader.js', () => ({ PLYLoader: class { load(...args) { mockLoad(...args); } } }));

it('keeps the scene and materials alive across alignment crossings', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const frames = new Map();
  let id = 0;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(key => frames.delete(key));
  const previousObserver = global.ResizeObserver;
  global.ResizeObserver = class { observe() {} disconnect() {} };
  THREE.WebGLRenderer.mockImplementation(() => ({ setSize() {}, render: mockRender, dispose: mockDispose }));
  mockLoad.mockImplementation((path, loaded) => loaded(new THREE.BufferGeometry()));
  mockTreatment = {
    state: { ...initialState, affectedEar: 'left' }, dispatch: jest.fn(),
    matrixRef: { current: new THREE.Matrix4() }, offsetMatrixRef: { current: new THREE.Matrix4() },
    alignmentRef: { current: 0 }, alignedRef: { current: false }, showGuidanceArrows: false,
  };
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const frame = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); });
  try {
    act(() => root.render(<CanalRendering />));
    frame();
    const scene = mockRender.mock.calls[0][0];
    const group = scene.children.find(child => child instanceof THREE.Group);
    const materials = group.children.map(mesh => mesh.material);
    mockAligned = true;
    frame(); frame();
    expect(mockTreatment.dispatch.mock.calls.filter(([action]) => action.type === 'ALIGNMENT_ENTER')).toHaveLength(1);
    mockTreatment.state = { ...mockTreatment.state, isAligned: true };
    act(() => root.render(<CanalRendering />));
    frame();
    expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(5);
    expect(mockDispose).not.toHaveBeenCalled();
    group.children.forEach((mesh, index) => expect(mesh.material).toBe(materials[index]));
    mockAligned = false;
    frame(); frame();
    expect(mockTreatment.dispatch.mock.calls.filter(([action]) => action.type === 'ALIGNMENT_EXIT')).toHaveLength(1);
    expect(mockSound).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount()); host.remove(); raf.mockRestore(); cancel.mockRestore(); global.ResizeObserver = previousObserver;
  }
  expect(mockDispose).toHaveBeenCalledTimes(1);
});
