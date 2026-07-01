import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for the Meeting Capture Assistant.
 *
 *  - dialect: `turso` — the libSQL driver (`@libsql/client`). libSQL is a
 *    SQLite fork with the identical file format + SQL dialect; it is production
 *    for this single-user local tool and ships prebuilt native bindings.
 *  - schema: the Drizzle table definitions.
 *  - out: generated SQL migrations (committed to git so `db:migrate` is
 *    reproducible; the DB file itself lives under the gitignored `data/`).
 *  - dbCredentials.url: an absolute `file:` URL from DATABASE_URL, else default.
 *
 * Note: drizzle-kit does not load `.env` here — the default path keeps
 * `db:generate` / `db:migrate` working with no env set (as the gate runs them).
 * libSQL does NOT create the parent directory of the DB file, so we ensure
 * `data/` exists here (config is evaluated before `migrate` opens the file);
 * otherwise `drizzle-kit migrate` fails with "Unable to open connection: 14".
 */
function toFileUrl(raw: string | undefined): string {
  const p = raw ?? "./data/meetings.db";
  // Strip a `file:` scheme if present, resolve to an absolute path, ensure the
  // directory exists, then build an absolute `file://` URL libSQL accepts.
  const bare = p.startsWith("file:") ? p.slice("file:".length) : p;
  const abs = isAbsolute(bare) ? bare : resolve(__dirname, bare);
  mkdirSync(dirname(abs), { recursive: true });
  return pathToFileURL(abs).href;
}

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: toFileUrl(process.env.DATABASE_URL),
  },
});
