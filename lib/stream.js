import * as F from '@algosail/sail/fn'
import * as M from '@algosail/sail/maybe'
import * as E from '@algosail/sail/either'
import * as A from '@algosail/sail/array'
import * as P from '@algosail/sail/pair'

import { env } from '#env'

/**
 * True when the value is a Stream object.
 * @example
 * // isStream :: unknown -> Boolean
 * isStream (wrap (1)) // => true
 */
export function isStream (value) {
  return Boolean (value?.tag === 'stream')
}

/**
 * True when the value has both 'event' and 'end' properties.
 * @example
 * // isSink :: unknown -> Boolean
 * isSink (sink (x => x, () => {})) // => true
 */
export function isSink (value) {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    'event' in value &&
    'end' in value
  )
}

/**
 * True when the value has a Symbol.dispose method.
 * @example
 * // isDisposable :: unknown -> Boolean
 * isDisposable (disposeNone ()) // => true
 */
export function isDisposable (value) {
  return (
    value !== null && value !== undefined && typeof value === 'object' && Symbol.dispose in value
  )
}

/**
 * Low-level stream constructor — takes a subscription function.
 * @example
 * // stream :: (Sink a -> Disposable) -> Stream a
 * stream (snk => { snk.event(1); snk.end(); return disposeNone () })
 */
export function stream (run) {
  return { tag: 'stream', run }
}

/**
 * Creates a sink with an event handler and an end handler.
 * @example
 * // sink :: (a -> void) -> (reason -> void) -> Sink a
 * sink (console.log, () => console.log ('done'))
 */
export function sink (event, end) {
  return { event, end }
}

/**
 * Wraps a cleanup function into a Disposable.
 * @example
 * // disposable :: (() -> void) -> Disposable
 * disposable (() => clearTimeout (handle))
 */
export function disposable (dispose) {
  return { [Symbol.dispose]: dispose }
}

/**
 * Returns a no-op Disposable (useful as a placeholder).
 * @example
 * // disposeNone :: () -> Disposable
 * dispose (disposeNone ()) // does nothing
 */
export function disposeNone () {
  return disposable (() => {})
}

/**
 * Calls the Disposable's cleanup function.
 * @example
 * // dispose :: Disposable -> void
 * dispose (dsp) // runs dsp[Symbol.dispose]()
 */
export function dispose (d) {
  return d[Symbol.dispose] ()
}

/**
 * Subscribes a sink to a stream and returns a Disposable.
 * @example
 * // run :: Sink a -> Stream a -> Disposable
 * const dsp = run (sink (console.log, () => {})) (wrap (42))
 */
export function run (snk) {
  return (strm) => strm.run (snk)
}

/**
 * Convenience run: subscribes event and end callbacks.
 * @example
 * // forEach :: (a -> void) -> (reason -> void) -> Stream a -> Disposable
 * forEach (console.log) (wrap (42))
 */
export function forEach (onEvent, onEnd = () => {}) {
  return run (sink (onEvent, onEnd))
}

/**
 * A stream that never emits and never ends.
 * @example
 * // never :: () -> Stream a
 * never () // silent forever
 */
export function never () {
  return stream (() => disposeNone ())
}

/**
 * Emits a single value asynchronously (next microtask), then ends.
 * @example
 * // wrap :: a -> Stream a
 * wrap (42) // => Stream that emits 42
 */
export function wrap (a) {
  return stream ((snk) => {
    let open = true
    env.queueMicrotask (() => {
      if (open) {
        open = false
        snk.event (a)
        snk.end ()
      }
    })
    return disposable (() => (open = false))
  })
}

/**
 * Emits each element of an iterable, yielding between values via microtasks.
 * @example
 * // fromIterable :: Iterable a -> Stream a
 * fromIterable ([1, 2, 3]) // => Stream 1 2 3
 */
export function fromIterable (iterable) {
  return stream ((snk) => {
    let open = true
    const iterator = iterable[Symbol.iterator] ()

    function emitNext () {
      if (!open) return
      const { value, done } = iterator.next ()
      if (done) {
        snk.end ()
      } else {
        snk.event (value)
        env.queueMicrotask (emitNext)
      }
    }

    env.queueMicrotask (emitNext)
    return disposable (() => (open = false))
  })
}

/**
 * Emits the resolved value of a promise, then ends; swallows rejections.
 * @example
 * // fromPromise :: Promise a -> Stream a
 * fromPromise (Promise.resolve (42)) // => Stream 42
 */
export function fromPromise (promise) {
  return stream ((snk) => {
    let open = true

    promise
      .then ((value) => {
        if (open) {
          open = false
          snk.event (value)
          snk.end ()
        }
      })
      .catch (() => {
        if (open) {
          open = false
          snk.end ()
        }
      })

    return disposable (() => (open = false))
  })
}

/**
 * Emits the delay value once after `time` milliseconds, then ends.
 * @example
 * // at :: Number -> Stream Number
 * at (100) // => Stream 100  (after 100 ms)
 */
export function at (time) {
  return stream ((snk) => {
    const handle = env.setTimeout (() => {
      snk.event (time)
      snk.end ()
    }, time)
    return disposable (() => env.clearTimeout (handle))
  })
}

/**
 * Emits cumulative elapsed time every `period` milliseconds indefinitely.
 * @example
 * // periodic :: Number -> Stream Number
 * periodic(1000) // => Stream 1000 2000 3000 ...
 */
export function periodic (period) {
  return stream ((snk) => {
    let start = 0
    const handle = env.setInterval (() => {
      snk.event ((start += period))
    }, period)
    return disposable (() => env.clearInterval (handle))
  })
}

function* generateRange (count, start, step) {
  const length = Math.max (0, Math.floor (count))
  let value = start
  for (let i = 0; i < length; i++) {
    yield value
    value += step
  }
}

/**
 * Emits an arithmetic sequence of numbers.
 * @example
 * // range :: (step?, start?, count?) -> Stream Number
 * range (2, 0, 4) // => Stream 0 2 4 6
 */
export function range (step = 1, start = 0, count = Number.POSITIVE_INFINITY) {
  return fromIterable (generateRange (count, start, step))
}

/**
 * Applies fn to every emitted value.
 * @example
 * // map :: (a -> b) -> Stream a -> Stream b
 * map (x => x * 2) (wrap (3)) // => Stream 6
 */
export function map (fn) {
  return (strm) =>
    stream ((snk) => {
      const onEvent = (a) => snk.event (fn (a))
      return run (sink (onEvent, snk.end)) (strm)
    })
}

/**
 * Passes through only values that satisfy the predicate.
 * @example
 * // filter :: (a -> Boolean) -> Stream a -> Stream a
 * filter (x => x > 1) (fromIterable ([1,2,3])) // => Stream 2 3
 */
export function filter (predicate) {
  return (strm) =>
    stream ((snk) => {
      const onEvent = (a) => {
        if (predicate (a)) snk.event (a)
      }
      return run (sink (onEvent, snk.end)) (strm)
    })
}

/**
 * Maps and keeps only Just results, discarding Nothing.
 * @example
 * // filterMap :: (a -> Maybe b) -> Stream a -> Stream b
 * filterMap (x => x > 1 ? just (x * 10) : nothing ()) (fromIterable ([1, 2, 3])) // => Stream 20 30
 */
export function filterMap (fn) {
  return (strm) =>
    stream ((snk) => {
      const onEvent = (a) => {
        const b = fn (a)
        if (M.isJust (b)) snk.event (b.value)
      }

      return run (sink (onEvent, snk.end)) (strm)
    })
}

/**
 * Emits the running accumulation of a fold.
 * @example
 * // scan :: ((acc, value) -> acc, acc) -> Stream value -> Stream acc
 * scan ((n, x) => n + x, 0) (fromIterable ([1, 2, 3])) // => Stream 1 3 6
 */
export function scan (scanner, seed) {
  return (strm) =>
    stream ((snk) => {
      let state = seed

      const onEvent = (a) => {
        state = scanner (state, a)
        snk.event (state)
      }

      return run (sink (onEvent, snk.end)) (strm)
    })
}

/**
 * Like scan but emits a separate output value at each step.
 * @example
 * // loop :: ((state, value) -> [state, output], state) -> Stream value -> Stream output
 * loop (([s, v]) => [s + v, s * v], 1) (fromIterable ([1, 2, 3]))
 */
export function loop (step, seed) {
  return (strm) =>
    stream ((snk) => {
      let state = seed
      const onEvent = (a) => {
        const [next, value] = step (state, a)
        state = next
        snk.event (value)
      }

      return run (sink (onEvent, snk.end)) (strm)
    })
}

/**
 * Skips consecutive duplicate values according to the comparator.
 * @example
 * // distinct :: (a -> a -> Boolean) -> Stream a -> Stream a
 * distinct ((a, b) => a === b) (fromIterable ([1, 1, 2, 2, 3])) // => Stream 1 2 3
 */
export function distinct (compare) {
  return (strm) =>
    stream ((snk) => {
      let last = M.nothing ()
      const onEvent = (a) => {
        if (M.isNothing (last) || !compare (last.value, a)) {
          last = M.just (a)
          snk.event (a)
        }
      }

      return run (sink (onEvent, snk.end)) (strm)
    })
}

/**
 * Pairs each value with an incrementing index.
 * @example
 * // withIndex :: (start?, step?) -> Stream a -> Stream [index, a]
 * withIndex (0, 1) (fromIterable (['a', 'b'])) // => Stream [0,'a'] [1,'b']
 */
export function withIndex (start = 0, step = 1) {
  return loop ((i, v) => [i + step, [i, v]], start)
}

/**
 * Pairs each value with a 1-based counter.
 * @example
 * // withCount :: Stream a -> Stream [count, a]
 * withCount (fromIterable (['a', 'b'])) // => Stream [1,'a'] [2,'b']
 */
export function withCount (strm) {
  return withIndex (1) (strm)
}

/**
 * Emits the 1-based index of each event (discards the original value).
 * @example
 * // count :: Stream a -> Stream Number
 * count (fromIterable (['a', 'b', 'c'])) // => Stream 1 2 3
 */
export const count = F.pipe ([withCount, map (([i]) => i)])

/**
 * Emits at most n values then disposes the source and ends.
 * @example
 * // take :: Number -> Stream a -> Stream a
 * take (2) (fromIterable ([1, 2, 3, 4])) // => Stream 1 2
 */
export function take (n) {
  return (strm) => {
    if (n <= 0) return never ()

    return stream ((snk) => {
      let remaining = n
      let disposed = false
      let dsp = disposeNone ()

      const onEvent = (a) => {
        if (disposed) return
        snk.event (a)
        if (--remaining <= 0) {
          disposed = true
          dispose (dsp)
          snk.end ()
        }
      }

      dsp = run (sink (onEvent, snk.end)) (strm)

      return disposable (() => {
        if (!disposed) {
          disposed = true
          dispose (dsp)
        }
      })
    })
  }
}

/**
 * Emits values until the predicate is true for the emitted value, inclusive.
 * @example
 * // takeUntil :: (a -> Boolean) -> Stream a -> Stream a
 * takeUntil (x => x >= 3) (fromIterable ([1, 2, 3, 4])) // => Stream 1 2 3
 */
export function takeUntil (predicate) {
  return (strm) =>
    stream ((snk) => {
      let disposed = false
      let dsp = disposeNone ()

      const onEvent = (a) => {
        if (disposed) return
        snk.event (a)
        if (predicate (a)) {
          disposed = true
          dispose (dsp)
          snk.end ()
        }
      }

      dsp = run (sink (onEvent, snk.end)) (strm)

      return disposable (() => {
        if (!disposed) {
          disposed = true
          dispose (dsp)
        }
      })
    })
}

/**
 * Flattens a stream of streams with configurable concurrency and overflow strategy ('hold', 'swap', 'drop').
 * @example
 * // join :: (concurrency?, strategy?) -> Stream (Stream a) -> Stream a
 * join (2) (fromIterable ([wrap (1), wrap (2), wrap (3)]))
 */
export function join (concurrency = Number.POSITIVE_INFINITY, strategy = 'hold') {
  return (s) =>
    stream ((outerSnk) => {
      let outerClosed = false
      const queue = []
      const running = new Map ()

      const startInner = (strm) => {
        const onEnd = () => {
          if (running.has (innerSnk)) running.delete (innerSnk)
          if (running.size < concurrency && queue.length > 0) startInner (queue.shift ())
          if (outerClosed && running.size === 0) outerSnk.end ()
        }

        const innerSnk = sink (outerSnk.event, onEnd)
        running.set (innerSnk, run (innerSnk) (strm))
      }

      const event = (strm) => {
        if (running.size < concurrency) return startInner (strm)

        if (strategy === 'hold') return queue.push (strm)

        if (strategy === 'swap') {
          queue.length = 0
          F.pipe ([
            A.lookup (0),
            M.maybe (
              () => {},
              ([oldestSink, oldestDsp]) => {
                running.delete (oldestSink)
                dispose (oldestDsp)
                startInner (strm)
              },
            ),
          ]) (Array.from (running))
          return
        }

        // 'drop': новый поток отбрасывается
      }

      const end = () => {
        outerClosed = true
        if (running.size === 0 && queue.length === 0) outerSnk.end ()
      }

      const dsp = run (sink (event, end)) (s)

      return disposable (() => {
        queue.length = 0
        running.forEach (dispose)
        if (!outerClosed) dispose (dsp)
      })
    })
}

/**
 * Merges an array of streams, forwarding events from all concurrently.
 * @example
 * // mergeArray :: Array (Stream a) -> Stream a
 * mergeArray ([wrap (1), wrap (2)]) // => Stream 1 2 (order may vary)
 */
export function mergeArray (streams) {
  return join () (fromIterable (streams))
}

/**
 * Merges two streams, forwarding events from both concurrently.
 * @example
 * // merge :: Stream a -> Stream b -> Stream (a | b)
 * merge (wrap (1), wrap (2)) // => Stream 1 2 (order may vary)
 */
export function merge (a, b) {
  return mergeArray ([a, b])
}

/**
 * Appends second after first completes (sequential).
 * @example
 * // concat :: Stream a -> Stream a -> Stream a
 * concat (wrap (2)) (wrap (1)) // => Stream 1 2
 */
export function concat (second) {
  return (first) => join (1) (fromIterable ([first, second]))
}

/**
 * Maps then flattens — unlimited concurrency by default.
 * @example
 * // flatmap :: (a -> Stream b) -> Stream a -> Stream b
 * flatmap (x => wrap (x * 2)) (fromIterable ([1, 2, 3])) // => Stream 2 4 6
 */
export function flatmap (fn, concurrency = Number.POSITIVE_INFINITY) {
  return F.pipe ([map (fn), join (concurrency)])
}

/**
 * Maps then switches — disposes the previous inner stream when a new one starts.
 * @example
 * // switchmap :: (a -> Stream b) -> Stream a -> Stream b
 * switchmap (x => wrap (x)) (wrap (42)) // => Stream 42
 */
export function switchmap (fn, concurrency = 1) {
  return F.pipe ([map (fn), join (concurrency, 'swap')])
}

/**
 * Maps then ignores new sources while one is already active.
 * @example
 * // exhaustmap :: (a -> Stream b) -> Stream a -> Stream b
 * exhaustmap (x => wrap (x)) (fromIterable ([1, 2, 3])) // => Stream 1
 */
export function exhaustmap (fn, concurrency = 1) {
  return F.pipe ([map (fn), join (concurrency, 'drop')])
}

/**
 * Prepends a synchronous value before the stream's events.
 * @example
 * // startWith :: a -> Stream a -> Stream a
 * startWith (0) (wrap (1)) // => Stream 0 1
 */
export function startWith (value) {
  return (strm) => concat (strm) (wrap (value))
}

/**
 * Emits fn(latest_a, latest_b) whenever either stream emits (once both have emitted).
 * @example
 * // combine :: (a -> b -> c) -> Stream a -> Stream b -> Stream c
 * combine ((a, b) => a + b, wrap (1), wrap (2)) // => Stream 3
 */
export function combine (fn, strmA, strmB) {
  return stream ((snk) => {
    let aDone = false
    let bDone = false
    let latestA = M.nothing ()
    let latestB = M.nothing ()

    const send = () => {
      if (M.isJust (latestA) && M.isJust (latestB)) snk.event (fn (latestA.value, latestB.value))
    }

    const onEventA = (a) => {
      latestA = M.just (a)
      send ()
    }

    const onEndA = () => {
      aDone = true
      if (bDone) snk.end ()
    }

    const onEventB = (b) => {
      latestB = M.just (b)
      send ()
    }

    const onEndB = () => {
      bDone = true
      if (aDone) snk.end ()
    }

    const dspA = run (sink (onEventA, onEndA)) (strmA)
    const dspB = run (sink (onEventB, onEndB)) (strmB)

    return disposable (() => {
      if (!aDone) dispose (dspA)
      if (!bDone) dispose (dspB)
    })
  })
}

/**
 * Emits fn(...latestValues) whenever any stream emits (once all have emitted once).
 * @example
 * // combineArray :: ((...values) -> z) -> Array (Stream a) -> Stream z
 * combineArray ((a, b) => a + b, [wrap (1), wrap (2)]) // => Stream 3
 */
export function combineArray (fn, streams) {
  return stream ((snk) => {
    const n = streams.length
    const latest = Array (n).fill (M.nothing ())
    const done = Array (n).fill (false)

    const send = () => {
      if (latest.every (M.isJust)) snk.event (fn (...latest.map ((m) => m.value)))
    }

    const checkEnd = () => {
      if (done.every (Boolean)) snk.end ()
    }

    const dsps = streams.map ((s, i) => {
      const onEvent = (value) => {
        latest[i] = M.just (value)
        send ()
      }
      const onEnd = () => {
        done[i] = true
        checkEnd ()
      }

      return run (sink (onEvent, onEnd)) (s)
    })

    return disposable (() => {
      dsps.forEach ((d, i) => {
        if (!done[i]) dispose (d)
      })
    })
  })
}

/**
 * Pairs each event from first with the latest value from second.
 * @example
 * // withLatest :: Stream b -> Stream a -> Stream [a, b]
 * withLatest (hold (wrap (42))) (wrap (1)) // => Stream [1, 42]
 */
export function withLatest (second) {
  return (first) =>
    stream ((snk) => {
      let latest = M.nothing ()
      let open = true
      let secondOpen = true

      const onEventSecond = (value) => {
        latest = M.just (value)
      }

      const onEndSecond = () => {
        secondOpen = false
      }

      const dspSecond = run (sink (onEventSecond, onEndSecond)) (second)

      const onEventFirst = (value) => (M.isJust (latest) ? snk.event ([value, latest.value]) : null)

      const onEndFirst = (reason) => {
        open = false
        snk.end (reason)
        if (secondOpen) {
          secondOpen = false
          dispose (dspSecond)
        }
      }

      const dspFirst = run (sink (onEventFirst, onEndFirst)) (first)

      return disposable (() => {
        if (open) {
          open = false
          dispose (dspFirst)
        }
        if (secondOpen) {
          secondOpen = false
          dispose (dspSecond)
        }
      })
    })
}

/**
 * Zips a stream of functions with a stream of values in arrival order.
 * @example
 * // apply :: Stream (a -> b) -> Stream a -> Stream b
 * apply (wrap (x => x + 1)) (wrap (10)) // => Stream 11
 */
export function apply (strm) {
  return (sfn) =>
    stream ((snk) => {
      let valueDone = false
      let fnDone = false
      const fns = []
      const vals = []

      const send = () => {
        while (fns.length > 0 && vals.length > 0) {
          snk.event (fns.shift () (vals.shift ()))
        }
      }

      const checkEnd = () => {
        if ((fnDone && fns.length === 0) || (valueDone && vals.length === 0)) snk.end ()
      }

      const onEventFn = (fn) => {
        fns.push (fn)
        send ()
      }

      const onEndFn = () => {
        fnDone = true
        checkEnd ()
      }

      const onEventValue = (value) => {
        vals.push (value)
        send ()
      }

      const onEndValue = () => {
        valueDone = true
        checkEnd ()
      }

      const dsp_sfn = run (sink (onEventFn, onEndFn)) (sfn)
      const dsp_strm = run (sink (onEventValue, onEndValue)) (strm)

      return disposable (() => {
        if (!valueDone) dispose (dsp_strm)
        if (!fnDone) dispose (dsp_sfn)
      })
    })
}

/**
 * Splits a stream into [matching, non-matching] pair.
 * @example
 * // partition :: (a -> Boolean) -> Stream a -> [Stream a, Stream a]
 * partition (x => x > 2) (fromIterable ([1, 2, 3, 4])) // => [Stream 3 4, Stream 1 2]
 */
export function partition (predicate) {
  return (strm) => P.pair (filter (predicate) (strm)) (filter ((a) => !predicate (a)) (strm))
}

/**
 * Routes values into [Right stream, Left stream] via an Either-returning function.
 * @example
 * // partitionMap :: (a -> Either b c) -> Stream a -> [Stream b, Stream c]
 * partitionMap (x => x > 2 ? right (x) : left (x)) (fromIterable ([1, 2, 3]))
 */
export function partitionMap (predicate) {
  return (strm) => P.pair
    (filterMap (F.pipe ([predicate, E.either (() => M.nothing ()) (M.just)])) (strm))
    (filterMap (F.pipe ([predicate, E.swap, E.either (() => M.nothing ()) (M.just)])) (strm))
}

/**
 * Shares a single source subscription among multiple subscribers.
 * @example
 * // multicast :: Stream a -> Stream a
 * const shared = multicast (expensiveStream)
 */
export function multicast (strm) {
  let sourceDsp = disposeNone ()
  const sinks = new Map ()

  const onEvent = (value) => sinks.forEach ((_, s) => s.event (value))
  const onEnd = (reason) => sinks.forEach ((_, s) => s.end (reason))

  const broadcast = sink (onEvent, onEnd)

  return stream ((snk) => {
    if (sinks.has (snk)) return sinks.get (snk)

    const innerDsp = disposable (() => {
      sinks.delete (snk)
      if (sinks.size === 0) {
        dispose (sourceDsp)
        sourceDsp = disposeNone ()
      }
    })

    sinks.set (snk, innerDsp)

    if (sinks.size === 1) sourceDsp = run (broadcast) (strm)

    return innerDsp
  })
}

/**
 * Multicasts and replays the latest value to new subscribers.
 * @example
 * // hold :: Stream a -> Stream a
 * const latest$ = hold (periodic (1000))
 */
export function hold (strm) {
  const sinks = new Map ()
  let outerDsp = null
  let last = M.nothing ()
  let sourceDone = false

  return stream ((snk) => {
    if (sinks.has (snk)) return sinks.get (snk)

    // Source already finished — replay last value and end immediately
    if (sourceDone) {
      if (M.isJust (last)) snk.event (last.value)
      snk.end ()
      return disposeNone ()
    }

    const dsp = disposable (() => {
      sinks.delete (snk)
      if (sinks.size === 0 && outerDsp !== null) {
        dispose (outerDsp)
        outerDsp = null
      }
    })

    sinks.set (snk, dsp)

    if (outerDsp === null) {
      const onEvent = (value) => {
        last = M.just (value)
        sinks.forEach ((_, s) => s.event (value))
      }

      const onEnd = (reason) => {
        sourceDone = true
        outerDsp = null
        sinks.forEach ((_, s) => s.end (reason))
      }

      outerDsp = run (sink (onEvent, onEnd)) (strm)
    }

    if (M.isJust (last)) snk.event (last.value)

    return dsp
  })
}

/**
 * Creates a stream/dispatch pair. Push values via dispatch.
 * @example
 * // bus :: () -> [Stream a, dispatch: (a -> void)]
 * const [action$, dispatch] = bus ()
 * dispatch ({ type: 'increment' })
 */
export function bus () {
  const sinks = new Map ()

  const dispatch = (value) => sinks.forEach ((_, snk) => snk.event (value))

  const strm = stream ((snk) => {
    sinks.set (snk, true)
    return disposable (() => sinks.delete (snk))
  })

  return [strm, dispatch]
}

/**
 * Folds a stream into a held behaviour (combines scan + startWith + hold).
 * @example
 * // reduce :: ((acc, a) -> acc, acc) -> Stream a -> Stream acc
 * const count$ = reduce ((n, _) => n + 1, 0) (clicks$)
 */
export function reduce (fn, init) {
  return F.pipe ([scan (fn, init), startWith (init), hold])
}

/**
 * Collects all emitted values into an array resolved when the stream ends.
 * @example
 * // collect :: Stream a -> Promise (Array a)
 * collect (fromIterable ([1, 2, 3])).then (xs => xs) // => [1, 2, 3]
 */
export function collect (strm) {
  return new Promise ((resolve) => {
    const res = []
    const onEvent = (value) => res.push (value)
    const onEnd = () => resolve (res)

    run (sink (onEvent, onEnd)) (strm)
  })
}
