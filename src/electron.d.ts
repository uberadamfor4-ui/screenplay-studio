import type { DesktopApi } from './types'

declare global {
  interface Window {
    screenplay?: DesktopApi
  }
}

export {}
