import { describe, expect, it } from 'vitest'
import { CORPSE_LIFETIME, Engine } from '../../src/chess/game/engine'
import { DEFAULT_FLAGS, GAMES } from '../../src/chess/game/types'
import type { Actor, Cell, Flags, Kind } from '../../src/chess/game/types'

const OFF: Flags = { chess: false, checkers: false, mines: false, ships: false, go: false }
const arena = () => new Engine('realism', 8, OFF, 123)
function put(e: Engine, kind: Kind, cell: Cell, side = 0, dir = 1): Actor {
  const a = e.make(kind, side, cell, dir, false); a.active = true; a.life = 1; a.next = Infinity; e.occupy(a); return a
}

describe('Realism formations and scheduling', () => {
  it('starts with 32 chess, 12 checker and two three-cell ships without overlaps', () => {
    const e = new Engine('realism', 8, { ...DEFAULT_FLAGS, checkers: true, mines: true, ships: true }, 456)
    expect(e.actors.filter(a => a.kind === 'ship')).toHaveLength(2)
    expect(e.actors.filter(a => a.kind === 'checker')).toHaveLength(12)
    expect(e.occupancy.size).toBe(50); expect(e.mines.size).toBe(4); expect(e.validate()).toBe(true)
  })
  it('starts on the first frame and freezes game time while paused', () => {
    const e = new Engine()
    e.advance(1 / 60); expect(e.clock).toBeCloseTo(1 / 60)
    expect(e.actors.some(actor => actor.moving)).toBe(true)
    e.paused = true; e.advance(4); expect(e.clock).toBeCloseTo(1 / 60)
  })
  it('uses independent decision times and reserves destinations before respawning victims', () => {
    const e = arena(), a = put(e, 'rook', { x: 3, z: 0 }), b = put(e, 'checker', { x: 3, z: 2 }, 1, 2)
    b.home = { ...b.cell }
    expect(e.move(a, { cell: b.cell })).toBe(true); expect(e.at(a.cell)).toBe(a); expect(b.deaths).toBe(1)
    expect(e.validate()).toBe(true); expect(b.cell).not.toEqual(a.cell)
  })
  it('keeps elimination deaths permanent, promotes and starts a new round at 15s', () => {
    const e = arena(); e.mode = 'elimination'; const a = put(e, 'pawn', { x: 2, z: 6 }), b = put(e, 'rook', { x: 1, z: 1 }, 1)
    e.capture(b, a); expect(b.active).toBe(false); expect(b.waiting).toBe(false)
    e.move(a, { cell: { x: 2, z: 7 } }); e.advance(0.4); expect(a.kind).toBe('queen')
    e.advance(15); expect(e.round).toBe(2); expect(e.clock).toBeCloseTo(0.4)
  })
})

describe('chess and checkers', () => {
  it('slides every non-knight chess type without vertical motion', () => {
    for (const kind of ['pawn', 'rook', 'bishop', 'queen', 'king'] as Kind[]) {
      const e = arena(), a = put(e, kind, { x: 3, z: 3 }); const m = e.legal(a)[0]
      e.move(a, m); e.clock = 0.19
      expect(e.position(a)[1]).toBe(0)
      const out = { x: 0, y: 0, z: 0 }; expect(e.position(a, out)).toBe(out); expect(out.y).toBe(0)
    }
    const e = arena(), knight = put(e, 'knight', { x: 3, z: 3 }); e.move(knight, e.legal(knight)[0]); e.clock = 0.19
    expect(e.position(knight)[1]).toBeGreaterThan(0.7)
  })
  it('retains fallen pieces for twelve simulation seconds and pauses their lifetime', () => {
    const e = arena(); e.mode = 'elimination'; const a = put(e, 'pawn', { x: 3, z: 3 }); e.capture(a)
    e.advance(CORPSE_LIFETIME - 0.1); expect(e.corpses).toHaveLength(1)
    e.paused = true; e.advance(5); expect(e.corpses).toHaveLength(1)
    e.paused = false; e.advance(0.2); expect(e.corpses).toHaveLength(0)
  })
  it('blocks rays at friendly pieces, ships, stones and reservations', () => {
    const e = arena(), a = put(e, 'rook', { x: 0, z: 0 })
    put(e, 'pawn', { x: 0, z: 2 }); put(e, 'go', { x: 2, z: 0 }, 1)
    expect(e.legal(a).map(m => m.cell)).toEqual([{ x: 1, z: 0 }, { x: 0, z: 1 }])
    e.reservations.add(e.key({ x: 1, z: 0 })); expect(e.legal(a)).toHaveLength(1)
  })
  it('gives pawns a home double-step and diagonal captures without wrapping', () => {
    const e = arena(), a = put(e, 'pawn', { x: 2, z: 1 }), enemy = put(e, 'pawn', { x: 3, z: 2 }, 1)
    const moves = e.legal(a); expect(moves).toHaveLength(3); expect(moves.find(m => m.victim)?.victim).toBe(enemy)
    e.move(a, { cell: { x: 2, z: 3 } }); e.advance(0.4)
    expect(e.legal(a).some(m => m.cell.z === 5)).toBe(false)
  })
  it('lets cross-game allies capture but protects same-game allies', () => {
    const e = arena(), a = put(e, 'rook', { x: 0, z: 0 }), b = put(e, 'checker', { x: 2, z: 0 }), c = put(e, 'pawn', { x: 0, z: 2 })
    expect(e.canCapture(a, b)).toBe(true); expect(e.canCapture(a, c)).toBe(false)
  })
  it('requires checker jumps, chains them and crowns on the opposite edge', () => {
    const e = arena(), a = put(e, 'checker', { x: 3, z: 2 }, 0, 0)
    put(e, 'pawn', { x: 4, z: 3 }, 1); put(e, 'pawn', { x: 6, z: 3 }, 1)
    expect(e.legal(a)).toHaveLength(1); expect(e.legal(a)[0].jump).toBe(true)
    e.move(a, e.legal(a)[0]); e.advance(0.4); a.next = Infinity
    expect(e.legal(a)).toHaveLength(1); e.move(a, e.legal(a)[0]); e.advance(0.4)
    expect(a.cell.x).toBe(7); expect(a.crowned).toBe(true)
  })
  it('knights jump blockers while kings move only one square', () => {
    const e = arena(), knight = put(e, 'knight', { x: 0, z: 0 }); put(e, 'pawn', { x: 0, z: 1 }); put(e, 'pawn', { x: 1, z: 0 })
    expect(e.legal(knight)).toHaveLength(2)
    const king = put(e, 'king', { x: 6, z: 6 }); expect(e.legal(king)).toHaveLength(8)
  })
})

describe('mine chains and ship emplacements', () => {
  it('snapshots chain-blast victims and protects ships and settled Go', () => {
    const e = arena(), a = put(e, 'pawn', { x: 3, z: 3 }), ship = put(e, 'ship', { x: 4, z: 3 }, 0, 1), stone = put(e, 'go', { x: 2, z: 3 })
    e.mines.add(e.key({ x: 3, z: 3 })); e.mines.add(e.key({ x: 3, z: 4 })); e.detonate({ x: 3, z: 3 })
    expect(a.deaths).toBe(1); expect(e.mines.size).toBe(0); expect(ship.hull).toBe(7); expect(stone.active).toBe(true); expect(e.validate()).toBe(true)
  })
  it('blocks all three hull cells and rebuilds eight seconds after three distinct hits', () => {
    const e = arena(), ship = put(e, 'ship', { x: 2, z: 2 }, 0, 0)
    expect(e.occupancy.size).toBe(3)
    e.hit({ x: 2, z: 2 }); e.hit({ x: 2, z: 2 }); expect(ship.hull).toBe(6)
    e.hit({ x: 3, z: 2 }); e.hit({ x: 4, z: 2 }); expect(ship.hull).toBe(0); expect(e.occupancy.size).toBe(3)
    e.advance(7.9); expect(ship.hull).toBe(0); e.advance(0.2); expect(ship.hull).toBe(7)
  })
  it('missiles hit their marked square, allowing moving targets to escape', () => {
    const e = arena(), owner = put(e, 'ship', { x: 0, z: 0 }), target = put(e, 'rook', { x: 5, z: 5 }, 1)
    e.missiles.push({ id: 100, owner: owner.id, life: owner.life, from: owner.cell, to: { ...target.cell }, born: 0, duration: 1.4 })
    e.move(target, { cell: { x: 5, z: 6 } }); e.advance(1.5); expect(target.deaths).toBe(0); expect(e.missiles).toHaveLength(0)
  })
  it('cancels airborne missiles when ships are disabled', () => {
    const e = new Engine('realism', 8, { ...DEFAULT_FLAGS, ships: true }); const ship = e.actors.find(a => a.kind === 'ship')!; e.fire(ship)
    expect(e.missiles.length).toBeGreaterThan(0); e.toggle('ships'); expect(e.missiles).toHaveLength(0)
    expect(e.validate()).toBe(true)
  })
})

describe('Go reservations and surrounding', () => {
  it('reserves empty drop cells, preserves liberties until landing and cancels on disable', () => {
    const e = arena(); e.toggle('go'); e.scheduleDrop(); const drop = e.drops[0]
    expect(e.empty(drop.cell)).toBe(false); expect(e.at(drop.cell)).toBeUndefined()
    const stone = put(e, 'go', { x: 0, z: 0 }); e.reservations.add(e.key({ x: 0, z: 1 })); expect(e.group(stone).liberty).toBe(true)
    e.toggle('go'); expect(e.reservations.size).toBe(0); expect(e.drops).toHaveLength(0)
  })
  it('removes opponents first so a capturing placement gains liberties', () => {
    const e = arena(), black = put(e, 'go', { x: 0, z: 0 }), white = put(e, 'go', { x: 1, z: 0 }, 1)
    put(e, 'go', { x: 0, z: 1 }, 1); put(e, 'rook', { x: 2, z: 0 }); put(e, 'rook', { x: 1, z: 1 })
    e.resolveGo(black); expect(white.active).toBe(false); expect(black.active).toBe(true)
  })
  it('surrounds mobile tokens but stones resist direct captures and missiles', () => {
    const e = arena(), token = put(e, 'rook', { x: 3, z: 3 }, 1)
    const stones = [{ x: 2, z: 3 }, { x: 4, z: 3 }, { x: 3, z: 2 }, { x: 3, z: 4 }].map(c => put(e, 'go', c))
    e.capture(stones[0], token); e.hit(stones[1].cell, token); expect(stones.every(a => a.active)).toBe(true)
    e.resolveGo(stones[3]); expect(token.deaths).toBe(1); expect(e.validate()).toBe(true)
  })
  it('rechecks Go liberties when a mobile piece lands', () => {
    const e = arena(); e.flags.go = true
    const stone = put(e, 'go', { x: 0, z: 0 }), rook = put(e, 'rook', { x: 0, z: 2 }, 1)
    put(e, 'pawn', { x: 1, z: 0 }); e.move(rook, { cell: { x: 0, z: 1 } }); e.advance(0.4)
    expect(stone.active).toBe(false); expect(e.validate()).toBe(true)
  })
})

describe('all mode combinations', () => {
  for (let bits = 0; bits < 32; bits++) it(`maintains unique occupancy with game flags ${bits.toString(2).padStart(5, '0')}`, () => {
    const flags = Object.fromEntries(GAMES.map((g, i) => [g, !!(bits & 1 << i)])) as Flags
    const e = new Engine('realism', 8, flags, bits + 900)
    for (let second = 0; second < 30; second++) { e.advance(1); expect(e.validate()).toBe(true) }
    for (const g of GAMES) { e.toggle(g); expect(e.validate()).toBe(true) }
  })
  it('supports odd sizes, large boards and reproducible seeded battles', () => {
    for (const size of [9, 16, 128]) {
      const a = new Engine('realism', size, { ...DEFAULT_FLAGS, go: true }, 5678), b = new Engine('realism', size, { ...DEFAULT_FLAGS, go: true }, 5678)
      a.advance(20); b.advance(20); expect(a.validate()).toBe(true); expect(a.actors).toEqual(b.actors)
    }
  })
})
