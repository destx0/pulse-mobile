// Recognises errors from a native SQLite connection that died under a live JS runtime (see `healing` in db.ts).
// Pure, so it can be tested without the native module.
// A lock is not a dead connection: the handle is fine, another writer has it, and reopening would only lose the queue's
// place. `openDb` waits those out instead.
export const isDeadConnection = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  if (/database is locked|database table is locked|SQLITE_BUSY/i.test(m)) return false;
  return /NativeDatabase|NativeStatement/.test(m) && /NullPointerException|closed|AccessClosedResource|has been rejected/i.test(m);
};
