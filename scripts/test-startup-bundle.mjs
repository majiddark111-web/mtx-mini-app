import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import console from 'node:console';
import process from 'node:process';
import { URL, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Follow static imports only: wallet code must be reachable on the wallet route,
// but not on a cold visit to Home. Inspect modules, not hashed chunk names.
const result = await build({ configLoader: 'native', logLevel: 'error', build: { write: false } });
const chunks = new Map(result.output.filter(item => item.type === 'chunk').map(item => [item.fileName, item]));
const route = suffix => {
  const matches = [...chunks.values()].filter(chunk => chunk.facadeModuleId?.replaceAll('\\', '/').endsWith(suffix));
  assert.equal(matches.length, 1, 'Missing or ambiguous bundle entry: ' + suffix);
  return matches[0];
};
function closure(roots) {
  const visited = new Set();
  function visit(chunk) {
    if (visited.has(chunk)) return;
    visited.add(chunk);
    for (const path of chunk.imports) if (chunks.has(path)) visit(chunks.get(path));
  }
  roots.forEach(visit);
  return [...visited];
}
const entry = [...chunks.values()].find(chunk => chunk.isEntry);
assert.ok(entry, 'Missing application entry');
const home = closure([entry, route('/pages/HomePage.tsx')]);
const wallet = closure([route('/pages/WalletPage.tsx')]);
const includesWalletSDK = chunks => chunks.some(chunk =>
  Object.keys(chunk.modules).some(id => id.replaceAll('\\', '/').includes('/node_modules/@tonconnect/')));
console.log('Cold Home JavaScript (gzip bytes, per file):', home.reduce((total, chunk) => total + gzipSync(chunk.code).length, 0));
assert.ok(!includesWalletSDK(home), 'Home eagerly includes the TON Connect SDK');
assert.ok(includesWalletSDK(wallet), 'Wallet route is missing the TON Connect SDK');
console.log('PASS: wallet SDK is available to Wallet but excluded from cold Home.');

if (process.argv.includes('--browser')) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href : 'playwright');
  const browser = await chromium.launch({ executablePath: process.env.REWARDS_BROWSER_PATH, headless: true });
  try {
    const origin = 'http://127.0.0.1:4189';
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const output = new Map(result.output.map(item => ['/' + item.fileName, item]));
    const sdkFiles = new Set(wallet.filter(chunk => includesWalletSDK([chunk])).map(chunk => '/' + chunk.fileName));
    const loadedSDK = new Set(), errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || route.request().method() !== 'GET') return route.abort();
      const item = output.get(url.pathname === '/' ? '/index.html' : url.pathname);
      if (!item) return route.fulfill({ status: 404, body: '' });
      if (sdkFiles.has(url.pathname)) loadedSDK.add(url.pathname);
      const contentType = item.type === 'chunk' ? 'text/javascript' : item.fileName.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({ contentType, body: item.type === 'chunk' ? item.code : item.source });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Tap. Earn. Level up.' }).waitFor();
    assert.equal(loadedSDK.size, 0, 'Browser prefetched wallet code on Home');
    await page.getByRole('link', { name: /Wallet/ }).click();
    await page.getByRole('heading', { name: 'Wallet', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Connect TON Testnet wallet' }).waitFor();
    assert.deepEqual(loadedSDK, sdkFiles);
    assert.deepEqual(errors, []);
    console.log('PASS: cold Home → Wallet navigation in Chromium; no external requests were forwarded.');
  } finally { await browser.close(); }
}
