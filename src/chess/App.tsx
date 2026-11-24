import { Component, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useGame } from './game/store'
import { ChessPoster } from './Poster'
import World from './render/World'
import './style.css'

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

export default function App({ active, onReady }: { active: boolean; onReady: () => void }) {
  const engine = useGame(state => state.engine)
  const reset = useGame(state => state.reset)
  const [readyInstance, setReadyInstance] = useState<number | null>(null)
  const onWorldReady = useCallback(() => {
    setReadyInstance(engine.instanceId)
    onReady()
  }, [engine.instanceId, onReady])
  const ready = readyInstance === engine.instanceId
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (document.hidden || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      if (event.code === 'Space' || event.key === 'Escape' || event.key.toLowerCase() === 'r') {
        event.preventDefault()
        reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, reset])
  return <>
    <h1 className="sr-only">Chess Sim</h1>
    <div aria-hidden="true" className="chess-simulation" data-ready={ready} data-board-size={engine.size} data-games={Object.entries(engine.flags).filter(([, enabled]) => enabled).map(([game]) => game).join(',')}>
      {!ready && <ChessPoster />}
      <div className="chess-world" style={{ visibility: ready && active ? 'inherit' : 'hidden' }}>
        <RenderBoundary><World active={active} onReady={onWorldReady} /></RenderBoundary>
      </div>
    </div>
  </>
}
