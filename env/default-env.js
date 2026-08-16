export const env = {
  queueMicrotask: (...a) => globalThis.queueMicrotask (...a),
  setTimeout: (...a) => globalThis.setTimeout (...a),
  clearTimeout: (...a) => globalThis.clearTimeout (...a),
  setInterval: (...a) => globalThis.setInterval (...a),
  clearInterval: (...a) => globalThis.clearInterval (...a),
}
