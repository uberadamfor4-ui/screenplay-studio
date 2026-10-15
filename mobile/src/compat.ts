import 'core-js/stable'
import { v4 } from 'uuid'

if (globalThis.crypto && !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => v4(), configurable: true })
}
