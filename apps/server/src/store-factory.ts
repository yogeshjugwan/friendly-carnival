import { MemoryStore, type SafetyStore } from './store.ts';

/** Postgres when DATABASE_URL is set, otherwise an in-memory store (data is lost on restart). */
export async function createStore(databaseUrl: string | undefined): Promise<SafetyStore> {
  if (!databaseUrl) {
    console.warn('[rc-server] DATABASE_URL not set: reports and bans are kept in memory and lost on restart');
    const store = new MemoryStore();
    await store.init();
    return store;
  }
  const [{ default: pg }, { PostgresStore }] = await Promise.all([import('pg'), import('./store-postgres.ts')]);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    // Hosted Postgres (Neon, Supabase, Render) requires TLS; localhost usually does not.
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  });
  const store = new PostgresStore(pool);
  await store.init();
  console.log('[rc-server] using Postgres for safety data');
  return store;
}
