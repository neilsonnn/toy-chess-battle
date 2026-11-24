import { memo, startTransition, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { BoxGeometry, Color, DirectionalLight, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Engine } from '../game/engine'
import { resumeClock, tick, useGame } from '../game/store'
import { BodyField } from './BodyField'
import { PHYSICS } from './physics'
import { sampleFrame } from './metrics'

function Board({ size }: { size: number }) {
  const background = getComputedStyle(document.documentElement).getPropertyValue('--color-site').trim()
  const material = useMemo(() => {
    const m = new MeshBasicMaterial({ color: background, toneMapped: false })
    m.onBeforeCompile = shader => {
      shader.uniforms.boardSize = { value: size }; shader.uniforms.darkTile = { value: new Color('#444444') }
      shader.vertexShader = 'varying vec2 boardXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nboardXZ = (modelMatrix * vec4(position, 1.0)).xz;')
      shader.fragmentShader = 'varying vec2 boardXZ; uniform float boardSize; uniform vec3 darkTile;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 tile = boardXZ + vec2(boardSize * 0.5);
        if (tile.x >= 0.0 && tile.y >= 0.0 && tile.x < boardSize && tile.y < boardSize && mod(floor(tile.x) + floor(tile.y), 2.0) > 0.5) diffuseColor.rgb = darkTile;`)
    }
    m.customProgramCacheKey = () => 'seamless-unlit-board-v2'
    return m
  }, [size, background])
  useEffect(() => () => material.dispose(), [material])
  return <RigidBody type="fixed" colliders={false}>
    <CuboidCollider args={[size / 2 + 128, 0.5, size / 2 + 128]} position={[0, -0.5, 0]} friction={PHYSICS.friction} restitution={PHYSICS.restitution} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[size + 256, size + 256]} />
    </mesh>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]}>
      <planeGeometry args={[size + 256, size + 256]} />
      <shadowMaterial opacity={0.9} toneMapped={false} depthWrite={false} />
    </mesh>
  </RigidBody>
}
const clueGeometry = new BoxGeometry(0.035, 0.008, 0.035)
const a = new BoxGeometry(0.52, 0.008, 0.04).rotateY(Math.PI / 4), b = new BoxGeometry(0.52, 0.008, 0.04).rotateY(-Math.PI / 4)
const crossGeometry = mergeGeometries([a, b])!; a.dispose(); b.dispose()
const clueMaterial = new MeshBasicMaterial({ color: '#95968b' })
const crossMaterial = new MeshBasicMaterial({ color: '#d5d3c8' })
function Effects({ engine }: { engine: Engine }) {
  const state = useMemo(() => {
    const clues = new InstancedMesh(clueGeometry, clueMaterial, 1024), crosses = new InstancedMesh(crossGeometry, crossMaterial, 512)
    for (const mesh of [clues, crosses]) { mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0 }
    return { clues, crosses, matrix: new Matrix4(), position: new Vector3(), rotation: new Quaternion(), scale: new Vector3(), version: -1 }
  }, [engine])
  useEffect(() => () => { state.clues.dispose(); state.crosses.dispose() }, [state])
  useFrame(() => {
    const s = state, half = engine.size / 2 - 0.5
    if (s.version === engine.version) return
    s.version = engine.version; s.clues.count = 0; s.crosses.count = 0; s.rotation.identity(); s.scale.setScalar(1)
    for (const [key, count] of engine.clues) for (let i = 0; i < count; i++) {
      s.position.set(key % engine.size - half + (i % 3 - 1) * 0.12, 0.01, Math.floor(key / engine.size) - half + (Math.floor(i / 3) - 1) * 0.12)
      s.matrix.compose(s.position, s.rotation, s.scale); s.clues.setMatrixAt(s.clues.count++, s.matrix)
    }
    for (const drop of engine.drops) { s.position.set(drop.cell.x - half, 0.01, drop.cell.z - half); s.matrix.compose(s.position, s.rotation, s.scale); s.crosses.setMatrixAt(s.crosses.count++, s.matrix) }
    s.clues.instanceMatrix.needsUpdate = true; s.crosses.instanceMatrix.needsUpdate = true
  })
  return <group><primitive object={state.clues} /><primitive object={state.crosses} /></group>
}
function CameraRig({ engine }: { engine: Engine }) {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    camera.position.set(15, 15.25, -15)
    camera.lookAt(0, 0.25, 0)
    camera.zoom = Math.min(size.width / (engine.size * 1.65), size.height / (engine.size * 1.35 + 3))
    camera.updateProjectionMatrix()
  }, [engine, size.width, size.height, camera])
  return null
}
function BattleFrame({ active, onReady }: { active: boolean; onReady: () => void }) {
  const ready = useRef(false)
  const preparedFrames = useRef(0)
  useFrame(() => { if (active && ready.current) tick() }, -100)
  useFrame(() => {
    if (ready.current) return
    preparedFrames.current++
    if (preparedFrames.current < 2) return
    ready.current = true
    resumeClock()
    onReady()
  })
  return null
}
const Scene = memo(function Scene({ active, onReady }: { active: boolean, onReady: () => void }) {
  const engine = useGame(s => s.engine)
  const light = useRef<DirectionalLight>(null)
  const [loadPhysics, setLoadPhysics] = useState(false)
  // Avoid committing a Suspense fallback while Rapier initializes so React can
  // mount the physics scene as soon as the transition resolves.
  useLayoutEffect(() => { startTransition(() => setLoadPhysics(true)) }, [])
  useEffect(() => {
    if (!light.current) return
    // Add 50% coverage beyond the original shadow bounds.
    const camera = light.current.shadow.camera, radius = (engine.size / 2 + 5) * 1.5
    camera.left = -radius; camera.right = radius; camera.top = radius; camera.bottom = -radius; camera.updateProjectionMatrix()
  }, [engine])
  useFrame((state, dt) => sampleFrame(dt, state.gl.info.render.calls))
  return <>
    <ambientLight intensity={0.12} />
    <hemisphereLight args={['#ffffff', '#939087', 0.4]} />
    <directionalLight ref={light} position={[-12, 22, -9]} intensity={3.1} castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.00001} shadow-normalBias={0.001} shadow-camera-near={0.5} shadow-camera-far={60} />
    <CameraRig engine={engine} />
    <Suspense fallback={null}>
      {loadPhysics && <Physics updatePriority={-2} paused={!active} timeStep={1 / 60} gravity={[0, PHYSICS.gravity, 0]} numSolverIterations={PHYSICS.solverIterations}
        numInternalPgsIterations={PHYSICS.internalIterations} contactNaturalFrequency={PHYSICS.contactFrequency} allowedLinearError={PHYSICS.allowedError} maxCcdSubsteps={1}>
        <Board size={engine.size} /><BodyField engine={engine} /><BattleFrame active={active} onReady={onReady} />
      </Physics>}
    </Suspense>
    <Effects engine={engine} />
  </>
})
export default memo(function World({ active, onReady }: { active: boolean, onReady: () => void }) {
  const [tabVisible, setTabVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  const running = active && tabVisible
  // Reset wall time before restarting frames so hidden time never advances the game.
  useLayoutEffect(() => { if (running) resumeClock() }, [running])
  return <Canvas frameloop={running ? 'always' : 'never'} shadows orthographic camera={{ position: [15, 15, -15], zoom: 65, near: 0.1, far: 500 }} dpr={[1, 1.5]}
    gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={state => { state.events.enabled = false }}>
    <Scene active={running} onReady={onReady} />
  </Canvas>
})
