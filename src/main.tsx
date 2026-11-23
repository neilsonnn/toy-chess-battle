import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ChessPoster } from './chess/Poster'

const Chess = lazy(() => import('./chess/App'))
const onReady = () => {}
const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
if (import.meta.hot) import.meta.hot.data.root = root
root.render(
  <StrictMode>
    <Suspense fallback={<ChessPoster />}>
      <Chess active onReady={onReady} />
    </Suspense>
  </StrictMode>,
)
