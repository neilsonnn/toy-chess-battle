import { create } from 'zustand'
import { Engine } from './engine'
import { DEFAULT_FLAGS } from './types'

const initial = new Engine('realism', 8, DEFAULT_FLAGS)
interface State {
  engine: Engine
  version: number
  clock: number
  captures: number
  reset: () => void
  sync: () => void
}

// Saved interactive settings are neither
// loaded nor overwritten, so old preferences cannot re-enable other game modes.
export const useGame = create<State>((set, get) => ({
  engine: initial, version: initial.version, clock: 0, captures: 0,
  reset: () => {
    const engine = get().engine
    engine.reset()
    lastEngine = engine
    lastGeneration = engine.generation
    resumeClock()
    get().sync()
  },
  sync: () => {
    const engine = get().engine
    set({ version: engine.version, clock: engine.clock, captures: engine.totalCaptures })
  },

}))
let lastWall = performance.now(), lastSync = 0, lastEngine = initial
let lastGeneration = initial.generation
export function resumeClock() { lastWall = performance.now() }
export function tick() {
  const now = performance.now(), state = useGame.getState(), engine = state.engine
  if (engine !== lastEngine || engine.generation !== lastGeneration) {
    lastEngine = engine; lastGeneration = engine.generation; lastWall = now
  }
  const delta = (now - lastWall) / 1000
  lastWall = now
  engine.advance(delta)
  if (now - lastSync > 200) { state.sync(); lastSync = now }
}
