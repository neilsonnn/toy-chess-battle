import { add, same, CARDINAL, DIAGONAL, DEFAULT_FLAGS, gameOf } from './types'
import type { Actor, Blast, CaptureEvent, Cell, Corpse, Drop, Flags, Game, Kind, Missile, Mode, Move } from './types'
export const CORPSE_LIFETIME = 12
export const MAX_CORPSES = 160
function retain<T>(array: T[], keep: (item: T) => boolean) { let write = 0; for (let read = 0; read < array.length; read++) if (keep(array[read])) array[write++] = array[read]; array.length = write }

// Rules are independent of rendering and physics. Grid occupancy stays authoritative;
// living bodies follow these trajectories while captured bodies become dynamic.
export class Engine {
  static nextId = 0
  readonly instanceId = ++Engine.nextId
  size: number
  mode: Mode
  flags: Flags
  actors: Actor[] = []
  occupancy = new Map<number, Actor>()
  reservations = new Set<number>()
  mines = new Set<number>()
  clues = new Map<number, number>()
  corpses: Corpse[] = []
  missiles: Missile[] = []
  drops: Drop[] = []
  blasts: Blast[] = []
  captures: CaptureEvent[] = []
  clock = 0
  paused = false
  totalCaptures = 0
  round = 1
  version = 0
  generation = 0
  private seed: number
  private serial = 0
  private nextMine = 6
  private nextDrop = 2
  private goColor = 0

  constructor(mode: Mode = 'realism', size = mode === 'realism2x' ? 16 : 8, flags = DEFAULT_FLAGS, seed = Date.now()) {
    this.mode = mode; this.size = size; this.flags = { ...flags }; this.seed = seed >>> 0 || 1
    this.reset()
  }
  random() {
    this.seed += 0x6D2B79F5
    let t = this.seed
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  key(c: Cell) { return c.z * this.size + c.x }
  cell(k: number): Cell { return { x: k % this.size, z: Math.floor(k / this.size) } }
  inside(c: Cell) { return c.x >= 0 && c.z >= 0 && c.x < this.size && c.z < this.size }
  at(c: Cell) { return this.inside(c) ? this.occupancy.get(this.key(c)) : undefined }
  empty(c: Cell) { return this.inside(c) && !this.at(c) && !this.reservations.has(this.key(c)) }
  footprint(a: Actor, c = a.cell) { return a.kind === 'ship' ? [c, add(c, CARDINAL[a.dir]), add(c, CARDINAL[a.dir], 2)] : [c] }
  occupy(a: Actor) { for (const c of this.footprint(a)) this.occupancy.set(this.key(c), a) }
  release(a: Actor) { for (const c of this.footprint(a)) { const key = this.key(c); if (this.occupancy.get(key) === a) this.occupancy.delete(key) } }
  touch() { this.version++ }

  reset() {
    this.actors = []; this.occupancy.clear(); this.reservations.clear(); this.mines.clear(); this.clues.clear()
    this.corpses = []; this.missiles = []; this.drops = []; this.blasts = []; this.captures = []
    this.clock = 0; this.totalCaptures = 0; this.nextMine = 6; this.nextDrop = 2; this.goColor = 0
    this.serial = 0; this.generation++; this.touch()
    for (const g of ['chess', 'checkers', 'ships', 'go'] as Game[]) if (this.flags[g]) this.populate(g)
    if (this.flags.mines) this.seedMines(4)
    for (const actor of this.actors) {
      if (actor.active && gameOf(actor.kind) === 'chess') actor.next = 0
    }
  }
  make(kind: Kind, side: number, cell: Cell, dir: number, active = true): Actor {
    const a: Actor = { id: ++this.serial, kind, originalKind: kind, side, cell: { ...cell }, home: { ...cell }, from: { ...cell }, dir,
      active: false, waiting: false, life: 0, kills: 0, deaths: 0, crowned: false, chain: false, started: -10, next: 0, moving: false, jumping: false, hull: 7 }
    this.actors.push(a)
    if (active) this.respawn(a)
    return a
  }
  populate(game: Game) {
    const n = this.size, start = (n - 8) / 2, checkStart = (n - 4) / 2
    if (game === 'chess') {
      const row: Kind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']
      for (let side = 0; side < 2; side++) for (let x = 0; x < 8; x++) {
        this.make(row[x], side, { x: Math.floor(start) + x, z: side ? n - 1 : 0 }, side ? 3 : 1)
        this.make('pawn', side, { x: Math.floor(start) + x, z: side ? n - 2 : 1 }, side ? 3 : 1)
      }
    }
    if (game === 'checkers') for (let side = 0; side < 2; side++) for (let d = 0; d < 3; d++) for (let z = 0; z < 4; z++) {
      const c = { x: side ? n - 1 - d : d, z: Math.floor(checkStart) + z }
      if ((c.x + c.z) % 2 === 0) this.make('checker', side, c, side ? 2 : 0)
    }
    if (game === 'ships') for (let side = 0; side < 2; side++) {
      const candidates: { cell: Cell; dir: number }[] = []
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) for (let dir = 0; dir < 4; dir++) {
        const c = { x, z }
        if ([c, add(c, CARDINAL[dir]), add(c, CARDINAL[dir], 2)].every(p => this.empty(p) && !this.mines.has(this.key(p)))) candidates.push({ cell: c, dir })
      }
      if (candidates.length) { const c = candidates[Math.floor(this.random() * candidates.length)]; this.make('ship', side, c.cell, c.dir) }
    }
    if (game === 'go') for (let i = 0; i < 8; i++) this.make('go', i % 2, { x: 0, z: 0 }, i % 2, false)
    this.touch()
  }
  toggle(game: Game) {
    this.flags[game] = !this.flags[game]
    if (this.flags[game]) {
      if (game === 'mines') this.seedMines(4)
      else this.populate(game)
      if (game === 'go') this.nextDrop = this.clock + 0.35
    } else {
      if (game === 'mines') { this.mines.clear(); this.clues.clear() }
      else { for (const a of this.actors.filter(a => gameOf(a.kind) === game)) this.release(a); this.actors = this.actors.filter(a => gameOf(a.kind) !== game) }
      if (game === 'ships') this.missiles = []
      if (game === 'go') { this.drops = []; this.reservations.clear() }
      this.corpses = this.corpses.filter(c => gameOf(c.kind) !== game)
    }
    this.touch()
  }
  respawn(a: Actor) {
    a.kind = a.originalKind
    const can = (c: Cell) => this.footprint(a, c).every(p => this.empty(p) && !this.mines.has(this.key(p)))
    const candidates: Cell[] = []
    if (can(a.home)) candidates.push(a.home)
    const checker = a.kind === 'checker'
    const zStart = checker ? Math.floor((this.size - 4) / 2) : a.side ? this.size - 2 : 0
    const zEnd = checker ? zStart + 4 : zStart + 2
    const xStart = checker && a.side ? this.size - 3 : 0, xEnd = checker ? xStart + 3 : this.size
    if (!candidates.length && a.kind !== 'ship') for (let z = zStart; z < zEnd; z++) for (let x = xStart; x < xEnd; x++) {
      const c = { x, z }
      const ownSide = a.kind === 'checker'
        ? (a.side ? x >= this.size - 3 : x < 3) && z >= Math.floor((this.size - 4) / 2) && z < Math.floor((this.size - 4) / 2) + 4 && (x + z) % 2 === 0
        : a.side ? z >= this.size - 2 : z < 2
      if (ownSide && can(c) && !same(c, a.home)) candidates.push(c)
    }
    if (!candidates.length) { a.active = false; a.waiting = true; a.next = this.clock + 1; return }
    const c = candidates[0] === a.home ? a.home : candidates[Math.floor(this.random() * candidates.length)]
    a.cell = { ...c }; a.from = { ...c }; a.active = true; a.waiting = false; a.life++; a.crowned = false; a.chain = false; a.moving = false; a.hull = 7
    a.next = this.clock + (a.kind === 'ship' ? 2 : 0.3) + this.random() * 0.7
    this.occupy(a)
  }
  canCapture(a: Actor, b: Actor) { return a !== b && b.active && b.kind !== 'ship' && b.kind !== 'go' && !(gameOf(a.kind) === gameOf(b.kind) && a.side === b.side) }
  legal(a: Actor): Move[] {
    if (!a.active || a.kind === 'ship' || a.kind === 'go') return []
    const result: Move[] = []
    const step = (c: Cell) => {
      if (!this.inside(c) || this.reservations.has(this.key(c))) return
      const victim = this.at(c)
      if (!victim || this.canCapture(a, victim)) result.push({ cell: c, victim })
    }
    if (a.kind === 'pawn') {
      const d = CARDINAL[a.dir], forward = add(a.cell, d)
      if (this.empty(forward)) {
        result.push({ cell: forward })
        const twice = add(a.cell, d, 2)
        if (same(a.cell, a.home) && this.empty(twice)) result.push({ cell: twice })
      }
      for (const sign of [-1, 1]) {
        const c = add(forward, { x: d.z * sign, z: -d.x * sign }), b = this.at(c)
        if (b && this.canCapture(a, b) && !this.reservations.has(this.key(c))) result.push({ cell: c, victim: b })
      }
    } else if (a.kind === 'checker') {
      const dirs = DIAGONAL.filter(d => a.crowned || (a.dir === 0 ? d.x > 0 : d.x < 0))
      for (const d of dirs) {
        const b = this.at(add(a.cell, d)), end = add(a.cell, d, 2)
        if (b && this.canCapture(a, b) && this.empty(end)) result.push({ cell: end, victim: b, jump: true })
      }
      if (!result.length && !a.chain) for (const d of dirs) if (this.empty(add(a.cell, d))) result.push({ cell: add(a.cell, d) })
    } else if (a.kind === 'knight') {
      for (const [x, z] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) step(add(a.cell, { x, z }))
    } else if (a.kind === 'king') { for (const d of [...CARDINAL, ...DIAGONAL]) step(add(a.cell, d)) }
    else {
      const dirs = a.kind === 'rook' ? CARDINAL : a.kind === 'bishop' ? DIAGONAL : [...CARDINAL, ...DIAGONAL]
      for (const d of dirs) for (let n = 1; n < this.size; n++) {
        const c = add(a.cell, d, n)
        if (!this.inside(c) || this.reservations.has(this.key(c))) break
        const b = this.at(c)
        if (!b) result.push({ cell: c })
        else { if (this.canCapture(a, b)) result.push({ cell: c, victim: b }); break }
      }
    }
    return result
  }
  move(a: Actor, move: Move) {
    const legal = this.legal(a).find(m => same(m.cell, move.cell))
    if (!a.active || a.moving || !legal) return false
    return this.commitMove(a, legal)
  }
  private commitMove(a: Actor, move: Move) {
    a.from = { ...a.cell }; this.release(a)
    this.reservations.add(this.key(move.cell))
    if (move.victim) this.capture(move.victim, a)
    this.reservations.delete(this.key(move.cell))
    a.cell = { ...move.cell }; a.started = this.clock; a.moving = true; a.jumping = !!move.jump || a.kind === 'knight'; a.chain = !!move.jump
    a.next = this.clock + 0.42 + this.random() * 0.08; this.occupy(a)
    return true
  }
  position(a: Actor): [number, number, number]
  position(a: Actor, out: { x: number; y: number; z: number }): { x: number; y: number; z: number }
  position(a: Actor, out?: { x: number; y: number; z: number }): [number, number, number] | { x: number; y: number; z: number } {
    const t = a.moving ? Math.min(1, (this.clock - a.started) / 0.38) : 1
    const s = t * t * (3 - 2 * t)
    const x = a.from.x + (a.cell.x - a.from.x) * s, y = a.moving && a.jumping ? Math.sin(t * Math.PI) * 0.8 : 0, z = a.from.z + (a.cell.z - a.from.z) * s
    if (out) { out.x = x; out.y = y; out.z = z; return out }
    return [x, y, z]
  }
  capture(victim: Actor, killer?: Actor, surrounded = false) {
    if (!victim.active || victim.kind === 'ship' || (victim.kind === 'go' && !surrounded)) return
    const p = this.position(victim), dt = 0.38, t = victim.moving ? Math.min(1, (this.clock - victim.started) / dt) : 1
    const speed = victim.moving ? 6 * t * (1 - t) / dt : 0
    let vx = (victim.cell.x - victim.from.x) * speed, vz = (victim.cell.z - victim.from.z) * speed
    if (killer) {
      const dx = victim.cell.x - killer.cell.x, dz = victim.cell.z - killer.cell.z, length = Math.hypot(dx, dz) || 1
      vx += dx / length * 3; vz += dz / length * 3; killer.kills++
    }
    const vy = victim.moving && victim.jumping ? Math.cos(t * Math.PI) * Math.PI / dt * 0.8 : 0
    this.corpses.push({ id: ++this.serial, kind: victim.kind, side: victim.side, crowned: victim.crowned, cell: { x: p[0], z: p[2] }, height: p[1], dir: victim.dir, born: this.clock, velocity: [vx, vy + 2.5, vz] })
    if (this.corpses.length > MAX_CORPSES) this.corpses.shift()
    this.blasts.push({ id: ++this.serial, cell: { ...victim.cell }, born: this.clock, large: false })
    this.release(victim); victim.active = false; victim.moving = false; victim.deaths++; this.totalCaptures++
    this.captures.push({ victim: victim.id, killer: killer?.id, clock: this.clock, position: p }); if (this.captures.length > 100) this.captures.shift()
    if (victim.kind !== 'go' && this.mode !== 'elimination') this.respawn(victim)
    this.touch()
  }
  decide(a: Actor) {
    const moves = this.legal(a)
    if (!moves.length) { a.chain = false; a.next = this.clock + 0.25; return }
    let best = moves[0], bestScore = -Infinity
    for (const move of moves) {
      let nearest = this.size ** 2 * 2
      if (!move.victim) for (const b of this.actors) if (this.canCapture(a, b)) nearest = Math.min(nearest, (move.cell.x - b.cell.x) ** 2 + (move.cell.z - b.cell.z) ** 2)
      const score = move.victim ? 10000 + this.random() * 100 : -Math.sqrt(nearest) + this.random() * 1.6
      if (score > bestScore) { bestScore = score; best = move }
    }
    const selected = !best.victim && this.random() < 0.08 ? moves[Math.floor(this.random() * moves.length)] : best
    this.commitMove(a, selected)
  }
  seedMines(count: number) {
    for (let attempt = 0; count > 0 && attempt < this.size ** 2 * 2; attempt++) {
      const c = { x: Math.floor(this.random() * this.size), z: Math.floor(this.random() * this.size) }, k = this.key(c)
      if (this.empty(c) && !this.mines.has(k)) { this.mines.add(k); count-- }
    }
    this.clues.clear(); this.touch()
  }
  reveal(c: Cell) {
    let count = 0
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) if ((x || z) && this.inside(add(c, { x, z })) && this.mines.has(this.key(add(c, { x, z })))) count++
    if (count && this.clues.get(this.key(c)) !== count) { this.clues.set(this.key(c), count); this.touch() }
    if (this.clues.size > 128) this.clues.delete(this.clues.keys().next().value!)
  }
  detonate(c: Cell, killer?: Actor) {
    if (!this.mines.has(this.key(c))) return
    const queue = [c], affected = new Set<number>(), victims = new Set<Actor>()
    while (queue.length) {
      const mine = queue.shift()!; const key = this.key(mine)
      if (!this.mines.delete(key)) continue
      this.blasts.push({ id: ++this.serial, cell: mine, born: this.clock, large: true })
      for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
        const p = add(mine, { x, z }); if (!this.inside(p)) continue
        const k = this.key(p); affected.add(k); if (this.mines.has(k)) queue.push(p)
      }
    }
    // Snapshot before any respawn: a fresh life cannot be hit twice by a chain.
    for (const k of affected) { const a = this.occupancy.get(k); if (a) victims.add(a) }
    for (const a of victims) this.capture(a, killer)
    this.clues.clear(); this.touch()
  }
  fire(a: Actor) {
    const live = this.actors.filter(b => b.active && b !== a && (b.kind !== 'ship' || b.hull))
    const ships = live.filter(b => b.kind === 'ship'), targets = ships.length && this.random() > 0.3 ? ships : live
    if (targets.length) {
      const target = targets[Math.floor(this.random() * targets.length)]
      let to = { ...target.cell }
      if (target.kind === 'ship') {
        const intact = [0, 1, 2].filter(i => target.hull & 1 << i)
        to = add(target.cell, CARDINAL[target.dir], intact[Math.floor(this.random() * intact.length)])
      }
      if (this.random() < 0.3) to = { x: Math.max(0, Math.min(this.size - 1, to.x + Math.floor(this.random() * 5) - 2)), z: Math.max(0, Math.min(this.size - 1, to.z + Math.floor(this.random() * 5) - 2)) }
      this.missiles.push({ id: ++this.serial, owner: a.id, life: a.life, from: add(a.cell, CARDINAL[a.dir]), to, born: this.clock, duration: 1.4 + this.random() * 0.7 }); this.touch()
    }
    a.next = this.clock + 3 + this.random() * 3
  }
  hit(c: Cell, killer?: Actor) {
    const previous = this.at(c), previousLife = previous?.life
    if (this.mines.has(this.key(c))) this.detonate(c, killer)
    const a = this.at(c)
    if (a && (a !== previous || a.life !== previousLife)) return
    if (a?.kind === 'ship') {
      const i = this.footprint(a).findIndex(p => same(p, c)), bit = 1 << i
      if (a.hull & bit) {
        a.hull &= ~bit; this.touch()
        if (!a.hull) { a.deaths++; a.life++; this.totalCaptures++; if (killer) killer.kills++; a.next = this.mode === 'elimination' ? Infinity : this.clock + 8 }
      }
    } else if (a) this.capture(a, killer)
    this.blasts.push({ id: ++this.serial, cell: { ...c }, born: this.clock, large: true }); this.touch()
  }
  scheduleDrop() {
    let a = this.actors.find(a => a.kind === 'go' && !a.active && !this.drops.some(d => d.actor === a))
    if (!a && this.actors.filter(a => a.kind === 'go').length < Math.min(512, this.size ** 2)) a = this.make('go', 0, { x: 0, z: 0 }, 0, false)
    if (!a) return
    const live = this.actors.filter(a => a.active)
    for (let attempt = 0; attempt < 200; attempt++) {
      let c = { x: Math.floor(this.random() * this.size), z: Math.floor(this.random() * this.size) }
      if (live.length && this.random() < 0.75) { const b = live[Math.floor(this.random() * live.length)]; c = add(b.cell, { x: Math.floor(this.random() * 5) - 2, z: Math.floor(this.random() * 5) - 2 }) }
      if (!this.empty(c)) continue
      a.side = this.goColor; a.dir = this.goColor; this.goColor = 1 - this.goColor
      this.reservations.add(this.key(c)); this.drops.push({ actor: a, cell: c, born: this.clock }); this.touch(); return
    }
  }
  group(start: Actor) {
    const group = new Set<Actor>(), queue = [start]; let liberty = false
    while (queue.length) {
      const a = queue.pop()!; if (group.has(a)) continue; group.add(a)
      for (const d of CARDINAL) {
        const c = add(a.cell, d); if (!this.inside(c)) continue
        const b = this.at(c)
        if (!b) liberty = true // Reservations stay liberties until impact.
        else if (b.kind === 'go' && b.side === start.side && !group.has(b)) queue.push(b)
      }
    }
    return { group, liberty }
  }
  resolveGo(placed?: Actor) {
    const seen = new Set<Actor>()
    for (const side of placed ? [1 - placed.side, placed.side] : [0, 1]) for (const a of this.actors) {
      if (!a.active || a.kind !== 'go' || a.side !== side || seen.has(a)) continue
      const result = this.group(a); for (const b of result.group) seen.add(b)
      if (!result.liberty) {
        const enemy = [...result.group].flatMap(b => CARDINAL.map(d => this.at(add(b.cell, d)))).find(b => b?.kind === 'go' && b.side !== a.side)
        const killer = placed && !result.group.has(placed) ? placed : enemy
        for (const b of result.group) this.capture(b, killer, true)
      }
    }
    for (const a of this.actors) {
      if (!a.active || a.kind === 'ship' || a.kind === 'go') continue
      const neighbors = CARDINAL.map(d => add(a.cell, d)).filter(c => this.inside(c)).map(c => this.at(c))
      if (neighbors.length && neighbors.every(b => b?.kind === 'go' && b.side === neighbors[0]?.side)) this.capture(a, neighbors[0])
    }
  }
  advance(realDelta: number) {
    if (this.paused || realDelta <= 0) return
    // Independent decisions remain stable through slow frames/background throttling.
    for (let remaining = Math.min(realDelta, 30); remaining > 1e-8;) { const dt = Math.min(0.025, remaining); this.step(dt); remaining -= dt }
  }
  step(dt: number) {
    this.clock += dt
    if (this.mode === 'elimination' && this.clock >= 15) { this.round++; this.reset(); return }
    for (const a of this.actors) {
      if (a.waiting && this.clock >= a.next) { this.respawn(a); this.touch() }
      if (!a.active || a.kind === 'go') continue
      if (a.moving && this.clock - a.started >= 0.38) {
        a.moving = false
        if (a.kind === 'checker' && (a.dir === 0 ? a.cell.x === this.size - 1 : a.cell.x === 0)) { a.crowned = true; this.touch() }
        if (a.kind === 'pawn' && this.mode === 'elimination' && (a.side ? a.cell.z === 0 : a.cell.z === this.size - 1)) { a.kind = 'queen'; this.touch() }
        if (this.mines.has(this.key(a.cell))) { this.detonate(a.cell); continue }
        this.reveal(a.cell)
        if (a.chain && !this.legal(a).length) a.chain = false
        if (this.flags.go) this.resolveGo()
      }
      if (!a.moving && this.clock >= a.next) {
        if (a.kind === 'ship') { if (!a.hull) { a.hull = 7; a.next = this.clock + 2; this.touch() } else this.fire(a) }
        else this.decide(a)
      }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) { const m = this.missiles[i]; if (this.clock - m.born >= m.duration) {
      this.missiles.splice(i, 1)
      const owner = this.actors.find(a => a.id === m.owner && a.life === m.life && a.active)
      this.hit(m.to, owner)
    } }
    for (let i = this.drops.length - 1; i >= 0; i--) { const d = this.drops[i]; if (this.clock - d.born >= 0.22) {
      this.drops.splice(i, 1); this.reservations.delete(this.key(d.cell))
      if (!this.at(d.cell)) {
        const a = d.actor; a.cell = { ...d.cell }; a.from = { ...d.cell }; a.active = true; a.life++; this.occupy(a)
        if (this.mines.has(this.key(a.cell))) this.detonate(a.cell)
        this.reveal(a.cell); this.resolveGo(a)
      }
      this.touch()
    } }
    if (this.flags.go && this.clock >= this.nextDrop) { this.nextDrop = this.clock + 0.35; this.scheduleDrop() }
    if (this.flags.mines && this.clock >= this.nextMine) { this.nextMine = this.clock + 6; if (this.mines.size < 4) this.seedMines(1) }
    if (this.corpses.some(c => this.clock - c.born > CORPSE_LIFETIME) || this.blasts.some(b => this.clock - b.born > 0.6)) {
      retain(this.corpses, c => this.clock - c.born <= CORPSE_LIFETIME); retain(this.blasts, b => this.clock - b.born <= 0.6); this.touch()
    }
  }
  validate() {
    const keys = new Set<number>()
    for (const a of this.actors.filter(a => a.active)) for (const c of this.footprint(a)) {
      const key = this.key(c)
      if (!this.inside(c) || keys.has(key) || this.occupancy.get(key) !== a || this.reservations.has(key)) throw new Error(`Invalid occupancy for actor ${a.id} at ${key}`)
      keys.add(key)
    }
    if (keys.size !== this.occupancy.size) throw new Error('Stale occupancy')
    return true
  }
}
