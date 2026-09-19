import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, access, chown } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appOrigin } from './config.mjs';

export async function initializeDeployment(directory, domain, identity = { uid: process.getuid?.() ?? 1000, gid: process.getgid?.() ?? 1000 }) {
  appOrigin(domain);
  const destination = resolve(directory);
  const envFile = join(destination, '.env');
  try { await access(envFile); throw new Error('Deployment .env already exists; nothing was replaced'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // mkdir without recursive is deliberate: existing credentials are never rotated silently.
  const secrets = join(destination, 'secrets');
  await mkdir(secrets, { mode: 0o700 });
  const template = JSON.parse(await readFile(new URL('../../deploy/api.example.json', import.meta.url), 'utf8'));
  template.JWT_SECRET = randomBytes(32).toString('hex');
  template.ADMIN_JWT_SECRET = randomBytes(32).toString('hex');
  const uid = identity.uid === 0 ? 1000 : identity.uid;
  const gid = identity.gid === 0 ? 1000 : identity.gid;
  const values = {
    'api.json': JSON.stringify(template, null, 2) + '\n',
    'postgres-password': randomBytes(32).toString('hex'),
    'postgres-admin-password': randomBytes(32).toString('hex'),
    'redis-password': randomBytes(32).toString('hex'),
  };
  for (const [name, value] of Object.entries(values)) {
    const path = join(secrets, name);
    await writeFile(path, value, { flag: 'wx', mode: 0o600 });
    if (process.getuid?.() === 0) await chown(path, uid, gid);
  }
  await writeFile(envFile, `MTX_DOMAIN=${domain.toLowerCase()}\nMTX_BOT_USERNAME=TOKXTAPBOT\nMTX_UID=${uid}\nMTX_GID=${gid}\n`, { flag: 'wx', mode: 0o600 });
  return { filesCreated: 5 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await initializeDeployment(fileURLToPath(new URL('../../deploy/', import.meta.url)), process.argv[2]);
  process.stdout.write('MTX deployment files created. Fill deploy/secrets/api.json privately; no secrets were printed.\n');
}
