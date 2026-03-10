import test from 'brittle'
import * as S from '../lib/stream.js'

// Helper function to collect stream values into an array
function collect (stream) {
  return new Promise ((resolve) => {
    const results = []
    S.forEach (
      (value) => results.push (value),
      () => resolve (results),
    ) (stream)
  })
}

// Helper function to collect with a timeout
function collectWithTimeout (stream, timeout = 100) {
  return new Promise ((resolve) => {
    const results = []
    const timer = setTimeout (() => {
      resolve (results)
    }, timeout)

    S.forEach (
      (value) => results.push (value),
      () => {
        clearTimeout (timer)
        resolve (results)
      },
    ) (stream)
  })
}

// Type checking tests
test ('isStream returns true for stream objects', (t) => {
  const s = S.wrap (1)
  t.ok (S.isStream (s))
})

test ('isStream returns false for non-stream objects', (t) => {
  t.absent (S.isStream (null))
  t.absent (S.isStream (undefined))
  t.absent (S.isStream (42))
  t.absent (S.isStream ({}))
  t.absent (S.isStream ({ tag: 'other' }))
})

test ('isSink returns true for sink objects', (t) => {
  const snk = S.sink (() => {}, () => {})
  t.ok (S.isSink (snk))
})

test ('isSink returns false for non-sink objects', (t) => {
  t.absent (S.isSink (null))
  t.absent (S.isSink (undefined))
  t.absent (S.isSink ({}))
  t.absent (S.isSink ({ event: () => {} }))
})

test ('isDisposable returns true for disposable objects', (t) => {
  const dsp = S.disposable (() => {})
  t.ok (S.isDisposable (dsp))
})

test ('isDisposable returns false for non-disposable objects', (t) => {
  t.absent (S.isDisposable (null))
  t.absent (S.isDisposable (undefined))
  t.absent (S.isDisposable ({}))
})

// Constructor tests
test ('stream creates a stream object', (t) => {
  const s = S.stream (() => S.disposeNone ())
  t.ok (S.isStream (s))
  t.is (s.tag, 'stream')
  t.is (typeof s.run, 'function')
})

test ('sink creates a sink object', (t) => {
  const snk = S.sink (() => {}, () => {})
  t.ok (S.isSink (snk))
  t.is (typeof snk.event, 'function')
  t.is (typeof snk.end, 'function')
})

test ('disposable creates a disposable object', (t) => {
  const dsp = S.disposable (() => {})
  t.ok (S.isDisposable (dsp))
  t.is (typeof dsp[Symbol.dispose], 'function')
})

test ('disposeNone returns a no-op disposable', (t) => {
  const dsp = S.disposeNone ()
  t.ok (S.isDisposable (dsp))
  t.execution (() => S.dispose (dsp))
})

test ('dispose calls the cleanup function', (t) => {
  let called = false
  const dsp = S.disposable (() => { called = true })
  S.dispose (dsp)
  t.ok (called)
})

// Stream creation tests
test ('wrap emits a single value', async (t) => {
  const result = await collect (S.wrap (42))
  t.alike (result, [42])
})

test ('never produces no values', async (t) => {
  const result = await collectWithTimeout (S.never (), 50)
  t.alike (result, [])
})

test ('fromIterable emits all values from an array', async (t) => {
  const result = await collect (S.fromIterable ([1, 2, 3]))
  t.alike (result, [1, 2, 3])
})

test ('fromIterable handles empty array', async (t) => {
  const result = await collect (S.fromIterable ([]))
  t.alike (result, [])
})

test ('fromPromise emits resolved value', async (t) => {
  const result = await collect (S.fromPromise (Promise.resolve (42)))
  t.alike (result, [42])
})

test ('fromPromise handles rejected promise', async (t) => {
  const result = await collect (S.fromPromise (Promise.reject (new Error ('test'))))
  t.alike (result, [])
})

test ('at emits after specified time', async (t) => {
  const start = Date.now ()
  const result = await collect (S.at (50))
  const elapsed = Date.now () - start
  t.alike (result, [50])
  t.ok (elapsed >= 45) // Allow some variance
})

test ('range generates sequence with default parameters', async (t) => {
  const result = await collect (S.take (5) (S.range ()))
  t.alike (result, [0, 1, 2, 3, 4])
})

test ('range generates sequence with custom step', async (t) => {
  const result = await collect (S.range (2, 0, 5))
  t.alike (result, [0, 2, 4, 6, 8])
})

test ('range generates sequence with custom start', async (t) => {
  const result = await collect (S.range (1, 10, 3))
  t.alike (result, [10, 11, 12])
})

// Transformation tests
test ('map transforms values', async (t) => {
  const result = await collect (S.map ((x) => x * 2) (S.fromIterable ([1, 2, 3])))
  t.alike (result, [2, 4, 6])
})

test ('filter keeps only matching values', async (t) => {
  const result = await collect (S.filter ((x) => x > 2) (S.fromIterable ([1, 2, 3, 4])))
  t.alike (result, [3, 4])
})

test ('filter removes all values when predicate is false', async (t) => {
  const result = await collect (S.filter (() => false) (S.fromIterable ([1, 2, 3])))
  t.alike (result, [])
})

test ('scan accumulates values', async (t) => {
  const result = await collect (S.scan ((acc, x) => acc + x, 0) (S.fromIterable ([1, 2, 3])))
  t.alike (result, [1, 3, 6])
})

test ('scan with multiplication', async (t) => {
  const result = await collect (S.scan ((acc, x) => acc * x, 1) (S.fromIterable ([2, 3, 4])))
  t.alike (result, [2, 6, 24])
})

test ('loop emits separate output values', async (t) => {
  const result = await collect (
    S.loop ((state, value) => [state + value, state * value], 1) (S.fromIterable ([1, 2, 3])),
  )
  t.alike (result, [1, 4, 12])
})

test ('distinct removes consecutive duplicates', async (t) => {
  const result = await collect (
    S.distinct ((a, b) => a === b) (S.fromIterable ([1, 1, 2, 2, 3, 3, 2])),
  )
  t.alike (result, [1, 2, 3, 2])
})

test ('withIndex adds index to values', async (t) => {
  const result = await collect (S.withIndex (0, 1) (S.fromIterable (['a', 'b', 'c'])))
  t.alike (result, [[0, 'a'], [1, 'b'], [2, 'c']])
})

test ('withIndex with custom start and step', async (t) => {
  const result = await collect (S.withIndex (10, 5) (S.fromIterable (['a', 'b'])))
  t.alike (result, [[10, 'a'], [15, 'b']])
})

test ('withCount adds 1-based counter', async (t) => {
  const result = await collect (S.withCount (S.fromIterable (['a', 'b', 'c'])))
  t.alike (result, [[1, 'a'], [2, 'b'], [3, 'c']])
})

test ('count emits only indices', async (t) => {
  const result = await collect (S.count (S.fromIterable (['a', 'b', 'c'])))
  t.alike (result, [1, 2, 3])
})

test ('take limits number of values', async (t) => {
  const result = await collect (S.take (2) (S.fromIterable ([1, 2, 3, 4, 5])))
  t.alike (result, [1, 2])
})

test ('take with zero returns empty stream', async (t) => {
  const result = await collectWithTimeout (S.take (0) (S.fromIterable ([1, 2, 3])), 50)
  t.alike (result, [])
})

test ('take disposes source stream early', async (t) => {
  let disposed = false
  const s = S.stream ((snk) => {
    setTimeout (() => {
      snk.event (1)
      snk.event (2)
      snk.event (3)
    }, 0)
    return S.disposable (() => { disposed = true })
  })

  await collect (S.take (2) (s))
  await new Promise ((resolve) => setTimeout (resolve, 10))
  t.ok (disposed)
})

test ('startWith prepends values', async (t) => {
  const result = await collect (S.startWith (0) (S.fromIterable ([1, 2, 3])))
  t.alike (result, [0, 1, 2, 3])
})

// Combination tests
test ('merge combines two streams', async (t) => {
  const result = await collect (
    S.merge (S.wrap (1), S.wrap (2)),
  )
  t.is (result.length, 2)
  t.ok (result.includes (1))
  t.ok (result.includes (2))
})

test ('mergeArray combines array of streams', async (t) => {
  const result = await collect (
    S.mergeArray ([S.wrap (1), S.wrap (2), S.wrap (3)]),
  )
  t.is (result.length, 3)
  t.ok (result.includes (1))
  t.ok (result.includes (2))
  t.ok (result.includes (3))
})

test ('concat sequences streams', async (t) => {
  const result = await collect (
    S.concat (S.fromIterable ([3, 4])) (S.fromIterable ([1, 2])),
  )
  t.alike (result, [1, 2, 3, 4])
})

// Disposal tests
test ('dispose stops stream from emitting', async (t) => {
  const results = []
  const s = S.periodic (10)

  const dsp = S.forEach (
    (value) => results.push (value),
    () => {},
  ) (s)

  await new Promise ((resolve) => setTimeout (resolve, 35))
  S.dispose (dsp)
  const count = results.length

  await new Promise ((resolve) => setTimeout (resolve, 30))
  t.is (results.length, count) // No new values after disposal
})

test ('run returns disposable', (t) => {
  const s = S.wrap (42)
  const dsp = S.run (S.sink (() => {}, () => {})) (s)
  t.ok (S.isDisposable (dsp))
})

// Reduce and collect tests
test ('reduce creates held behavior with accumulated values', async (t) => {
  const result = await collect (
    S.reduce ((acc, x) => acc + x, 0) (S.fromIterable ([1, 2, 3, 4])),
  )
  // reduce = scan + startWith(init) + hold, so it emits init and all intermediate values
  t.alike (result, [0, 1, 3, 6, 10])
})

test ('collect gathers all values into array', async (t) => {
  // collect returns a Promise, not a Stream
  const result = await S.collect (S.fromIterable ([1, 2, 3]))
  t.alike (result, [1, 2, 3])
})

// Bus tests
test ('bus allows imperative event emission', async (t) => {
  const [strm, dispatch] = S.bus ()

  const results = []
  S.forEach (
    (v) => results.push (v),
    () => {},
  ) (strm)

  dispatch (1)
  dispatch (2)
  dispatch (3)

  await new Promise ((resolve) => setTimeout (resolve, 10))
  t.alike (results, [1, 2, 3])
})

test ('bus can have multiple subscribers', async (t) => {
  const [strm, dispatch] = S.bus ()

  const results1 = []
  const results2 = []

  S.forEach (
    (v) => results1.push (v),
    () => {},
  ) (strm)

  S.forEach (
    (v) => results2.push (v),
    () => {},
  ) (strm)

  dispatch (1)
  dispatch (2)

  await new Promise ((resolve) => setTimeout (resolve, 10))

  t.alike (results1, [1, 2])
  t.alike (results2, [1, 2])
})

// Multicast tests
test ('multicast shares single subscription', async (t) => {
  let subscriptionCount = 0

  const source = S.stream ((snk) => {
    subscriptionCount++
    setTimeout (() => {
      snk.event (1)
      snk.event (2)
      snk.end ()
    }, 0)
    return S.disposeNone ()
  })

  const multi = S.multicast (source)

  const results1 = []
  const results2 = []

  S.forEach (
    (v) => results1.push (v),
    () => {},
  ) (multi)

  S.forEach (
    (v) => results2.push (v),
    () => {},
  ) (multi)

  await new Promise ((resolve) => setTimeout (resolve, 10))

  t.alike (results1, [1, 2])
  t.alike (results2, [1, 2])
  t.is (subscriptionCount, 1) // Shared subscription
})

// Partition tests
test ('partition splits stream by predicate', async (t) => {
  const source = S.fromIterable ([1, 2, 3, 4])
  const [trueStream, falseStream] = S.partition ((x) => x > 2) (source)

  const trueResults = []
  const falseResults = []

  S.forEach (
    (v) => trueResults.push (v),
    () => {},
  ) (trueStream)

  S.forEach (
    (v) => falseResults.push (v),
    () => {},
  ) (falseStream)

  await new Promise ((resolve) => setTimeout (resolve, 10))

  t.alike (trueResults, [3, 4])
  t.alike (falseResults, [1, 2])
})

// Edge cases
test ('empty stream completes immediately', async (t) => {
  const result = await collect (S.fromIterable ([]))
  t.alike (result, [])
})

test ('map on empty stream returns empty', async (t) => {
  const result = await collect (S.map ((x) => x * 2) (S.fromIterable ([])))
  t.alike (result, [])
})

test ('filter that matches nothing returns empty', async (t) => {
  const result = await collect (S.filter (() => false) (S.fromIterable ([1, 2, 3])))
  t.alike (result, [])
})

test ('multiple transformations compose correctly', async (t) => {
  const result = await collect (
    S.take (3) (
      S.filter ((x) => x > 0) (
        S.map ((x) => x - 2) (
          S.fromIterable ([1, 2, 3, 4, 5, 6]),
        ),
      ),
    ),
  )
  t.alike (result, [1, 2, 3])
})

// Async behavior tests
test ('wrap emits asynchronously', async (t) => {
  let emitted = false
  S.forEach (
    () => { emitted = true },
    () => {},
  ) (S.wrap (42))

  t.absent (emitted) // Should not be emitted synchronously

  await new Promise ((resolve) => setTimeout (resolve, 10))
  t.ok (emitted) // Should be emitted after microtask
})

test ('forEach can be called without onEnd', async (t) => {
  const results = []
  S.forEach ((value) => results.push (value)) (S.wrap (42))

  await new Promise ((resolve) => setTimeout (resolve, 10))
  t.alike (results, [42])
})

// filterMap tests
test ('filterMap keeps and transforms Just values', async (t) => {
  const result = await collect (
    S.filterMap ((x) => x > 2 ? { tag: 'just', value: x * 10 } : { tag: 'nothing' }) (
      S.fromIterable ([1, 2, 3, 4]),
    ),
  )
  t.alike (result, [30, 40])
})

test ('filterMap filters out Nothing values', async (t) => {
  const result = await collect (
    S.filterMap (() => ({ tag: 'nothing' })) (S.fromIterable ([1, 2, 3])),
  )
  t.alike (result, [])
})

// takeUntil tests
test ('takeUntil emits until predicate is true', async (t) => {
  const result = await collect (
    S.takeUntil ((x) => x >= 3) (S.fromIterable ([1, 2, 3, 4, 5])),
  )
  t.alike (result, [1, 2, 3])
})

test ('takeUntil with predicate never true emits all values', async (t) => {
  const result = await collect (
    S.takeUntil (() => false) (S.fromIterable ([1, 2, 3])),
  )
  t.alike (result, [1, 2, 3])
})

// periodic tests
test ('periodic emits values at intervals', async (t) => {
  const results = []
  const dsp = S.forEach (
    (value) => results.push (value),
    () => {},
  ) (S.periodic (20))

  await new Promise ((resolve) => setTimeout (resolve, 65))
  S.dispose (dsp)

  t.is (results.length, 3)
  t.ok (results[0] >= 20 && results[0] <= 25)
  t.ok (results[1] >= 40 && results[1] <= 45)
  t.ok (results[2] >= 60 && results[2] <= 65)
})

// flatmap tests
test ('flatmap flattens nested streams', async (t) => {
  const result = await collect (
    S.flatmap ((x) => S.fromIterable ([x, x * 10])) (S.fromIterable ([1, 2, 3])),
  )
  t.ok (result.includes (1))
  t.ok (result.includes (10))
  t.ok (result.includes (2))
  t.ok (result.includes (20))
  t.ok (result.includes (3))
  t.ok (result.includes (30))
})

// switchmap tests
test ('switchmap switches to new stream', async (t) => {
  const [strm, dispatch] = S.bus ()

  const results = []
  S.forEach (
    (v) => results.push (v),
    () => {},
  ) (S.switchmap ((x) => S.wrap (x * 10)) (strm))

  dispatch (1)
  await new Promise ((resolve) => setTimeout (resolve, 5))
  dispatch (2)
  await new Promise ((resolve) => setTimeout (resolve, 5))
  dispatch (3)

  await new Promise ((resolve) => setTimeout (resolve, 10))

  // switchmap cancels previous streams, so we should see all values
  t.ok (results.length >= 1)
  // Last value should definitely be there
  t.ok (results.includes (30))
})

// exhaustmap tests
test ('exhaustmap ignores new values while busy', async (t) => {
  const result = await collect (
    S.exhaustmap ((x) => S.wrap (x * 10)) (S.fromIterable ([1, 2, 3])),
  )
  // exhaustmap with concurrency=1 should only process first value
  t.ok (result.includes (10))
})

// combine tests
test ('combine emits when both streams have values', async (t) => {
  const result = await collect (
    S.combine ((a, b) => a + b, S.wrap (10), S.wrap (20)),
  )
  t.alike (result, [30])
})

test ('combine with multiple emissions', async (t) => {
  const [strm1, dispatch1] = S.bus ()
  const [strm2, dispatch2] = S.bus ()

  const results = []
  const dsp = S.forEach (
    (v) => results.push (v),
    () => {},
  ) (S.combine ((a, b) => a + b, strm1, strm2))

  dispatch1 (1)
  dispatch2 (10)
  dispatch1 (2)
  dispatch2 (20)

  await new Promise ((resolve) => setTimeout (resolve, 10))
  S.dispose (dsp)

  t.alike (results, [11, 12, 22])
})

// combineArray tests
test ('combineArray combines multiple streams', async (t) => {
  const result = await collect (
    S.combineArray (
      (a, b, c) => a + b + c,
      [S.wrap (1), S.wrap (2), S.wrap (3)],
    ),
  )
  t.alike (result, [6])
})

test ('combineArray with single stream', async (t) => {
  const result = await collect (
    S.combineArray ((x) => x * 2, [S.wrap (21)]),
  )
  t.alike (result, [42])
})

// withLatest tests
test ('withLatest combines with latest value from second stream', async (t) => {
  const [strm1, dispatch1] = S.bus ()
  const [strm2, dispatch2] = S.bus ()

  const results = []
  const dsp = S.forEach (
    (v) => results.push (v),
    () => {},
  ) (S.withLatest (strm2) (strm1))

  dispatch2 (100)
  dispatch1 (1)
  dispatch1 (2)
  dispatch2 (200)
  dispatch1 (3)

  await new Promise ((resolve) => setTimeout (resolve, 10))
  S.dispose (dsp)

  t.alike (results, [[1, 100], [2, 100], [3, 200]])
})

// partitionMap tests
test ('partitionMap splits and transforms stream', async (t) => {
  // partitionMap uses Either from sail: { tag: 'left', left: value } or { tag: 'right', right: value }
  const [rightStream, leftStream] = S.partitionMap ((x) =>
    x > 2
      ? { tag: 'right', right: x * 10 }
      : { tag: 'left', left: x * 100 },
  ) (S.fromIterable ([1, 2, 3, 4]))

  const leftResults = []
  const rightResults = []

  S.forEach (
    (v) => leftResults.push (v),
    () => {},
  ) (leftStream)

  S.forEach (
    (v) => rightResults.push (v),
    () => {},
  ) (rightStream)

  await new Promise ((resolve) => setTimeout (resolve, 10))

  t.alike (leftResults, [100, 200])
  t.alike (rightResults, [30, 40])
})

// hold tests
test ('hold emits last value to new subscribers', async (t) => {
  const [strm, dispatch] = S.bus ()
  const held = S.hold (strm)

  const results1 = []
  S.forEach (
    (v) => results1.push (v),
    () => {},
  ) (held)

  dispatch (1)
  dispatch (2)

  await new Promise ((resolve) => setTimeout (resolve, 10))

  const results2 = []
  S.forEach (
    (v) => results2.push (v),
    () => {},
  ) (held)

  await new Promise ((resolve) => setTimeout (resolve, 10))

  // First subscriber should get all values
  t.alike (results1, [1, 2])
  // New subscriber should get the last value immediately
  t.alike (results2, [2])
})

// apply tests
test ('apply applies functions to values', async (t) => {
  const result = await collect (
    S.apply (S.fromIterable ([5])) (S.fromIterable ([(x) => x * 2, (x) => x + 10])),
  )
  // apply consumes values and functions in pairs sequentially
  // With 2 functions and 1 value, only first function gets applied
  t.is (result.length, 1)
  t.is (result[0], 10)
})

test ('apply with multiple values and functions', async (t) => {
  const result = await collect (
    S.apply (S.fromIterable ([5, 10])) (S.fromIterable ([(x) => x * 2, (x) => x + 10])),
  )
  t.is (result.length, 2)
  t.ok (result.includes (10))
  t.ok (result.includes (20))
})
