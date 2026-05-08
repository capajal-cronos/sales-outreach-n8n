// Driver selector. Both drivers expose the same surface so callers don't
// branch on DB_DRIVER. Picked once at module load.

import 'dotenv/config';

const driver = (process.env.DB_DRIVER || 'json').toLowerCase();

let module;
if (driver === 'json') {
  module = await import('./jsonDriver.js');
} else if (driver === 'postgres') {
  module = await import('./postgresDriver.js');
} else {
  throw new Error(`Unknown DB_DRIVER "${driver}". Expected "json" or "postgres".`);
}

export const DB_DRIVER = driver;

export const init = module.init;
export const apolloPending = module.apolloPending;
export const emailQueue = module.emailQueue;
export const sentEmails = module.sentEmails;
export const responses = module.responses;

// Optional helpers — only the postgres driver implements these.
export const ping = module.ping || (async () => {});
export const close = module.close || (async () => {});
