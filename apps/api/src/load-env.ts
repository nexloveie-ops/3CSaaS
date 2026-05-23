import { config } from 'dotenv';
import { resolve } from 'path';

/** In Cloud Run / Docker, env vars are injected — skip file load in production. */
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(__dirname, '../../../.env.local') });
  config({ path: resolve(__dirname, '../../../.env') });
}
