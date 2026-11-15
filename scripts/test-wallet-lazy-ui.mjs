/* global document, window */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { resolve } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { beginCell } from '@ton/core';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href : 'playwright');
const origin = 'http://127.0.0.1:4200';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {Buffer} from 'buffer';
import {setApiSession} from '/src/api/httpClient.ts';
import {useAppStore} from '/src/store/useAppStore.ts';
window.Buffer=Buffer; window.reviewSends=[];
window.reviewAccount=(id='review')=>{
 const now=Math.floor(Date.now()/1000);
 setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:id,iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
 useAppStore.setState({authStatus:'authenticated',user:{id,username:id,avatar:'',isAdmin:false}});
};
window.reviewAccount();
let offset=0; const now=Date.now;
Date.now=()=>now()+offset; window.reviewAdvance=()=>{offset+=180000;};
const root=createRoot(document.getElementById('root'));
window.reviewUnmount=()=>root.unmount();
import('/src/pages/WalletPage.tsx').then(({WalletPage})=>root.render(React.createElement(BrowserRouter,null,React.createElement(WalletPage))));
`;
const sdk = `
export const TonConnectUIProvider=({children})=>children,TonConnectButton=()=>null;
export const useIsConnectionRestored=()=>true,useTonAddress=()=>'fixture',useTonWallet=()=>({account:{chain:'-3',address:'fixture'}});
export const useTonConnectUI=()=>[{sendTransaction:async request=>{window.reviewSends.push(request);return {};}}];
`;
const built = await build({ configFile: false, publicDir: false, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, plugins: [{
  name: 'wallet-lazy', enforce: 'pre',
  resolveId(id) { if (id === '/rewards-review-entry.js') return '\0wallet-lazy'; if (id === '@tonconnect/ui-react') return '\0wallet-fixture'; },
  load(id) { if (id === '\0wallet-lazy') return entry; if (id === '\0wallet-fixture') return sdk; },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
const encoders = new Set(built.output.filter(item => item.type === 'chunk' && Object.keys(item.modules).some(id => id.replaceAll('\\', '/').includes('/node_modules/@ton/core/'))).map(item => '/' + item.fileName));
assert.ok(encoders.size > 0, 'real encoder must be present');
const browser = await chromium.launch({ headless: true, executablePath: process.env.REWARDS_BROWSER_PATH });
let passed = 0;
try {
  for (const scenario of ['normal', 'double-click', 'load-failed', 'expired-during-load', 'account-during-load', 'unmount-during-load', 'replayed', 'already-expired']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    const errors = [], unexpected = [], releases = [];
    let creates = 0, confirms = 0, encoderRequests = 0;
    const order = { transactionId: 'ton_' + 'a'.repeat(32), recipient: '0:' + '1'.repeat(64), amountNano: 10000000, creditedCoins: 100, expiresAt: Date.now() + (scenario === 'already-expired' ? -10000 : 120000), replayed: scenario === 'replayed' };
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
      if (url.pathname === '/api/wallet/payments/intents') {
        if (method === 'GET') return route.fulfill({ json: { intents: [], hasMore: false } });
        assert.equal(method, 'POST');
        const body = route.request().postDataJSON();
        assert.equal(body.sourceAddress, 'fixture'); assert.ok(body.idempotencyKey);
        creates++; return route.fulfill({ json: order });
      }
      if (url.pathname === '/api/wallet/transactions') return route.fulfill({ json: { transactions: [] } });
      if (url.pathname === '/api/wallet/payments/confirm') { confirms++; return route.abort(); }
      if (encoders.has(url.pathname)) {
        encoderRequests++;
        await new Promise(resolve => releases.push(resolve));
        if (scenario === 'load-failed') return route.abort('connectionfailed');
      }
      const path = url.pathname === '/wallet' ? '/tests/ui/rewards.html' : url.pathname;
      const body = files.get(path);
      if (body === undefined || method !== 'GET') { unexpected.push(url.href); return route.abort(); }
      return route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/wallet');
    const buy = page.locator('.wallet-card > .button.primary');
    await page.waitForFunction(() => document.querySelector('.wallet-card > .button.primary')?.disabled === false);
    assert.equal(encoderRequests, 0, 'viewing Wallet must not load the encoder');
    if (scenario === 'double-click') await buy.evaluate(el => { el.click(); el.click(); });
    else await buy.click();
    if (['replayed', 'already-expired'].includes(scenario)) {
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Previous order recovered'));
      assert.equal(encoderRequests, 0);
    } else {
      for (let i = 0; !releases.length && i < 200; i++) await page.waitForTimeout(25);
      assert.ok(releases.length > 0, 'encoder request not observed');
      assert.equal(creates, 1);
      assert.equal(await buy.isDisabled(), true);
      assert.equal(await page.evaluate(() => window.reviewSends.length), 0);
      if (scenario === 'expired-during-load') await page.evaluate(() => window.reviewAdvance());
      if (scenario === 'account-during-load') await page.evaluate(() => window.reviewAccount('other'));
      if (scenario === 'unmount-during-load') await page.evaluate(() => window.reviewUnmount());
      for (const release of releases) release();
      if (['normal', 'double-click'].includes(scenario)) await page.waitForFunction(() => window.reviewSends.length === 1);
      else if (scenario === 'load-failed') await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Wallet outcome'));
      else if (scenario === 'expired-during-load') await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Previous order recovered'));
      else await page.waitForLoadState('networkidle');
    }
    const sends = await page.evaluate(() => window.reviewSends);
    if (['normal', 'double-click'].includes(scenario)) {
      assert.deepEqual(sends, [{ validUntil: Math.floor(order.expiresAt / 1000), network: '-3', from: 'fixture', messages: [{ address: order.recipient, amount: String(order.amountNano), payload: beginCell().storeUint(0, 32).storeStringTail(order.transactionId).endCell().toBoc().toString('base64') }] }]);
    } else assert.deepEqual(sends, []);
    const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mtx.ton.pending.v2:review')));
    assert.equal(saved.length, 1); assert.equal(saved[0].transactionId, order.transactionId);
    assert.equal(creates, 1); assert.equal(confirms, 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('WALLET_LAZY_UI_PASS', scenario); passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_WALLET_LAZY_UI_PASS', passed, 'isolated scenarios; real encoder with stubbed wallet and API');
