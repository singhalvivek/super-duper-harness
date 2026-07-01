import type { NextConfig } from "next";

/**
 * Next.js 15 App Router config for the Meeting Capture Assistant web app.
 *
 * The `/api/*` Route Handlers each pin `export const runtime = "nodejs"`
 * (they use the libSQL native driver + Node crypto, which the Edge runtime
 * cannot load). `serverExternalPackages` keeps the native `@libsql/client`
 * binding out of the server bundle so it is required at runtime from
 * node_modules rather than being (incorrectly) traced/bundled.
 *
 * `@meeting-capture/shared` is imported as workspace TypeScript source, so it
 * is transpiled by Next rather than being pre-built.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  transpilePackages: ["@meeting-capture/shared"],
};

export default nextConfig;
