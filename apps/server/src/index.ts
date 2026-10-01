import { config } from './config.ts';
import { createApp } from './app.ts';
import { createStore } from './store-factory.ts';

const store = await createStore(config.databaseUrl);
const app = createApp({ store });

if (!config.adminToken) console.warn('[rc-server] ADMIN_TOKEN not set: the admin dashboard API is disabled');
if (config.ipSalt === 'dev-only-salt' && process.env.NODE_ENV === 'production') {
  console.warn('[rc-server] IP_SALT not set: using the development salt');
}

app.http.listen(config.port, () => {
  console.log(`[rc-server] listening on :${config.port} (origins: ${config.webOrigins.join(', ')})`);
});

const shutdown = () => {
  app.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
