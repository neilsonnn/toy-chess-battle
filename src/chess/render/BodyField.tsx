import { memo, useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { DynamicDrawUsage, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import type { Corpse, Kind } from '../game/types'
import { Engine, MAX_CORPSES } from '../game/engine'
import { getModel, materials, modelKey } from './models'
import { colliderTemplates, PHYSICS } from './physics'
import { renderMetrics } from './metrics'

const KINDS: Kind[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king', 'checker', 'go', 'ship']
const STEP = 1 / 60, UP = new Vector3(0, 1, 0)
interface Body { body: RapierRigidBody; kind: Kind; crowned: boolean; life: number; enabled: boolean }
interface Fallen extends Body { data: Corpse | null; previous: Vector3; current: Vector3; previousRotation: Quaternion; currentRotation: Quaternion; stamp: number }
interface Batch { mesh: InstancedMesh; kind: Kind; side: number; crowned: boolean }
const heading = (dir: number) => Math.PI / 2 - dir * Math.PI / 2

export const BodyField = memo(function BodyField({ engine }: { engine: Engine }) {
  const { rapier, world } = useRapier()
  const state = useMemo(() => {
    const capacity = MAX_CORPSES + Math.min(512, engine.size ** 2) + 64, batches = new Map<string, Batch>()
    for (const kind of KINDS) for (const crowned of kind === 'checker' ? [false, true] : [false]) for (const side of [0, 1]) {
      const mesh = new InstancedMesh(getModel(kind, crowned).geometry, materials[side], capacity)
      mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false
      batches.set(`${modelKey(kind, crowned)}:${side}`, { mesh, kind, side, crowned })
    }
    return { batches, living: new Map<number, Body>(), dead: new Map<number, Fallen>(), free: new Map<string, Fallen[]>(), allFallen: new Set<Fallen>(),
      matrix: new Matrix4(), position: new Vector3(), rotation: new Quaternion(), scale: new Vector3(1, 1, 1), translation: { x: 0, y: 0, z: 0 }, version: -1, generation: engine.generation, stamp: 0, accumulator: 0 }
  }, [engine])
  const position = (x: number, y: number, z: number) => { state.translation.x = x - engine.size / 2 + 0.5; state.translation.y = y; state.translation.z = z - engine.size / 2 + 0.5; return state.translation }
  function create(kind: Kind, crowned: boolean, dynamic: boolean) {
    const desc = dynamic ? rapier.RigidBodyDesc.dynamic().setLinearDamping(PHYSICS.linearDamping).setAngularDamping(PHYSICS.angularDamping).setCcdEnabled(true) : rapier.RigidBodyDesc.kinematicPositionBased()
    const body = world.createRigidBody(desc)
    for (const collider of colliderTemplates(rapier, kind, crowned)) world.createCollider(collider, body)
    renderMetrics.bodyCreations++
    return body
  }
  function retire(record: Fallen) {
    record.data = null; record.body.setEnabled(false); record.enabled = false
    const key = modelKey(record.kind, record.crowned), list = state.free.get(key) ?? []
    list.push(record); state.free.set(key, list)
  }
  function sync() {
    if (engine.version === state.version) return
    if (engine.generation !== state.generation) {
      // A new round reuses the world, living bodies and fallen-body pool.
      for (const record of state.dead.values()) retire(record)
      state.dead.clear()
      for (const record of state.living.values()) record.life = -1
      state.accumulator = 0
      state.generation = engine.generation
    }
    state.version = engine.version; const stamp = ++state.stamp
    // Release expired bodies before assigning captures, so ordinary steady-state
    // deaths reuse existing Rapier bodies and colliders instead of rebuilding them.
    for (const c of engine.corpses) { const old = state.dead.get(c.id); if (old) old.stamp = stamp }
    for (const [id, record] of state.dead) if (record.stamp !== stamp) { retire(record); state.dead.delete(id) }
    for (const c of engine.corpses) {
      if (state.dead.has(c.id)) continue
      const key = modelKey(c.kind, c.crowned), list = state.free.get(key)
      let record = list?.pop()
      if (!record) {
        if (state.allFallen.size >= MAX_CORPSES + 32) for (const free of state.free.values()) if (free.length) { const spare = free.pop()!; world.removeRigidBody(spare.body); state.allFallen.delete(spare); break }
        record = { body: create(c.kind, c.crowned, true), kind: c.kind, crowned: c.crowned, life: 0, enabled: false, data: null,
          previous: new Vector3(), current: new Vector3(), previousRotation: new Quaternion(), currentRotation: new Quaternion(), stamp }
        state.allFallen.add(record)
      }
      record.data = c; record.enabled = true; record.stamp = stamp
      const p = position(c.cell.x, c.height + 0.01, c.cell.z), q = state.rotation.setFromAxisAngle(UP, heading(c.dir))
      record.body.setEnabled(true); record.body.setTranslation(p, true); record.body.setRotation(q, true)
      record.body.resetForces(true); record.body.resetTorques(true)
      record.body.setLinvel({ x: c.velocity[0], y: c.velocity[1], z: c.velocity[2] }, true)
      record.body.setAngvel({ x: c.velocity[2] * 1.2 + 2, y: 0.7, z: -c.velocity[0] * 1.2 - 1.4 }, true)
      record.previous.set(p.x, p.y, p.z); record.current.copy(record.previous); record.previousRotation.copy(q); record.currentRotation.copy(q)
      state.dead.set(c.id, record)
    }
    for (const a of engine.actors) {
      let record = state.living.get(a.id)
      if (record && (record.kind !== a.kind || record.crowned !== a.crowned)) { world.removeRigidBody(record.body); state.living.delete(a.id); record = undefined }
      if (!record && a.active) { record = { body: create(a.kind, a.crowned, false), kind: a.kind, crowned: a.crowned, life: -1, enabled: false }; state.living.set(a.id, record) }
      if (!record) continue
      if (!a.active) { if (record.enabled) record.body.setEnabled(false); record.enabled = false; continue }
      if (record.life !== a.life || !record.enabled) {
        const p = engine.position(a, state.translation)
        const translation = position(p.x, p.y, p.z)
        record.body.setTranslation(translation, false); record.body.setNextKinematicTranslation(translation); record.body.setRotation(state.rotation.setFromAxisAngle(UP, heading(a.dir)), false)
        record.body.setEnabled(true); record.life = a.life; record.enabled = true
      }
    }
    for (const [id, record] of state.living) if (!engine.actors.some(a => a.id === id)) { world.removeRigidBody(record.body); state.living.delete(id) }
    renderMetrics.liveBodies = engine.occupancy.size; renderMetrics.fallenBodies = state.dead.size; renderMetrics.pooledBodies = state.allFallen.size
  }
  function write(batch: Batch) {
    const index = batch.mesh.count++
    state.matrix.compose(state.position, state.rotation, state.scale); batch.mesh.setMatrixAt(index, state.matrix)
  }
  function draw() {
    for (const batch of state.batches.values()) batch.mesh.count = 0
    for (const a of engine.actors) if (a.active) {
      const p = engine.position(a, state.translation), batch = state.batches.get(`${modelKey(a.kind, a.crowned)}:${a.side}`)!
      state.position.set(p.x - engine.size / 2 + 0.5, p.y, p.z - engine.size / 2 + 0.5); state.rotation.setFromAxisAngle(UP, heading(a.dir)); write(batch)
    }
    const alpha = engine.paused ? 1 : Math.min(1, state.accumulator / STEP)
    for (const record of state.dead.values()) {
      const c = record.data!, batch = state.batches.get(`${modelKey(c.kind, c.crowned)}:${c.side}`)!
      state.position.lerpVectors(record.previous, record.current, alpha); state.rotation.slerpQuaternions(record.previousRotation, record.currentRotation, alpha); write(batch)
    }
    for (const d of engine.drops) {
      const t = Math.min(1, (engine.clock - d.born) / 0.22), batch = state.batches.get(`go:0:${d.actor.side}`)!
      state.position.set(d.cell.x - engine.size / 2 + 0.5, 18 * (1 - t * t), d.cell.z - engine.size / 2 + 0.5); state.rotation.identity(); write(batch)
    }
    for (const batch of state.batches.values()) batch.mesh.instanceMatrix.needsUpdate = true
  }
  // Sync once before Physics (-2), then upload instance matrices once after all
  // fixed substeps. A slow frame must not redraw the whole field per substep.
  useFrame((_, delta) => { sync(); if (!engine.paused) state.accumulator += Math.min(delta, 0.5); else state.accumulator = 0 }, -3)
  useFrame(() => draw(), -1)
  useBeforePhysicsStep(() => {
    for (const record of state.dead.values()) { record.previous.copy(record.current); record.previousRotation.copy(record.currentRotation) }
    for (const a of engine.actors) if (a.active) { const record = state.living.get(a.id); if (!record) continue; const p = engine.position(a, state.translation); record.body.setNextKinematicTranslation(position(p.x, p.y, p.z)) }
  })
  useAfterPhysicsStep(() => {
    state.accumulator = Math.max(0, state.accumulator - STEP)
    for (const record of state.dead.values()) { const p = record.body.translation(), q = record.body.rotation(); record.current.set(p.x, p.y, p.z); record.currentRotation.set(q.x, q.y, q.z, q.w) }
  })
  // Release owned bodies in the layout cleanup, before Physics frees its WASM
  // world in passive cleanup. This also keeps reset/mode switches safe.
  useLayoutEffect(() => () => {
    for (const record of state.living.values()) world.removeRigidBody(record.body)
    for (const record of state.allFallen) world.removeRigidBody(record.body)
    for (const batch of state.batches.values()) batch.mesh.dispose()
    state.living.clear(); state.dead.clear(); state.allFallen.clear(); state.free.clear(); state.version = -1
  }, [state, world])
  return <group>{[...state.batches.values()].map(batch => <primitive key={`${modelKey(batch.kind, batch.crowned)}:${batch.side}`} object={batch.mesh} />)}</group>
})
