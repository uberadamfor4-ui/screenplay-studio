import { createRoot } from 'react-dom/client'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/400-italic.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/courier-prime/700-italic.css'
import MobileApp from './MobileApp'
import '../../src/fonts.css'
import './mobile.css'

createRoot(document.getElementById('root')!).render(<MobileApp />)
import './compat'
