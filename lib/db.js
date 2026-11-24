import mongoose from "mongoose";

// One shared connection, reused across requests (and across hot reloads in dev).
const cached = globalThis.__mongoose || (globalThis.__mongoose = { conn: null, promise: null });

export async function connectDb() {
  if (cached.conn) return cached.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add it to .env.local (see .env.example).");
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10_000 })
      .catch((err) => {
        cached.promise = null; // allow a retry on the next request
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
