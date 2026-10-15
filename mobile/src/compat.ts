import 'core-js/actual/array/at'
import 'core-js/actual/object/has-own'
import 'core-js/actual/string/replace-all'
import { v4 } from 'uuid'

if (globalThis.crypto && !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => v4(), configurable: true })
}
