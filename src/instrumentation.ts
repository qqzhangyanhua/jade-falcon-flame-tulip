export async function register() {
  // Edge instrumentation cannot load PGLite/pg; only the Node runtime boots SQL.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDbReady } = await import("@/lib/db");
    await ensureDbReady();
  }
}
