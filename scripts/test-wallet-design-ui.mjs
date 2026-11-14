/* global document, window, localStorage, innerWidth, getComputedStyle */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href : 'playwright');
const origin = 'http://127.0.0.1:4197';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {Buffer} from 'buffer';
import {HistoryPage} from '/src/pages/HistoryPage.tsx';
import {BottomNavigation} from '/src/components/navigation/BottomNavigation.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import {initializePreferences} from '/src/services/preferencesService.ts';
import '/src/index.css';
window.Buffer=Buffer;
initializePreferences();
const now=Math.floor(Date.now()/1000);
const guest=new URLSearchParams(location.search).get('state')==='guest';
if(!guest)setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'review',iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
useAppStore.setState({authStatus:guest?'demo':'authenticated',user:{id:'review',username:'Review',avatar:'',isAdmin:false}});
import('/src/pages/WalletPage.tsx').then(({WalletPage})=>createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement('div',{className:'app-shell'},React.createElement(location.pathname==='/wallet'?WalletPage:HistoryPage),React.createElement(BottomNavigation)))));
`;
// No real wallet is initialized, connected or asked to sign.
const sdk = `
import React from 'react';
export const TonConnectUIProvider=({children})=>children;
export const TonConnectButton=()=>React.createElement('button',{type:'button'},'Fixture wallet');
export const useIsConnectionRestored=()=>true;
export const useTonAddress=()=>'0:'+ 'a'.repeat(64);
export const useTonWallet=()=>({account:{chain:'-3',address:'fixture'}});
export const useTonConnectUI=()=>[{sendTransaction:async()=>{throw Error('Wallet sends forbidden in visual test');}}];
`;
const built = await build({ configFile: false, publicDir: false, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, plugins: [{
  name: 'wallet-design', enforce: 'pre',
  resolveId(id) { if (id === '/rewards-review-entry.js') return '\0wallet-design'; if (id === '@tonconnect/ui-react') return '\0wallet-fixture'; },
  load(id) { if (id === '\0wallet-design') return entry; if (id === '\0wallet-fixture') return sdk; },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
await mkdir('.build-verification/wallet-preview', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.REWARDS_BROWSER_PATH });
let passed = 0;
try {
  for (const kind of ['wallet', 'history']) for (const [width, height, language, theme, state] of [
    [390, 844, 'en', 'dark', 'normal'], [320, 568, 'fa', 'light', 'normal'], [430, 932, 'ar', 'system', 'normal'],
    [844, 390, 'en', 'dark', 'normal'], [768, 1024, 'en', 'light', 'normal'], [320, 568, 'en', 'light', 'long'],
    [320, 568, 'fa', 'light', 'empty'], [390, 844, 'en', 'dark', 'error'], [320, 568, 'fa', 'light', 'guest'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.addInitScript(p => localStorage.setItem('mtx.preferences.v1', JSON.stringify(p)), { language, theme, lowPower: true });
    const errors = [], unexpected = [];
    const long = state === 'long', empty = state === 'empty';
    const transactions = ['confirmed', 'pending', 'failed', 'refunded'].map((status, i) => ({ transactionId: 'past-' + i, provider: 'ton', asset: 'TON', amount: 0.01, creditedCoins: 100, status, createdAt: 1793000000000 + i }));
    const orders = [0, 1].map(i => ({ transactionId: 'ton_' + String(i).repeat(32), recipient: '0:' + '1'.repeat(64), amountNano: 10000000, creditedCoins: long ? 999999999999 : 100, expiresAt: Date.now() + 600000 }));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || route.request().method() !== 'GET') { unexpected.push(url.href); return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        if (state === 'error') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        if (url.pathname === '/api/wallet/payments/intents') return route.fulfill({ json: { intents: empty ? [] : orders, hasMore: false } });
        if (url.pathname === '/api/wallet/transactions') return route.fulfill({ json: { transactions: empty ? [] : transactions } });
        if (url.pathname === '/api/history') return route.fulfill({ json: { purchases: empty ? [] : [{ id: 'buy', itemId: 'boost:recharge', price: 1250, createdAt: 1793000000000 }], payments: empty ? [] : transactions, rewards: empty ? [] : [{ id: 'reward', title: long ? 'Reward'.repeat(40) : 'Daily reward', amount: long ? 999999999999 : 300, createdAt: 1793000000000 }] } });
        unexpected.push(url.pathname); return route.abort();
      }
      const path = url.pathname === '/' + kind ? '/tests/ui/rewards.html' : url.pathname;
      const body = files.get(path);
      if (body === undefined) { unexpected.push(path); return route.abort(); }
      return route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => { errors.push(error.message); console.error('Fixture page:', error.message); });
    await page.goto(origin + '/' + kind + '?state=' + state);
    await page.locator('.wallet-switch').waitFor();
    if (kind === 'wallet') {
      if (state === 'error') await page.locator('[role="status"]').waitFor();
      else if (state !== 'guest' && !empty) {
        await page.locator('.transaction-row').first().waitFor();
        assert.equal(await page.locator('.payment-check-button').count(), 2);
        assert.equal(await page.locator('.wallet-card > .button.primary').isDisabled(), true);
        await page.locator('input[type="checkbox"]').check();
        assert.equal(await page.locator('.wallet-card > .button.primary').isEnabled(), true);
        await page.locator('input[type="checkbox"]').uncheck();
      } else if (empty) await page.waitForFunction(() => document.querySelector('.wallet-card > .button.primary')?.disabled === false);
      if (state === 'error') assert.equal(await page.locator('.wallet-card > .button.primary').isDisabled(), true);
      if (state === 'guest') assert.equal(await page.locator('.wallet-card > .button').count(), 0);
      assert.equal(await page.locator('.wallet-card').evaluate(el => getComputedStyle(el).color), 'rgb(237, 245, 255)');
      assert.equal(await page.locator('.wallet-card p').first().evaluate(el => getComputedStyle(el).color), 'rgb(168, 203, 232)');
    } else {
      if (state === 'error') await page.getByRole('alert').waitFor();
      else if (!empty && state !== 'guest') {
        await page.locator('.activity-item').first().waitFor();
        assert.equal(await page.locator('.activity-item').count(), 6);
        await page.getByRole('tab').nth(3).click();
        assert.equal(await page.locator('.activity-item').count(), 1);
        await page.getByRole('tab').first().click();
      } else await page.locator('.empty-state').waitFor();
    }
    await page.keyboard.press('Tab');
    await page.locator('.wallet-switch').focus();
    assert.equal(await page.locator('.wallet-switch').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await page.locator('.wallet-switch').getAttribute('href'), kind === 'wallet' ? '/history' : '/wallet');
    await page.locator('.wallet-switch').evaluate(el => el.blur());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    assert.ok(await page.locator('.payment-order, .activity-item').evaluateAll(items => items.every(el => el.scrollWidth <= el.clientWidth)), 'card overflow');
    await page.screenshot({ path: '.build-verification/wallet-preview/' + kind + '-' + language + '-' + width + '-' + state + '.png', fullPage: true });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.locator(kind === 'wallet' ? '.purchase-history' : '.activity-item, .empty-state').last();
    assert.ok(await last.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.robot-nav').getBoundingClientRect().top), 'content hidden by navigation');
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('WALLET_DESIGN_UI_PASS', kind, width, language, state); passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_WALLET_DESIGN_UI_PASS', passed, 'isolated scenarios; no live API or wallet calls');
