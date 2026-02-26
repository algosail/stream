import type { Maybe } from '@algosail/maybe'
import type { Either } from '@algosail/either'
import type { Pair } from '@algosail/pair'

export interface Stream<A> {
  readonly tag: 'stream'
  readonly run: (sink: Sink<A>) => Disposable
}

export interface Sink<A> {
  readonly event: (a: A) => void
  readonly end: (reason?: unknown) => void
}

export interface Disposable {
  [Symbol.dispose](): void
}

export type TypeOf<U> = U extends Stream<infer A> ? A : never

export function isStream(value: unknown): value is Stream<unknown>
export function isSink(value: unknown): value is Sink<unknown>
export function isDisposable(value: unknown): value is Disposable

export function stream<A>(run: (sink: Sink<A>) => Disposable): Stream<A>
export function sink<A>(
  event: (a: A) => void,
  end: (reason?: unknown) => void,
): Sink<A>
export function disposable(dispose: () => void): Disposable
export function disposeNone(): Disposable
export function dispose(disposable: Disposable): void

export function run<A>(sink: Sink<A>): (stream: Stream<A>) => Disposable
export function forEach<A>(
  onEvent: (a: A) => void,
  onEnd?: (reason?: unknown) => void,
): (stream: Stream<A>) => Disposable

export function never<A>(): Stream<A>
export function wrap<A>(a: A): Stream<A>
export function fromIterable<A>(iterable: Iterable<A>): Stream<A>
export function fromPromise<A>(promise: Promise<A>): Stream<A>
export function at(time: number): Stream<number>
export function periodic(period: number): Stream<number>
export function range(
  step?: number,
  start?: number,
  count?: number,
): Stream<number>

export function map<A, B>(fn: (a: A) => B): (strm: Stream<A>) => Stream<B>
export function filter<A>(
  predicate: (a: A) => boolean,
): (strm: Stream<A>) => Stream<A>
export function filterMap<A, B>(
  fn: (a: A) => Maybe<B>,
): (strm: Stream<A>) => Stream<B>
export function scan<A, B>(
  scanner: (acc: B, value: A) => B,
  seed: B,
): (strm: Stream<A>) => Stream<B>
export function loop<A, B, S>(
  step: (state: S, value: A) => [S, B],
  seed: S,
): (strm: Stream<A>) => Stream<B>
export function distinct<A>(
  compare: (a: A, b: A) => boolean,
): (strm: Stream<A>) => Stream<A>

export function withIndex(
  start?: number,
  step?: number,
): (strm: Stream<unknown>) => Stream<[number, unknown]>
export function withCount<A>(strm: Stream<A>): Stream<[number, A]>
export function count<A>(strm: Stream<A>): Stream<number>

export function take<A>(n: number): (strm: Stream<A>) => Stream<A>
export function takeUntil<A>(
  predicate: (a: A) => boolean,
): (strm: Stream<A>) => Stream<A>

export function join<A>(
  concurrency?: number,
  strategy?: 'hold' | 'drop' | 'swap',
): (strm: Stream<Stream<A>>) => Stream<A>
export function merge<A, B>(a: Stream<A>, b: Stream<B>): Stream<A | B>
export function mergeArray<A>(streams: Stream<A>[]): Stream<A>
export function concat<A>(second: Stream<A>): (first: Stream<A>) => Stream<A>
export function flatmap<A, B>(
  fn: (a: A) => Stream<B>,
  concurrency?: number,
): (strm: Stream<A>) => Stream<B>
export function switchmap<A, B>(
  fn: (a: A) => Stream<B>,
  concurrency?: number,
): (strm: Stream<A>) => Stream<B>
export function exhaustmap<A, B>(
  fn: (a: A) => Stream<B>,
  concurrency?: number,
): (strm: Stream<A>) => Stream<B>
export function startWith<A>(value: A): (strm: Stream<A>) => Stream<A>

export function combine<A, B, C>(
  fn: (a: A, b: B) => C,
  a$: Stream<A>,
  b$: Stream<B>,
): Stream<C>
export function combineArray<T extends unknown[], R>(
  fn: (...args: T) => R,
  streams: { [K in keyof T]: Stream<T[K]> },
): Stream<R>
export function withLatest<A, B>(
  second: Stream<B>,
): (first: Stream<A>) => Stream<[A, B]>
export function apply<A, B>(
  strm: Stream<A>,
): (sfn: Stream<(a: A) => B>) => Stream<B>

export function partition<A>(
  predicate: (a: A) => boolean,
): (strm: Stream<A>) => Pair<Stream<A>, Stream<A>>
export function partitionMap<A, B, C>(
  predicate: (a: A) => Either<B, C>,
): (strm: Stream<A>) => Pair<Stream<B>, Stream<C>>

export function multicast<A>(strm: Stream<A>): Stream<A>
export function hold<A>(strm: Stream<A>): Stream<A>
export function bus<A>(): [Stream<A>, (a: A) => void]
export function reduce<A, E>(
  fn: (acc: A, event: E) => A,
  init: A,
): (strm: Stream<E>) => Stream<A>
export function collect<A>(strm: Stream<A>): Promise<A[]>
