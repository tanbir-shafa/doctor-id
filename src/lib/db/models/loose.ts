/**
 * Lint-safe loose typing for the deliberately untyped model/schema escape
 * hatches.
 *
 * Several models are exported as `Model<unknown>` (see the `models.X ?? model()`
 * pattern), and call sites cast through a tiny ad-hoc shape to reach query
 * methods. That shape used the bare `Function` type, which trips
 * `@typescript-eslint/no-unsafe-function-type`. `Loose` is a precise,
 * behavior-neutral replacement: a chainable + awaitable query surface plus the
 * handful of model/schema methods the codebase actually calls. It is a
 * **type-only** construct — nothing here runs.
 */

/** A chainable, awaitable Mongoose-query stand-in. */
export interface LooseQuery<T = unknown> extends Promise<T> {
  sort(arg?: unknown): LooseQuery<T>;
  select(arg?: unknown): LooseQuery<T>;
  skip(n: number): LooseQuery<T>;
  limit(n: number): LooseQuery<T>;
  populate(...args: unknown[]): LooseQuery<T>;
  lean<R = T>(): LooseQuery<R>;
  exec(): Promise<T>;
}

/** A hydrated-document stand-in (get/set/save + arbitrary fields). */
export interface LooseDoc {
  _id: unknown;
  get(path: string): unknown;
  set(path: string, value?: unknown): unknown;
  save(): Promise<unknown>;
  [key: string]: unknown;
}

/** Union of the model + schema methods the loose casts reach. */
export interface Loose {
  // Model query methods
  find(filter?: unknown, projection?: unknown): LooseQuery<LooseDoc[]>;
  findOne(filter?: unknown, projection?: unknown): LooseQuery<LooseDoc | null>;
  findById(id?: unknown): LooseQuery<LooseDoc | null>;
  findOneAndUpdate(...args: unknown[]): LooseQuery<LooseDoc | null>;
  countDocuments(filter?: unknown): LooseQuery<number>;
  distinct(field: string, filter?: unknown): LooseQuery<unknown[]>;
  aggregate(pipeline?: unknown): LooseQuery<unknown[]>;
  create(doc?: unknown): Promise<LooseDoc>;
  updateOne(...args: unknown[]): Promise<unknown>;
  updateMany(...args: unknown[]): Promise<unknown>;
  deleteOne(...args: unknown[]): Promise<unknown>;
  deleteMany(...args: unknown[]): Promise<unknown>;
  bulkWrite(...args: unknown[]): Promise<unknown>;
  // Schema hook / event methods
  pre(...args: unknown[]): unknown;
  post(...args: unknown[]): unknown;
  on(...args: unknown[]): unknown;
  index(...args: unknown[]): unknown;
}
