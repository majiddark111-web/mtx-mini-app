import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { walletManifest } from './config.mjs';

await writeFile(new URL('../../dist/tonconnect-manifest.json', import.meta.url), `${JSON.stringify(walletManifest(process.env.MTX_DOMAIN), null, 2)}\n`);
