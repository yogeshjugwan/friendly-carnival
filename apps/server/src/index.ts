import { config } from './config.ts';
import { createApp } from './app.ts';

const app = createApp();

app.http.listen(config.port, () => {
  console.log(`[rc-server] listening on :${config.port} (origins: ${config.webOrigins.join(', ')})`);
});

const shutdown = () => {
  app.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
