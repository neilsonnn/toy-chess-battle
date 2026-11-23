import { memo } from 'react'
import type { Kind } from '../game/types'
import { getModel, materials } from './models'

export const Piece = memo(function Piece({ kind, side, crowned = false }: { kind: Kind; side: number; crowned?: boolean }) {
  return <mesh geometry={getModel(kind, crowned).geometry} material={materials[side]} castShadow receiveShadow />
})
