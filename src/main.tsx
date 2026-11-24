import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Chess from './chess/App'

const onReady = () => {}
const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
if (import.meta.hot) import.meta.hot.data.root = root
root.render(
  <StrictMode>
    <Chess active onReady={onReady} />
  </StrictMode>,
)
