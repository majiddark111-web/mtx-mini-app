import { handleRequest } from './src/app.ts';
import { startFetchServer } from './nodeHttp.mjs';

const port = Number(process.env.PORT || '3000');
const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  APP_ORIGIN: process.env.APP_ORIGIN || 'http://localhost:5173',
  AUTH_MAX_AGE_SECONDS: process.env.AUTH_MAX_AGE_SECONDS || '300',
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
};

startFetchServer({ fetchHandler: (request) => handleRequest(request, env), host: '127.0.0.1', port, label: 'MTX development API' });
