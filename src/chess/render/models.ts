import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Kind } from '../game/types'
import { bishopMitre, knightHead, queenCrown } from './toppers'

export type Triple = [number, number, number]
export interface Part { shape: 'box' | 'sphere' | 'cylinder' | 'capsule' | 'mitre' | 'crown' | 'knight'; at: Triple; scale: Triple; rotation?: Triple }
const bases = {
  box: new BoxGeometry(1, 1, 1), sphere: new SphereGeometry(0.5, 16, 12),
  cylinder: new CylinderGeometry(0.5, 0.5, 1, 24), capsule: new CapsuleGeometry(0.5, 1, 6, 16),
  mitre: bishopMitre(), crown: queenCrown(), knight: knightHead(),
}
export const getPartGeometry = (shape: Part['shape']) => bases[shape]
export const materials = [
  new MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.04 }),
  new MeshStandardMaterial({ color: '#282a2b', roughness: 0.35, metalness: 0.06 }),
]
const part = (shape: Part['shape'], at: Triple, scale: Triple, rotation?: Triple): Part => ({ shape, at, scale, rotation })
export const modelKey = (kind: Kind, crowned = false) => `${kind}:${kind === 'checker' && crowned ? 1 : 0}`
const templates = new Map<string, { geometry: BufferGeometry; parts: Part[] }>()
export function getModel(kind: Kind, crowned = false) {
  const key = modelKey(kind, crowned), cached = templates.get(key)
  if (cached) return cached
  let parts: Part[]
  if (kind === 'checker') { const height = crowned ? 0.4 : 0.28; parts = [part('cylinder', [0, height / 2, 0], [0.86, height, 0.86])] }
  else if (kind === 'go') parts = [part('sphere', [0, 0.18, 0], [0.9, 0.36, 0.9])]
  else if (kind === 'ship') parts = [part('box', [0, 0.25, 1], [0.8, 0.5, 3])]
  else {
    parts = [part('cylinder', [0, 0.1, 0], [0.65, 0.2, 0.65]), part('capsule', [0, 0.7, 0], [0.5, 0.45, 0.42])]
    if (kind !== 'rook' && kind !== 'knight') parts.push(part('sphere', [0, 1.3, 0], [0.34, 0.34, 0.34]))
    if (kind === 'rook') {
      parts.push(part('box', [0, 1.3, 0], [0.42, 0.28, 0.42]))
      for (const x of [-0.14, 0.14]) for (const z of [-0.14, 0.14]) parts.push(part('box', [x, 1.48, z], [0.14, 0.15, 0.14]))
    }
    if (kind === 'knight') parts.push(part('knight', [0, 1.13, 0], [1, 1, 1]))
    if (kind === 'bishop') parts.push(part('mitre', [0, 1.45, 0], [1, 1, 1]))
    if (kind === 'queen') parts.push(part('crown', [0, 1.45, 0], [1, 1, 1]))
    if (kind === 'king') parts.push(part('box', [0, 1.65, 0], [0.13, 0.6, 0.13]), part('box', [0, 1.75, 0], [0.43, 0.12, 0.13]))
  }
  const matrix = new Matrix4(), quaternion = new Quaternion()
  const transformed = parts.map(p => {
    quaternion.setFromAxisAngle(new Vector3(1, 0, 0), p.rotation?.[0] ?? 0)
    matrix.compose(new Vector3(...p.at), quaternion, new Vector3(...p.scale))
    return bases[p.shape].clone().applyMatrix4(matrix)
  })
  const geometry = mergeGeometries(transformed)!
  transformed.forEach(g => g.dispose()); geometry.computeBoundingSphere()
  const model = { geometry, parts }; templates.set(key, model); return model
}
