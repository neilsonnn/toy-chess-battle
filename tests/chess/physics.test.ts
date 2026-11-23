import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { colliderTemplates, PHYSICS } from '../../src/chess/render/physics'
import type { Kind } from '../../src/chess/game/types'

function tunedWorld() {
  const world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 }), p = world.integrationParameters
  p.numSolverIterations = PHYSICS.solverIterations; p.numInternalPgsIterations = PHYSICS.internalIterations
  p.contact_natural_frequency = PHYSICS.contactFrequency; p.normalizedAllowedLinearError = PHYSICS.allowedError
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0))
  world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.5, 30).setFriction(PHYSICS.friction).setContactSkin(PHYSICS.skin), floor)
  return world
}

beforeAll(async () => { await RAPIER.init() })
describe('Rapier rigidbody physics', () => {
  it('settles the actual heavier chess and checker compound colliders', () => {
    const world = tunedWorld()
    const kinds: Kind[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king', 'checker', 'go']
    const bodies = kinds.map((kind, i) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(i * 2 - 8, 2, 0).setLinearDamping(PHYSICS.linearDamping).setAngularDamping(PHYSICS.angularDamping))
      for (const desc of colliderTemplates(RAPIER, kind, false)) world.createCollider(desc, body)
      expect(body.mass()).toBeGreaterThan(1)
      return body
    })
    for (let i = 0; i < 480; i++) world.step()
    for (const body of bodies) { expect(Number.isFinite(body.translation().y)).toBe(true); expect(body.translation().y).toBeGreaterThan(-0.04); expect(Math.abs(body.linvel().y)).toBeLessThan(0.15) }
    world.free()
  })
  it('keeps softened pinched contacts finite without escape forces or collision exclusions', () => {
    const world = tunedWorld()
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.5, 0).setLinearDamping(PHYSICS.linearDamping))
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25).setDensity(PHYSICS.density).setRestitution(PHYSICS.restitution), body)
    const pushers = [-1, 1].map(side => { const pusher = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(side, 0.5, 0)); world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.4, 0.4), pusher); return pusher })
    let peakSpeed = 0
    for (let i = 0; i < 120; i++) {
      const gap = Math.max(0.45, 1 - i / 120)
      pushers[0].setNextKinematicTranslation({ x: -gap, y: 0.5, z: 0 }); pushers[1].setNextKinematicTranslation({ x: gap, y: 0.5, z: 0 }); world.step()
      const v = body.linvel(); peakSpeed = Math.max(peakSpeed, Math.hypot(v.x, v.y, v.z))
    }
    expect(peakSpeed).toBeLessThan(20); expect(body.translation().y).toBeGreaterThan(-0.1)
    world.free()
  })
  it('collides, bounces and settles a captured body on the board', () => {
    const world = new RAPIER.World({ x: 0, y: -15, z: 0 })
    const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0))
    world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.5, 30).setFriction(0.75), floor)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0).setLinvel(3, 2.5, 0).setLinearDamping(0.2))
    world.createCollider(RAPIER.ColliderDesc.ball(0.3).setRestitution(0.18), body)
    for (let frame = 0; frame < 480; frame++) world.step()
    expect(body.translation().y).toBeGreaterThan(0.28); expect(body.translation().y).toBeLessThan(0.32)
    expect(body.translation().x).toBeGreaterThan(0.5); expect(Math.abs(body.linvel().y)).toBeLessThan(0.1)
    world.free()
  })
  it('lets living kinematic pieces push dynamic bodies with actual collision impulses', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    const living = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-2, 0, 0))
    world.createCollider(RAPIER.ColliderDesc.ball(0.3), living)
    const corpse = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic())
    world.createCollider(RAPIER.ColliderDesc.ball(0.3), corpse)
    for (let i = 0; i < 60; i++) { living.setNextKinematicTranslation({ x: -2 + i / 30, y: 0, z: 0 }); world.step() }
    expect(corpse.translation().x).toBeGreaterThan(0.5); expect(corpse.linvel().x).toBeGreaterThan(0)
    world.free()
  })
})
