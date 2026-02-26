import * as F from '@algosail/fn'
import * as M from '@algosail/maybe'
import * as E from '@algosail/either'
import * as A from '@algosail/array'
import * as P from '@algosail/pair'

import { env } from '#env'

/**
 * isStream :: unknown -> Boolean
 * True when the value is a Stream object.
 * @example isStream(wrap(1)) // => true
 */
export const isStream = (value) => Boolean(value?.tag === 'stream')

/**
 * isSink :: unknown -> Boolean
 * True when the value has both 'event' and 'end' properties.
 * @example isSink(sink(x => x, () => {})) // => true
 */
export const isSink = (value) =>
  value !== null &&
  value !== undefined &&
  typeof value === 'object' &&
  'event' in value &&
  'end' in value

/**
 * isDisposable :: unknown -> Boolean
 * True when the value has a Symbol.dispose method.
 * @example isDisposable(disposeNone()) // => true
 */
export const isDisposable = (value) =>
  value !== null &&
  value !== undefined &&
  typeof value === 'object' &&
  Symbol.dispose in value

/**
 * stream :: (Sink a -> Disposable) -> Stream a
 * Low-level stream constructor — takes a subscription function.
 * @example stream(snk => { snk.event(1); snk.end(); return disposeNone() })
 */
export const stream = (run) => ({ tag: 'stream', run })

/**
 * sink :: (a -> void) -> (reason -> void) -> Sink a
 * Creates a sink with an event handler and an end handler.
 * @example sink(console.log, () => console.log('done'))
 */
export const sink = (event, end) => ({ event, end })

/**
 * disposable :: (() -> void) -> Disposable
 * Wraps a cleanup function into a Disposable.
 * @example disposable(() => clearTimeout(handle))
 */
export const disposable = (dispose) => ({ [Symbol.dispose]: dispose })

/**
 * disposeNone :: () -> Disposable
 * Returns a no-op Disposable (useful as a placeholder).
 * @example disposeNone()[Symbol.dispose]() // does nothing
 */
export const disposeNone = () => disposable(() => {})

/**
 * dispose :: Disposable -> void
 * Calls the Disposable's cleanup function.
 * @example dispose(dsp) // runs dsp[Symbol.dispose]()
 */
export const dispose = (d) => d[Symbol.dispose]()

/**
 * run :: Sink a -> Stream a -> Disposable
 * Subscribes a sink to a stream and returns a Disposable.
 * @example const dsp = run(sink(console.log, () => {}))(wrap(42))
 */
export const run = (snk) => (strm) => strm.run(snk)

/**
 * forEach :: (a -> void) -> (reason -> void) -> Stream a -> Disposable
 * Convenience run: subscribes event and end callbacks.
 * @example forEach(console.log)(wrap(42))
 */
export const forEach = (onEvent, onEnd = () => {}) => run(sink(onEvent, onEnd))

/**
 * never :: () -> Stream a
 * A stream that never emits and never ends.
 * @example never() // silent forever
 */
export const never = () => stream(() => disposeNone())

/**
 * wrap :: a -> Stream a
 * Emits a single value asynchronously (next microtask), then ends.
 * @example wrap(42) // => Stream that emits 42
 */
export const wrap = (a) =>
  stream((snk) => {
    let open = true
    env.queueMicrotask(() => {
      if (open) {
        open = false
        snk.event(a)
        snk.end()
      }
    })
    return disposable(() => (open = false))
  })

/**
 * fromIterable :: Iterable a -> Stream a
 * Emits each element of an iterable, yielding between values via microtasks.
 * @example fromIterable([1, 2, 3]) // => Stream 1 2 3
 */
export const fromIterable = (iterable) =>
  stream((snk) => {
    let open = true
    const iterator = iterable[Symbol.iterator]()

    function emitNext() {
      if (!open) return
      const { value, done } = iterator.next()
      if (done) {
        snk.end()
      } else {
        snk.event(value)
        env.queueMicrotask(emitNext)
      }
    }

    env.queueMicrotask(emitNext)
    return disposable(() => (open = false))
  })

/**
 * fromPromise :: Promise a -> Stream a
 * Emits the resolved value of a promise, then ends; swallows rejections.
 * @example fromPromise(Promise.resolve(42)) // => Stream 42
 */
export const fromPromise = (promise) =>
  stream((snk) => {
    let open = true

    promise
      .then((value) => {
        if (open) {
          open = false
          snk.event(value)
          snk.end()
        }
      })
      .catch(() => {
        if (open) {
          open = false
          snk.end()
        }
      })

    return disposable(() => (open = false))
  })

/**
 * at :: Number -> Stream Number
 * Emits the delay value once after `time` milliseconds, then ends.
 * @example at(100) // => Stream 100  (after 100 ms)
 */
export const at = (time) =>
  stream((snk) => {
    const handle = env.setTimeout(() => {
      snk.event(time)
      snk.end()
    }, time)
    return disposable(() => env.clearTimeout(handle))
  })

/**
 * periodic :: Number -> Stream Number
 * Emits cumulative elapsed time every `period` milliseconds indefinitely.
 * @example periodic(1000) // => Stream 1000 2000 3000 ...
 */
export const periodic = (period) =>
  stream((snk) => {
    let start = 0
    const handle = env.setInterval(() => {
      snk.event((start += period))
    }, period)
    return disposable(() => env.clearInterval(handle))
  })

function* generateRange(count, start, step) {
  const length = Math.max(0, Math.floor(count))
  let value = start
  for (let i = 0; i < length; i++) {
    yield value
    value += step
  }
}

/**
 * range :: (step?, start?, count?) -> Stream Number
 * Emits an arithmetic sequence of numbers.
 * @example range(2, 0, 4) // => Stream 0 2 4 6
 */
export const range = (step = 1, start = 0, count = Number.POSITIVE_INFINITY) =>
  fromIterable(generateRange(count, start, step))

/**
 * map :: (a -> b) -> Stream a -> Stream b
 * Applies fn to every emitted value.
 * @example map(x => x * 2)(wrap(3)) // => Stream 6
 */
export const map = (fn) => (strm) =>
  stream((snk) => {
    const onEvent = (a) => snk.event(fn(a))
    return run(sink(onEvent, snk.end))(strm)
  })

/**
 * filter :: (a -> Boolean) -> Stream a -> Stream a
 * Passes through only values that satisfy the predicate.
 * @example filter(x => x > 1)(fromIterable([1,2,3])) // => Stream 2 3
 */
export const filter = (predicate) => (strm) =>
  stream((snk) => {
    const onEvent = (a) => {
      if (predicate(a)) snk.event(a)
    }
    return run(sink(onEvent, snk.end))(strm)
  })

/**
 * filterMap :: (a -> Maybe b) -> Stream a -> Stream b
 * Maps and keeps only Just results, discarding Nothing.
 * @example filterMap(x => x > 1 ? just(x*10) : nothing())(fromIterable([1,2,3])) // => Stream 20 30
 */
export const filterMap = (fn) => (strm) =>
  stream((snk) => {
    const onEvent = (a) => {
      const b = fn(a)
      if (M.isJust(b)) snk.event(b.value)
    }

    return run(sink(onEvent, snk.end))(strm)
  })

/**
 * scan :: ((acc, value) -> acc, acc) -> Stream value -> Stream acc
 * Emits the running accumulation of a fold.
 * @example scan((n, x) => n + x, 0)(fromIterable([1,2,3])) // => Stream 1 3 6
 */
export const scan = (scanner, seed) => (strm) =>
  stream((snk) => {
    let state = seed

    const onEvent = (a) => {
      state = scanner(state, a)
      snk.event(state)
    }

    return run(sink(onEvent, snk.end))(strm)
  })

/**
 * loop :: ((state, value) -> [state, output], state) -> Stream value -> Stream output
 * Like scan but emits a separate output value at each step.
 * @example loop(([s,v]) => [s+v, s*v], 1)(fromIterable([1,2,3]))
 */
export const loop = (step, seed) => (strm) =>
  stream((snk) => {
    let state = seed
    const onEvent = (a) => {
      const [next, value] = step(state, a)
      state = next
      snk.event(value)
    }

    return run(sink(onEvent, snk.end))(strm)
  })

/**
 * distinct :: (a -> a -> Boolean) -> Stream a -> Stream a
 * Skips consecutive duplicate values according to the comparator.
 * @example distinct((a,b) => a===b)(fromIterable([1,1,2,2,3])) // => Stream 1 2 3
 */
export const distinct = (compare) => (strm) =>
  stream((snk) => {
    let last = M.nothing()
    const onEvent = (a) => {
      if (M.isNothing(last) || !compare(last.value, a)) {
        last = M.just(a)
        snk.event(a)
      }
    }

    return run(sink(onEvent, snk.end))(strm)
  })

/**
 * withIndex :: (start?, step?) -> Stream a -> Stream [index, a]
 * Pairs each value with an incrementing index.
 * @example withIndex(0, 1)(fromIterable(['a','b'])) // => Stream [0,'a'] [1,'b']
 */
export const withIndex = (start = 0, step = 1) =>
  loop((i, v) => [i + step, [i, v]], start)

/**
 * withCount :: Stream a -> Stream [count, a]
 * Pairs each value with a 1-based counter.
 * @example withCount(fromIterable(['a','b'])) // => Stream [1,'a'] [2,'b']
 */
export const withCount = (strm) => withIndex(1)(strm)

/**
 * count :: Stream a -> Stream Number
 * Emits the 1-based index of each event (discards the original value).
 * @example count(fromIterable(['a','b','c'])) // => Stream 1 2 3
 */
export const count = F.pipe([withCount, map(([i]) => i)])

/**
 * take :: Number -> Stream a -> Stream a
 * Emits at most n values then disposes the source and ends.
 * @example take(2)(fromIterable([1,2,3,4])) // => Stream 1 2
 */
export const take = (n) => (strm) => {
  if (n <= 0) return never()

  return stream((snk) => {
    let remaining = n
    let disposed = false
    let dsp = disposeNone()

    const onEvent = (a) => {
      if (disposed) return
      snk.event(a)
      if (--remaining <= 0) {
        disposed = true
        dispose(dsp)
        snk.end()
      }
    }

    dsp = run(sink(onEvent, snk.end))(strm)

    return disposable(() => {
      if (!disposed) {
        disposed = true
        dispose(dsp)
      }
    })
  })
}

/**
 * takeUntil :: (a -> Boolean) -> Stream a -> Stream a
 * Emits values until the predicate is true for the emitted value, inclusive.
 * @example takeUntil(x => x >= 3)(fromIterable([1,2,3,4])) // => Stream 1 2 3
 */
export const takeUntil = (predicate) => (strm) =>
  stream((snk) => {
    let disposed = false
    let dsp = disposeNone()

    const onEvent = (a) => {
      if (disposed) return
      snk.event(a)
      if (predicate(a)) {
        disposed = true
        dispose(dsp)
        snk.end()
      }
    }

    dsp = run(sink(onEvent, snk.end))(strm)

    return disposable(() => {
      if (!disposed) {
        disposed = true
        dispose(dsp)
      }
    })
  })

/**
 * join :: (concurrency?, strategy?) -> Stream (Stream a) -> Stream a
 * Flattens a stream of streams with configurable concurrency and overflow strategy ('hold', 'swap', 'drop').
 * @example join(2)(fromIterable([wrap(1), wrap(2), wrap(3)]))
 */
export const join =
  (concurrency = Number.POSITIVE_INFINITY, strategy = 'hold') =>
  (s) =>
    stream((outerSnk) => {
      let outerClosed = false
      const queue = []
      const running = new Map()

      const startInner = (strm) => {
        const onEnd = () => {
          if (running.has(innerSnk)) running.delete(innerSnk)
          if (running.size < concurrency && queue.length > 0)
            startInner(queue.shift())
          if (outerClosed && running.size === 0) outerSnk.end()
        }

        const innerSnk = sink(outerSnk.event, onEnd)
        running.set(innerSnk, run(innerSnk)(strm))
      }

      const event = (strm) => {
        if (running.size < concurrency) return startInner(strm)

        if (strategy === 'hold') return queue.push(strm)

        if (strategy === 'swap') {
          queue.length = 0
          F.pipe([
            A.lookup(0),
            M.maybe(
              () => {},
              ([oldestSink, oldestDsp]) => {
                running.delete(oldestSink)
                dispose(oldestDsp)
                startInner(strm)
              },
            ),
          ])(Array.from(running))
          return
        }

        // 'drop': новый поток отбрасывается
      }

      const end = () => {
        outerClosed = true
        if (running.size === 0 && queue.length === 0) outerSnk.end()
      }

      const dsp = run(sink(event, end))(s)

      return disposable(() => {
        queue.length = 0
        running.forEach(dispose)
        if (!outerClosed) dispose(dsp)
      })
    })

/**
 * mergeArray :: Array (Stream a) -> Stream a
 * Merges an array of streams, forwarding events from all concurrently.
 * @example mergeArray([wrap(1), wrap(2)]) // => Stream 1 2 (order may vary)
 */
export const mergeArray = (streams) => join()(fromIterable(streams))

/**
 * merge :: Stream a -> Stream b -> Stream (a | b)
 * Merges two streams, forwarding events from both concurrently.
 * @example merge(wrap(1), wrap(2)) // => Stream 1 2 (order may vary)
 */
export const merge = (a, b) => mergeArray([a, b])

/**
 * concat :: Stream a -> Stream a -> Stream a
 * Appends second after first completes (sequential).
 * @example concat(wrap(2))(wrap(1)) // => Stream 1 2
 */
export const concat = (second) => (first) =>
  join(1)(fromIterable([first, second]))

/**
 * flatmap :: (a -> Stream b) -> Stream a -> Stream b
 * Maps then flattens — unlimited concurrency by default.
 * @example flatmap(x => wrap(x * 2))(fromIterable([1,2,3])) // => Stream 2 4 6
 */
export const flatmap = (fn, concurrency = Number.POSITIVE_INFINITY) =>
  F.pipe([map(fn), join(concurrency)])

/**
 * switchmap :: (a -> Stream b) -> Stream a -> Stream b
 * Maps then switches — disposes the previous inner stream when a new one starts.
 * @example switchmap(x => wrap(x))(wrap(42)) // => Stream 42
 */
export const switchmap = (fn, concurrency = 1) =>
  F.pipe([map(fn), join(concurrency, 'swap')])

/**
 * exhaustmap :: (a -> Stream b) -> Stream a -> Stream b
 * Maps then ignores new sources while one is already active.
 * @example exhaustmap(x => wrap(x))(fromIterable([1,2,3])) // => Stream 1
 */
export const exhaustmap = (fn, concurrency = 1) =>
  F.pipe([map(fn), join(concurrency, 'drop')])

/**
 * startWith :: a -> Stream a -> Stream a
 * Prepends a synchronous value before the stream's events.
 * @example startWith(0)(wrap(1)) // => Stream 0 1
 */
export const startWith = (value) => (strm) => concat(strm)(wrap(value))

/**
 * combine :: (a -> b -> c) -> Stream a -> Stream b -> Stream c
 * Emits fn(latest_a, latest_b) whenever either stream emits (once both have emitted).
 * @example combine((a, b) => a + b, wrap(1), wrap(2)) // => Stream 3
 */
export const combine = (fn, strmA, strmB) =>
  stream((snk) => {
    let aDone = false
    let bDone = false
    let latestA = M.nothing()
    let latestB = M.nothing()

    const send = () => {
      if (M.isJust(latestA) && M.isJust(latestB))
        snk.event(fn(latestA.value, latestB.value))
    }

    const onEventA = (a) => {
      latestA = M.just(a)
      send()
    }

    const onEndA = () => {
      aDone = true
      if (bDone) snk.end()
    }

    const onEventB = (b) => {
      latestB = M.just(b)
      send()
    }

    const onEndB = () => {
      bDone = true
      if (aDone) snk.end()
    }

    const dspA = run(sink(onEventA, onEndA))(strmA)
    const dspB = run(sink(onEventB, onEndB))(strmB)

    return disposable(() => {
      if (!aDone) dispose(dspA)
      if (!bDone) dispose(dspB)
    })
  })

/**
 * combineArray :: ((...values) -> z) -> Array (Stream a) -> Stream z
 * Emits fn(...latestValues) whenever any stream emits (once all have emitted once).
 * @example combineArray((a,b) => a+b, [wrap(1), wrap(2)]) // => Stream 3
 */
export const combineArray = (fn, streams) =>
  stream((snk) => {
    const n = streams.length
    const latest = Array(n).fill(M.nothing())
    const done = Array(n).fill(false)

    const send = () => {
      if (latest.every(M.isJust)) snk.event(fn(...latest.map((m) => m.value)))
    }

    const checkEnd = () => {
      if (done.every(Boolean)) snk.end()
    }

    const dsps = streams.map((s, i) => {
      const onEvent = (value) => {
        latest[i] = M.just(value)
        send()
      }
      const onEnd = () => {
        done[i] = true
        checkEnd()
      }

      return run(sink(onEvent, onEnd))(s)
    })

    return disposable(() => {
      dsps.forEach((d, i) => {
        if (!done[i]) dispose(d)
      })
    })
  })

/**
 * withLatest :: Stream b -> Stream a -> Stream [a, b]
 * Pairs each event from first with the latest value from second.
 * @example withLatest(hold(wrap(42)))(wrap(1)) // => Stream [1, 42]
 */
export const withLatest = (second) => (first) =>
  stream((snk) => {
    let latest = M.nothing()
    let open = true
    let secondOpen = true

    const onEventSecond = (value) => {
      latest = M.just(value)
    }

    const onEndSecond = () => {
      secondOpen = false
    }

    const dspSecond = run(sink(onEventSecond, onEndSecond))(second)

    const onEventFirst = (value) =>
      M.isJust(latest) ? snk.event([value, latest.value]) : null

    const onEndFirst = (reason) => {
      open = false
      snk.end(reason)
      if (secondOpen) {
        secondOpen = false
        dispose(dspSecond)
      }
    }

    const dspFirst = run(sink(onEventFirst, onEndFirst))(first)

    return disposable(() => {
      if (open) {
        open = false
        dispose(dspFirst)
      }
      if (secondOpen) {
        secondOpen = false
        dispose(dspSecond)
      }
    })
  })

/**
 * apply :: Stream (a -> b) -> Stream a -> Stream b
 * Zips a stream of functions with a stream of values in arrival order.
 * @example apply(wrap(x => x + 1))(wrap(10)) // => Stream 11
 */
export function apply(strm) {
  return (sfn) =>
    stream((snk) => {
      let valueDone = false
      let fnDone = false
      const fns = []
      const vals = []

      const send = () => {
        while (fns.length > 0 && vals.length > 0) {
          snk.event(fns.shift()(vals.shift()))
        }
      }

      const checkEnd = () => {
        if ((fnDone && fns.length === 0) || (valueDone && vals.length === 0))
          snk.end()
      }

      const onEventFn = (fn) => {
        fns.push(fn)
        send()
      }

      const onEndFn = () => {
        fnDone = true
        checkEnd()
      }

      const onEventValue = (value) => {
        vals.push(value)
        send()
      }

      const onEndValue = () => {
        valueDone = true
        checkEnd()
      }

      const dsp_sfn = run(sink(onEventFn, onEndFn))(sfn)
      const dsp_strm = run(sink(onEventValue, onEndValue))(strm)

      return disposable(() => {
        if (!valueDone) dispose(dsp_strm)
        if (!fnDone) dispose(dsp_sfn)
      })
    })
}

/**
 * partition :: (a -> Boolean) -> Stream a -> [Stream a, Stream a]
 * Splits a stream into [matching, non-matching] pair.
 * @example partition(x => x > 2)(fromIterable([1,2,3,4])) // => [Stream 3 4, Stream 1 2]
 */
export const partition = (predicate) => (strm) =>
  P.pair(filter(predicate)(strm), filter((a) => !predicate(a))(strm))

/**
 * partitionMap :: (a -> Either b c) -> Stream a -> [Stream b, Stream c]
 * Routes values into [Right stream, Left stream] via an Either-returning function.
 * @example partitionMap(x => x > 2 ? right(x) : left(x))(fromIterable([1,2,3]))
 */
export const partitionMap = (predicate) => (strm) =>
  P.pair(
    filterMap(F.pipe([predicate, E.eitherToMaybe]))(strm),
    filterMap(F.pipe([predicate, E.swap, E.eitherToMaybe]))(strm),
  )

/**
 * multicast :: Stream a -> Stream a
 * Shares a single source subscription among multiple subscribers.
 * @example const shared = multicast(expensiveStream)
 */
export const multicast = (strm) => {
  let sourceDsp = disposeNone()
  const sinks = new Map()

  const onEvent = (value) => sinks.forEach((_, s) => s.event(value))
  const onEnd = (reason) => sinks.forEach((_, s) => s.end(reason))

  const broadcast = sink(onEvent, onEnd)

  return stream((snk) => {
    if (sinks.has(snk)) return sinks.get(snk)

    const innerDsp = disposable(() => {
      sinks.delete(snk)
      if (sinks.size === 0) {
        dispose(sourceDsp)
        sourceDsp = disposeNone()
      }
    })

    sinks.set(snk, innerDsp)

    if (sinks.size === 1) sourceDsp = run(broadcast)(strm)

    return innerDsp
  })
}

/**
 * hold :: Stream a -> Stream a
 * Multicasts and replays the latest value to new subscribers.
 * @example const latest$ = hold(periodic(1000))
 */
export const hold = (strm) => {
  const sinks = new Map()
  let outerDsp = null
  let last = M.nothing()
  let sourceDone = false

  return stream((snk) => {
    if (sinks.has(snk)) return sinks.get(snk)

    // Source already finished — replay last value and end immediately
    if (sourceDone) {
      if (M.isJust(last)) snk.event(last.value)
      snk.end()
      return disposeNone()
    }

    const dsp = disposable(() => {
      sinks.delete(snk)
      if (sinks.size === 0 && outerDsp !== null) {
        dispose(outerDsp)
        outerDsp = null
      }
    })

    sinks.set(snk, dsp)

    if (outerDsp === null) {
      const onEvent = (value) => {
        last = M.just(value)
        sinks.forEach((_, s) => s.event(value))
      }

      const onEnd = (reason) => {
        sourceDone = true
        outerDsp = null
        sinks.forEach((_, s) => s.end(reason))
      }

      outerDsp = run(sink(onEvent, onEnd))(strm)
    }

    if (M.isJust(last)) snk.event(last.value)

    return dsp
  })
}

/**
 * bus :: () -> [Stream a, dispatch: (a -> void)]
 * Creates a stream/dispatch pair. Push values via dispatch.
 * @example
 * const [action$, dispatch] = bus()
 * dispatch({ type: 'increment' })
 */
export const bus = () => {
  const sinks = new Map()

  const dispatch = (value) => sinks.forEach((_, snk) => snk.event(value))

  const strm = stream((snk) => {
    sinks.set(snk, true)
    return disposable(() => sinks.delete(snk))
  })

  return [strm, dispatch]
}

/**
 * reduce :: ((acc, a) -> acc, acc) -> Stream a -> Stream acc
 * Folds a stream into a held behaviour (combines scan + startWith + hold).
 * @example
 * const count$ = reduce((n, _) => n + 1, 0)(clicks$)
 */
export const reduce = (fn, init) =>
  F.pipe([scan(fn, init), startWith(init), hold])

/**
 * collect :: Stream a -> Promise (Array a)
 * Collects all emitted values into an array resolved when the stream ends.
 * @example collect(fromIterable([1,2,3])).then(xs => xs) // => [1, 2, 3]
 */
export const collect = (strm) => {
  return new Promise((resolve) => {
    const res = []
    const onEvent = (value) => res.push(value)
    const onEnd = () => resolve(res)

    run(sink(onEvent, onEnd))(strm)
  })
}
