import { createRoot } from 'react-dom/client'
import { App } from './App'
import { hasBridge, NoBridge } from './NoBridge'
import './styles/index.css'
// the pre-redesign styles: unlayered, so they win over Tailwind's layers until each screen is rebuilt (DESIGN.md §9)
import './styles.css'

createRoot(document.getElementById('root')!).render(hasBridge() ? <App /> : <NoBridge />)
