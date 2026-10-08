import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/index.css'
// the pre-redesign styles: unlayered, so they win over Tailwind's layers until each screen is rebuilt (DESIGN.md §9)
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
