/// <reference types="vite/client" />
import type { QuickShotApi } from '../../preload'

declare global {
  interface Window {
    api: QuickShotApi
  }
}

export {}
