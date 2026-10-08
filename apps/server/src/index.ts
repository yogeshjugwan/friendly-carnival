import { config } from './config.ts';
import { createApp } from './app.ts';
import { StripeBilling } from './billing.ts';
import { ConsoleMailer, ResendMailer } from './mailer.ts';
import { createStores } from './store-factory.ts';

const stores = await createStores(config.databaseUrl);
const mailer = config.resendApiKey ? new ResendMailer(config.resendApiKey, config.mailFrom) : new ConsoleMailer();
const billing = config.stripe ? new StripeBilling(config.stripe.secretKey, config.stripe.webhookSecret, config.stripe.prices) : null;
const app = createApp({
  store: stores.safety,
  accounts: stores.accounts,
  mailer,
  persistent: stores.persistent,
  billing,
  // Proof of work before matching; GUARD_POW=off turns it off (e.g. for load tests).
  requireProof: process.env.GUARD_POW !== 'off',
  // "People are online" emails to inactive users, only when emails really go out.
  winback: !!config.resendApiKey && process.env.WINBACK_EMAILS !== 'off',
});
if (!billing) console.warn('[rc-server] Stripe not configured: Plus checkout is disabled');

if (!config.adminToken) console.warn('[rc-server] ADMIN_TOKEN not set: the admin dashboard API is disabled');
if (!config.resendApiKey) console.warn('[rc-server] RESEND_API_KEY not set: account emails are printed to this log');
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
