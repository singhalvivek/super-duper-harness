import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * The SQLite (libSQL) + Drizzle client for the web app.
 *
 * libSQL is a SQLite fork with the identical on-disk file format and SQL
 * dialect; it is the production engine for this single-user local tool. Tests
 * use the SAME engine (a temp `.db` file per run) via `openDb(path)` — never a
 * lighter substitute. The `@libsql/client` driver ships prebuilt native
 * bindings, so it runs on the project's Node version without a local C++
 * toolchain.
 *
 * The default DB file is `packages/web/data/meetings.db` (overridable with the
 * `DATABASE_URL` env var, a file path OR a `file:` URL). `data/` is gitignored.
 * Foreign keys are enforced per-connection so the `transcript_lines → meetings`
 * ON DELETE CASCADE fires.
 */

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Resolve a RELATIVE DB path against the process working directory, NOT this
 * file's `__dirname`.
 *
 * At dev/start time the app runs with `cwd = packages/web` (that is where
 * `next dev` / `next start` execute under the pnpm filter, and where
 * `drizzle-kit migrate` reads its config from). Under a bundled `next start`,
 * `__dirname` points INSIDE `.next/server/app/…`, so a `__dirname`-relative
 * default resolved to `.next/server/app/data/meetings.db` — a NEW, empty,
 * unmigrated file — instead of the migrated `packages/web/data/meetings.db`.
 * Resolving from `process.cwd()` makes the runtime DB target identical to the
 * `drizzle-kit migrate` target (drizzle.config.ts also resolves from cwd), so
 * reads/writes hit the SAME migrated file.
 */
function packageRoot(): string {
  return process.cwd();
}

/** Resolve a raw DATABASE_URL/path into an absolute local file path. */
function resolveDbFilePath(raw: string): string {
  // Accept a `file:` URL or a bare path; normalize to an absolute fs path.
  const p = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  // Absolute paths / `file:` URLs are honored as-is; only relative paths are
  // resolved (against the working dir — see packageRoot()).
  return isAbsolute(p) ? p : resolve(packageRoot(), p);
}

/** Build the `file:` URL libSQL expects from an absolute fs path. */
function toFileUrl(absPath: string): string {
  return pathToFileURL(absPath).href;
}

/**
 * Open a Drizzle client backed by a real libSQL/SQLite file at an arbitrary
 * path. Ensures the containing directory exists and enables foreign-key
 * enforcement. Tests point this at a temp file so they run on the production
 * engine.
 */
export function openDb(dbPath: string): { db: DbClient; client: Client } {
  const filePath = resolveDbFilePath(dbPath);
  mkdirSync(dirname(filePath), { recursive: true });

  const client = createClient({ url: toFileUrl(filePath) });
  // Enforce foreign keys (SQLite/libSQL default them OFF). Fire-and-forget is
  // fine: subsequent queries are queued after this on the same connection.
  void client.execute("PRAGMA foreign_keys = ON;");

  const db = drizzle(client, { schema });
  return { db, client };
}

/** The default DB file path (from DATABASE_URL or the local default). */
export function defaultDbPath(): string {
  return process.env.DATABASE_URL ?? "./data/meetings.db";
}

/**
 * Lazily-created process-wide singleton client on the default DB file. A
 * module-level singleton reuses one libSQL connection across Route Handler
 * invocations in the same Node process.
 */
let singleton: { db: DbClient; client: Client } | null = null;

export function getDb(): DbClient {
  if (!singleton) {
    const filePath = resolveDbFilePath(defaultDbPath());
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true });
    }
    singleton = openDb(defaultDbPath());
  }
  return singleton.db;
}

/**
 * Close the singleton libSQL connection (if open) and reset it so the next
 * `getDb()` reopens fresh. libSQL holds the underlying `.db` file open for the
 * life of the `Client`; on Windows that file cannot be deleted while open, so
 * tests MUST call this before removing a temp DB (otherwise `rmSync` throws
 * EPERM). Safe in prod too — it is a no-op unless a singleton exists, and is
 * only wired into test teardown / graceful shutdown.
 */
export async function closeDb(): Promise<void> {
  if (singleton) {
    singleton.client.close();
    singleton = null;
  }
}

export { schema };
