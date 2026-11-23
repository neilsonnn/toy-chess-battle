import type { useRapier } from '@react-three/rapier'
import { Quaternion, Vector3 } from 'three'
import { getModel, getPartGeometry, modelKey } from './models'
import type { Kind } from '../game/types'

export const PHYSICS = { gravity: -15, density: 8, friction: 0.6, restitution: 0.04, linearDamping: 0.5, angularDamping: 0.8, solverIterations: 6, internalIterations: 2, contactFrequency: 12, allowedError: 0.005, skin: 0.002 }
type Rapier = ReturnType<typeof useRapier>['rapier']
type ColliderDesc = InstanceType<Rapier['ColliderDesc']>
const descriptors = new Map<string, ColliderDesc[]>()
export function colliderTemplates(rapier: Rapier, kind: Kind, crowned: boolean) {
  const key = modelKey(kind, crowned), cached = descriptors.get(key)
  if (cached) return cached
  const model = getModel(kind, crowned), q = new Quaternion(), axis = new Vector3(1, 0, 0)
  // Reusable compound primitives, with convex proxies for curved/custom tops.
  // All active bodies retain normal collisions with the floor and other pieces.
  const result = model.parts.map(p => {
    let desc: ColliderDesc
    if (p.shape === 'box') desc = rapier.ColliderDesc.cuboid(p.scale[0] / 2, p.scale[1] / 2, p.scale[2] / 2)
    else if (p.shape === 'cylinder') desc = rapier.ColliderDesc.cylinder(p.scale[1] / 2, p.scale[0] / 2)
    else if (p.shape === 'capsule') desc = rapier.ColliderDesc.capsule(p.scale[1] / 2, Math.min(p.scale[0], p.scale[2]) / 2)
    else if (p.shape === 'sphere' && kind !== 'go') desc = rapier.ColliderDesc.ball(p.scale[0] / 2)
    else if (kind === 'go') desc = rapier.ColliderDesc.convexHull(model.geometry.attributes.position.array as Float32Array)!
    else desc = rapier.ColliderDesc.convexHull(getPartGeometry(p.shape).attributes.position.array as Float32Array)!
    if (kind !== 'go') desc.setTranslation(...p.at)
    q.setFromAxisAngle(axis, p.rotation?.[0] ?? 0); desc.setRotation(q)
    return desc.setDensity(PHYSICS.density).setFriction(PHYSICS.friction).setRestitution(PHYSICS.restitution).setContactSkin(PHYSICS.skin)
  })
  descriptors.set(key, result); return result
}
