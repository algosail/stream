# @algosail/stream

Reactive stream library. Streams are lazy, pull-on-subscribe, and async-by-default (values are emitted via microtasks). Built on three primitives: `Stream`, `Sink`, and `Disposable`.

## Contents

**Primitives:** [stream](#stream) · [sink](#sink) · [disposable](#disposable) · [disposeNone](#disposenone) · [dispose](#dispose) · [run](#run) · [forEach](#foreach)

**Guards:** [isStream](#isstream) · [isSink](#issink) · [isDisposable](#isdisposable)

**Sources:** [never](#never) · [wrap](#wrap) · [fromIterable](#fromiterable) · [fromPromise](#frompromise) · [at](#at) · [periodic](#periodic) · [range](#range)

**Transformers:** [map](#map) · [filter](#filter) · [filterMap](#filtermap) · [scan](#scan) · [loop](#loop) · [distinct](#distinct) · [withIndex](#withindex) · [withCount](#withcount) · [count](#count) · [take](#take) · [takeUntil](#takeuntil) · [startWith](#startwith)

**Combining:** [join](#join) · [mergeArray](#mergearray) · [merge](#merge) · [concat](#concat) · [flatmap](#flatmap) · [switchmap](#switchmap) · [exhaustmap](#exhaustmap) · [combine](#combine) · [combineArray](#combinearray) · [withLatest](#withlatest) · [apply](#apply) · [partition](#partition) · [partitionMap](#partitionmap)

**Sharing:** [multicast](#multicast) · [hold](#hold) · [bus](#bus) · [reduce](#reduce)

**Utilities:** [collect](#collect)

---

## Primitives

### stream

```
stream :: (Sink a -> Disposable) -> Stream a
```

Low-level stream constructor. The function runs each time a sink subscribes and returns a `Disposable` for cleanup.

```js
const hello = stream((snk) => {
  snk.event('hello')
  snk.end()
  return disposeNone()
})
```

---

### sink

```
sink :: (a -> void) -> (reason -> void) -> Sink a
```

Creates a sink with an event handler and an end handler.

```js
const logger = sink(
  (value) => console.log('event:', value),
  () => console.log('done'),
)
```

---

### disposable

```
disposable :: (() -> void) -> Disposable
```

Wraps a cleanup function into a `Disposable` (implements `Symbol.dispose`).

```js
const dsp = disposable(() => clearTimeout(handle))
```

---

### disposeNone

```
disposeNone :: () -> Disposable
```

Returns a no-op `Disposable`. Use as a placeholder before a real disposable is assigned.

```js
let dsp = disposeNone()
dsp = run(mySink)(myStream)
```

---

### dispose

```
dispose :: Disposable -> void
```

Calls the disposable's cleanup function.

```js
dispose(dsp) // runs dsp[Symbol.dispose]()
```

---

### run

```
run :: Sink a -> Stream a -> Disposable
```

Subscribes a sink to a stream and returns a `Disposable` to cancel the subscription.

```js
const dsp = run(sink(console.log, () => {}))(wrap(42))
// later:
dispose(dsp)
```

---

### forEach

```
forEach :: (a -> void) -> (reason -> void)? -> Stream a -> Disposable
```

Convenience `run` — subscribes event and optional end callbacks.

```js
const dsp = forEach(console.log)(wrap(42))
const dsp2 = forEach(console.log, () => console.log('done'))(
  fromIterable([1, 2, 3]),
)
```

---

## Guards

### isStream / isSink / isDisposable

```
isStream     :: unknown -> Boolean
isSink       :: unknown -> Boolean
isDisposable :: unknown -> Boolean
```

```js
isStream(wrap(1)) // => true
isSink(
  sink(
    (x) => x,
    () => {},
  ),
) // => true
isDisposable(disposeNone()) // => true
isDisposable({ [Symbol.dispose]: () => {} }) // => true
```

---

## Sources

### never

```
never :: () -> Stream a
```

A stream that never emits and never ends.

```js
forEach(console.log)(never()) // nothing ever logged
```

---

### wrap

```
wrap :: a -> Stream a
```

Emits a single value asynchronously (next microtask), then ends.

```js
await collect(wrap(42)) // => [42]
await collect(wrap('hi')) // => ['hi']
```

---

### fromIterable

```
fromIterable :: Iterable a -> Stream a
```

Emits each element of an iterable, yielding between values via microtasks so the subscriber can cancel mid-way.

```js
await collect(fromIterable([1, 2, 3])) // => [1, 2, 3]
await collect(fromIterable('abc')) // => ['a', 'b', 'c']
await collect(fromIterable(new Set([1, 2, 2, 3]))) // => [1, 2, 3]
```

---

### fromPromise

```
fromPromise :: Promise a -> Stream a
```

Emits the resolved value then ends. Swallows rejections (calls `end` with no value).

```js
await collect(fromPromise(Promise.resolve(42))) // => [42]
await collect(fromPromise(Promise.reject('x'))) // => []
```

---

### at

```
at :: Number -> Stream Number
```

Emits the delay value once after `time` milliseconds, then ends.

```js
forEach(console.log)(at(500)) // logs 500 after 500ms
await collect(at(100)) // => [100]
```

---

### periodic

```
periodic :: Number -> Stream Number
```

Emits a cumulative elapsed time every `period` milliseconds, indefinitely.

```js
// Collect first 3 ticks of a 100ms timer
await collect(take(3)(periodic(100))) // => [100, 200, 300]
```

---

### range

```
range :: (step?, start?, count?) -> Stream Number
```

Emits an arithmetic sequence of numbers.

```js
await collect(range(1, 0, 5)) // => [0, 1, 2, 3, 4]
await collect(range(2, 0, 4)) // => [0, 2, 4, 6]
await collect(range(-1, 10, 3)) // => [10, 9, 8]
```

---

## Transformers

### map

```
map :: (a -> b) -> Stream a -> Stream b
```

Applies `fn` to every emitted value.

```js
await collect(map((x) => x * 2)(fromIterable([1, 2, 3]))) // => [2, 4, 6]
await collect(map(String)(range(1, 1, 3))) // => ['1', '2', '3']
```

---

### filter

```
filter :: (a -> Boolean) -> Stream a -> Stream a
```

Passes through only values that satisfy the predicate.

```js
await collect(filter((x) => x % 2 === 0)(fromIterable([1, 2, 3, 4, 5]))) // => [2, 4]
```

---

### filterMap

```
filterMap :: (a -> Maybe b) -> Stream a -> Stream b
```

Maps and keeps only `Just` results, discarding `Nothing`.

```js
await collect(
  filterMap((x) => (x > 2 ? just(x * 10) : nothing()))(
    fromIterable([1, 2, 3, 4]),
  ),
)
// => [30, 40]
```

---

### scan

```
scan :: ((acc, value) -> acc, acc) -> Stream value -> Stream acc
```

Emits the running accumulation after each event.

```js
await collect(scan((n, x) => n + x, 0)(fromIterable([1, 2, 3]))) // => [1, 3, 6]
await collect(scan((s, x) => [...s, x], [])(fromIterable([1, 2]))) // => [[1], [1,2]]
```

---

### loop

```
loop :: ((state, value) -> [state, output], state) -> Stream value -> Stream output
```

Like `scan` but emits a separate output value distinct from the accumulated state.

```js
// Emit previous value, carry current as state
await collect(loop((prev, cur) => [cur, prev], 0)(fromIterable([1, 2, 3])))
// => [0, 1, 2]
```

---

### distinct

```
distinct :: (a -> a -> Boolean) -> Stream a -> Stream a
```

Skips consecutive duplicate values.

```js
await collect(distinct((a, b) => a === b)(fromIterable([1, 1, 2, 2, 3, 2])))
// => [1, 2, 3, 2]
```

---

### withIndex

```
withIndex :: (start?, step?) -> Stream a -> Stream [index, a]
```

Pairs each value with an incrementing index.

```js
await collect(withIndex(0, 1)(fromIterable(['a', 'b', 'c'])))
// => [[0, 'a'], [1, 'b'], [2, 'c']]

await collect(withIndex(10, 10)(fromIterable(['x', 'y'])))
// => [[10, 'x'], [20, 'y']]
```

---

### withCount

```
withCount :: Stream a -> Stream [count, a]
```

Pairs each value with a 1-based counter.

```js
await collect(withCount(fromIterable(['a', 'b', 'c'])))
// => [[1, 'a'], [2, 'b'], [3, 'c']]
```

---

### count

```
count :: Stream a -> Stream Number
```

Emits the 1-based index of each event, discarding the original value.

```js
await collect(count(fromIterable(['a', 'b', 'c']))) // => [1, 2, 3]
```

---

### take

```
take :: Number -> Stream a -> Stream a
```

Emits at most `n` values, then disposes the source and ends.

```js
await collect(take(2)(fromIterable([1, 2, 3, 4]))) // => [1, 2]
await collect(take(0)(fromIterable([1, 2, 3]))) // => []
```

---

### takeUntil

```
takeUntil :: (a -> Boolean) -> Stream a -> Stream a
```

Emits values until the predicate is true for the emitted value (inclusive).

```js
await collect(takeUntil((x) => x >= 3)(fromIterable([1, 2, 3, 4, 5])))
// => [1, 2, 3]
```

---

### startWith

```
startWith :: a -> Stream a -> Stream a
```

Prepends a value before the stream's events.

```js
await collect(startWith(0)(fromIterable([1, 2, 3]))) // => [0, 1, 2, 3]
```

---

## Combining

### join

```
join :: (concurrency?, strategy?) -> Stream (Stream a) -> Stream a
```

Flattens a stream of streams. `strategy` controls overflow when `concurrency` is exceeded:

- `'hold'` (default) — queue incoming streams
- `'swap'` — dispose the oldest active stream, start new one
- `'drop'` — silently discard new streams while at capacity

```js
// Unlimited concurrency (default)
await collect(join()(fromIterable([wrap(1), wrap(2), wrap(3)])))
// => [1, 2, 3]

// Sequential (concurrency = 1)
await collect(join(1)(fromIterable([wrap('a'), wrap('b')])))
// => ['a', 'b']
```

---

### mergeArray / merge

```
mergeArray :: Array (Stream a) -> Stream a
merge      :: Stream a -> Stream b -> Stream (a | b)
```

Merge multiple streams concurrently.

```js
await collect(mergeArray([wrap(1), wrap(2), wrap(3)])) // => [1, 2, 3]
await collect(merge(wrap('a'), wrap('b'))) // => ['a', 'b']
```

---

### concat

```
concat :: Stream a -> Stream a -> Stream a
```

Appends the second stream after the first completes (sequential).

```js
await collect(concat(fromIterable([3, 4]))(fromIterable([1, 2])))
// => [1, 2, 3, 4]
```

---

### flatmap

```
flatmap :: (a -> Stream b) -> Stream a -> Stream b
```

Maps each value to a stream and flattens with unlimited concurrency.

```js
await collect(flatmap((x) => fromIterable([x, x * 2]))(fromIterable([1, 2, 3])))
// => [1, 2, 2, 4, 3, 6]  (order may vary)
```

---

### switchmap

```
switchmap :: (a -> Stream b) -> Stream a -> Stream b
```

Maps then switches — disposes the previous inner stream when a new one starts.

```js
await collect(switchmap((x) => wrap(x))(fromIterable([1, 2, 3])))
// => [3]  (only last wins, others disposed)
```

---

### exhaustmap

```
exhaustmap :: (a -> Stream b) -> Stream a -> Stream b
```

Maps then ignores new sources while one is already active.

```js
await collect(exhaustmap((x) => wrap(x))(fromIterable([1, 2, 3])))
// => [1]  (first wins, rest dropped)
```

---

### combine

```
combine :: (a -> b -> c) -> Stream a -> Stream b -> Stream c
```

Emits `fn(latestA, latestB)` whenever either stream emits (after both have emitted at least once).

```js
await collect(combine((a, b) => a + b, wrap(1), wrap(2))) // => [3]
```

---

### combineArray

```
combineArray :: ((...values) -> z) -> Array (Stream a) -> Stream z
```

Same as `combine` but for an array of streams.

```js
await collect(combineArray((a, b, c) => a + b + c, [wrap(1), wrap(2), wrap(3)]))
// => [6]
```

---

### withLatest

```
withLatest :: Stream b -> Stream a -> Stream [a, b]
```

Pairs each event from the first stream with the latest value from the second stream.

```js
const value$ = hold(wrap(42))
await collect(withLatest(value$)(wrap('click')))
// => [['click', 42]]
```

---

### apply

```
apply :: Stream (a -> b) -> Stream a -> Stream b
```

Zips a stream of functions with a stream of values in arrival order.

```js
await collect(apply(wrap(10))(wrap((x) => x + 1))) // => [11]
```

---

### partition

```
partition :: (a -> Boolean) -> Stream a -> [Stream a, Stream a]
```

Splits a stream into `[matching, non-matching]` pair.

```js
const [evens, odds] = partition((x) => x % 2 === 0)(fromIterable([1, 2, 3, 4]))
await collect(evens) // => [2, 4]
await collect(odds) // => [1, 3]
```

---

### partitionMap

```
partitionMap :: (a -> Either b c) -> Stream a -> [Stream c, Stream b]
```

Routes values into `[Right stream, Left stream]` via an `Either`-returning function.

```js
const [rights, lefts] = partitionMap((x) => (x > 2 ? right(x * 10) : left(x)))(
  fromIterable([1, 2, 3, 4]),
)

await collect(rights) // => [30, 40]
await collect(lefts) // => [1, 2]
```

---

## Sharing

### multicast

```
multicast :: Stream a -> Stream a
```

Shares a single source subscription among multiple subscribers. The source runs only once regardless of how many sinks subscribe.

```js
const shared = multicast(expensiveStream)
run(sinkA)(shared)
run(sinkB)(shared) // both receive the same events from one subscription
```

---

### hold

```
hold :: Stream a -> Stream a
```

Like `multicast`, but also replays the latest value to new subscribers.

```js
const value$ = hold(periodic(1000))

run(sinkA)(value$) // receives all future values
// 500ms later:
run(sinkB)(value$) // immediately receives the latest value, then future ones
```

---

### bus

```
bus :: () -> [Stream a, dispatch: (a -> void)]
```

Creates a stream/dispatch pair. Push values imperatively via `dispatch`.

```js
const [action$, dispatch] = bus()

run(sink(console.log, () => {}))(action$)
dispatch({ type: 'increment' }) // logs { type: 'increment' }
dispatch({ type: 'decrement' }) // logs { type: 'decrement' }
```

---

### reduce

```
reduce :: ((acc, a) -> acc, acc) -> Stream a -> Stream acc
```

Folds a stream into a held behaviour — combines `scan + startWith + hold`. New subscribers immediately receive the current accumulated value.

```js
const [click$, dispatch] = bus()
const count$ = reduce((n, _) => n + 1, 0)(click$)

run(sink(console.log, () => {}))(count$) // immediately logs 0
dispatch('click') // logs 1
dispatch('click') // logs 2
```

---

## Utilities

### collect

```
collect :: Stream a -> Promise (Array a)
```

Collects all emitted values into an array resolved when the stream ends. Mainly useful for testing.

```js
await collect(fromIterable([1, 2, 3])) // => [1, 2, 3]
await collect(take(3)(range(1, 0))) // => [0, 1, 2]
await collect(never()) // never resolves
```
