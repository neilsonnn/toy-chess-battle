export type Cell = { x: number; z: number }
export type Kind = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king' | 'checker' | 'ship' | 'go'
export type Game = 'chess' | 'checkers' | 'mines' | 'ships' | 'go'
export type Mode = 'realism' | 'elimination' | 'realism2x'
export type Flags = Record<Game, boolean>
export const GAMES: Game[] = ['chess', 'checkers', 'mines', 'ships', 'go']
export const DEFAULT_FLAGS: Flags = { chess: true, checkers: false, mines: false, ships: false, go: false }
export const PLAYABLE_GAMES: Game[] = ['chess', 'checkers', 'mines', 'go']
export const GAME_KEYS: Partial<Record<Game, string>> = { chess: '1', checkers: '2', mines: '3', go: '5' }
export const MODE_NAMES: Record<Mode, string> = { realism: 'Realism', elimination: 'Elimination', realism2x: 'Realism 2×' }
export const MODES: Mode[] = ['realism', 'elimination', 'realism2x']
export const CARDINAL: Cell[] = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }]
export const DIAGONAL: Cell[] = [{ x: 1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: 1 }, { x: -1, z: -1 }]
export const add = (a: Cell, b: Cell, n = 1): Cell => ({ x: a.x + b.x * n, z: a.z + b.z * n })
export const same = (a: Cell, b: Cell) => a.x === b.x && a.z === b.z
export const gameOf = (kind: Kind): Game => kind === 'checker' ? 'checkers' : kind === 'ship' ? 'ships' : kind === 'go' ? 'go' : 'chess'
export interface Actor {
  id: number; kind: Kind; originalKind: Kind; side: number; dir: number
  cell: Cell; home: Cell; from: Cell; active: boolean; waiting: boolean
  life: number; kills: number; deaths: number; crowned: boolean; chain: boolean
  started: number; next: number; moving: boolean; jumping: boolean; hull: number
}
export interface Move { cell: Cell; victim?: Actor; jump?: boolean }
export interface Corpse { id: number; kind: Kind; side: number; crowned: boolean; cell: Cell; height: number; dir: number; born: number; velocity: [number, number, number] }
export interface Missile { id: number; owner: number; life: number; from: Cell; to: Cell; born: number; duration: number }
export interface Drop { actor: Actor; cell: Cell; born: number }
export interface Blast { id: number; cell: Cell; born: number; large: boolean }
export interface CaptureEvent { victim: number; killer?: number; clock: number; position: [number, number, number] }
