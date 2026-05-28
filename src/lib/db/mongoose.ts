/**
 * Cached Mongoose connection.
 *
 * Next.js dev mode hot-reloads modules but doesn't recreate the Node process,
 * so a naive `mongoose.connect()` on every import leaks connections. We cache
 * the connection promise on `globalThis` so it survives HMR.
 */

import mongoose from "mongoose";
import { env } from "@/lib/env";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as unknown as { __mongooseCache?: MongooseCache };

const cache: MongooseCache =
  globalForMongoose.__mongooseCache ?? (globalForMongoose.__mongooseCache = { conn: null, promise: null });

export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = env().MONGO_URI;
    cache.promise = mongoose
      .connect(uri, {
        // Cap pool so a single ECS task doesn't exhaust Atlas connections.
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
        // We use the Mongoose ODM; turn off command buffering so failed queries
        // surface immediately instead of queueing while disconnected.
        bufferCommands: false,
      })
      .then((m) => {
        // Index sync runs in the background. Mongoose 9 emits a warning if you
        // call `.createIndexes()` synchronously on every model on every boot;
        // each model file declares its indexes and Mongoose ensures them.
        return m;
      });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}

/** Disconnects — only used in tests and the seed script. */
export async function dbDisconnect(): Promise<void> {
  if (cache.conn) {
    await cache.conn.disconnect();
    cache.conn = null;
    cache.promise = null;
  }
}
