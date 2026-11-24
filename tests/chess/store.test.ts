import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resumeClock, tick, useGame } from '../../src/chess/game/store'

let wallTime = 0
function advance(seconds: number) { wallTime += seconds * 1000; tick() }

beforeEach(() => {
  wallTime = 0
  vi.spyOn(performance, 'now').mockImplementation(() => wallTime)
  useGame.getState().reset()
})
afterEach(() => vi.restoreAllMocks())

it('starts as soon as rendering is ready and continues past a minute without resetting', () => {
  const engine = useGame.getState().engine, generation = engine.generation
  // Loading the renderer must not advance the simulation.
  wallTime += 10_000
  resumeClock()
  expect(engine.clock).toBe(0)
  advance(1 / 60)
  expect(engine.clock).toBeCloseTo(1 / 60)
  expect(engine.actors.some(actor => actor.moving)).toBe(true)
  for (let second = 0; second < 60; second++) advance(1)
  expect(engine.generation).toBe(generation)
  expect(engine.clock).toBeCloseTo(60 + 1 / 60)
  expect(useGame.getState().engine).toBe(engine)
})

it('excludes hidden time and manual resets clear captures without adding a starting pause', () => {
  const engine = useGame.getState().engine, generation = engine.generation
  advance(10)
  const clock = engine.clock
  wallTime += 60_000
  resumeClock()
  advance(4)
  expect(engine.clock).toBeCloseTo(clock + 4)
  expect(engine.generation).toBe(generation)
  engine.capture(engine.actors[0])
  expect(engine.corpses.length).toBeGreaterThan(0)
  useGame.getState().reset()
  expect(engine.corpses).toHaveLength(0)
  expect(engine.totalCaptures).toBe(0)
  expect(engine.occupancy.size).toBe(32)
  expect(engine.validate()).toBe(true)
  advance(1 / 60)
  expect(engine.actors.some(actor => actor.moving)).toBe(true)
  advance(14 - 1 / 60)
  expect(engine.generation).toBe(generation + 1)
  advance(1)
  expect(engine.generation).toBe(generation + 1)
  expect(engine.clock).toBeCloseTo(15)
})
