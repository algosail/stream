import queueMicrotask from 'bare-queue-microtask'
import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from 'bare-timers'

export const env = {
  queueMicrotask,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
}
