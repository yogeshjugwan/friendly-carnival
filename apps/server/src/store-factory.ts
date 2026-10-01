import { MemoryAccountStore, PostgresAccountStore, type AccountStore } from './accounts.ts';
import { MemoryStore, type SafetyStore } from './store.ts';

export interface Stores {
  safety: SafetyStore;
  accounts: AccountStore;
  persistent: boolean;
}

/** Postgres when DATABASE_URL is set, otherwise in-memory stores (data is lost on restart). */
export async function createStores(databaseUrl: string | undefined): Promise<Stores> {
  if (!databaseUrl) {
    console.warn('[rc-server] DATABASE_URL not set: accounts, reports and bans are kept in memory and lost on restart');
    return { safety: new MemoryStore(), accounts: new MemoryAccountStore(), persistent: false };
  }
  const [{ default: pg }, { PostgresStore }] = await Promise.all([import('pg'), import('./store-postgres.ts')]);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    // Hosted Postgres (Neon, Supabase, Render) requires TLS; localhost usually does not.
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  });
  const safety = new PostgresStore(pool);
  const accounts = new PostgresAccountStore(pool);
  await safety.init();
  await accounts.init();
  console.log('[rc-server] using Postgres for accounts and safety data');
  return { safety, accounts, persistent: true };
}
