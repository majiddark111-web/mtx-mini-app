/* global window, document, localStorage, innerWidth, getComputedStyle */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL, pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href : 'playwright');
const origin = 'http://127.0.0.1:4194';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {StorePage} from '/src/pages/StorePage.tsx';
import {InventoryPage} from '/src/pages/InventoryPage.tsx';
import {BottomNavigation} from '/src/components/navigation/BottomNavigation.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import {initializePreferences} from '/src/services/preferencesService.ts';
import '/src/index.css';
initializePreferences();
const now=Math.floor(Date.now()/1000);
setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'design-review',iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
useAppStore.setState({authStatus:location.search.includes('demo')?'demo':'authenticated',user:{id:'design-review',username:'Review',avatar:'',isAdmin:false}});
window.reviewState=()=>({score:useAppStore.getState().score,energy:useAppStore.getState().energy});
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement('div',{className:'app-shell'},React.createElement(location.pathname==='/store'?StorePage:InventoryPage),React.createElement(BottomNavigation))));
`;
const built = await build({ configFile: false, publicDir: false, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, plugins: [{
  name: 'commerce-design-review', resolveId(id) { if (id === '/rewards-review-entry.js') return '\0commerce-design-review'; },
  load(id) { if (id === '\0commerce-design-review') return entry; },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
const catalog = [
  { id: 'boost:recharge', category: 'boost', title: 'Recharge boost', description: 'One-time full energy refill', price: 100, featured: true, limited: false, owned: false },
  { id: 'skin:aurora', category: 'skin', title: 'Aurora skin', description: 'A permanent cosmetic for your MTX coin', price: 300, featured: false, limited: true, owned: true },
  { id: 'consumable:energy', category: 'consumable', title: 'Energy cell', description: 'Restore 25% of maximum energy', price: 50, featured: false, limited: false, owned: false },
  { id: 'upgrade:tap:2', category: 'upgrade', title: 'Tap power upgrade', description: 'Permanent tap power upgrade', price: 20000, featured: false, limited: false, owned: false },
];
await mkdir('.build-verification/commerce-preview', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.REWARDS_BROWSER_PATH ? { executablePath: process.env.REWARDS_BROWSER_PATH } : {}) });
let passed = 0;
try {
  for (const kind of ['store', 'inventory']) for (const [scenario, width, height, language, theme] of [
    ['normal', 390, 844, 'en', 'dark'], ['normal', 320, 568, 'fa', 'light'],
    ['normal', 430, 932, 'ar', 'system'], ['normal', 844, 390, 'en', 'dark'],
    ['normal', 768, 1024, 'en', 'light'],
    ...['empty', 'load-error', 'loading', 'demo', 'action', 'long-values'].map(s => [s, 320, 568, 'en', 'light']),
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.addInitScript(p => localStorage.setItem('mtx.preferences.v1', JSON.stringify(p)), { language, theme, lowPower: true });
    let reads = 0, posts = 0, coins = scenario === 'long-values' ? 999999999999999 : 12450, quantity = 2, release;
    const hold = new Promise(resolve => { release = resolve; });
    const errors = [], unexpected = [];
    const state = () => ({ coins, energy: 1500, maximumEnergy: 1500, profitPerTap: 2, profitPerHour: 0, tapLevel: 1, energyLevel: 1, profitLevel: 0, version: 2 });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
      if (url.pathname === '/api/store/catalog' || url.pathname === '/api/inventory') {
        reads++;
        if (scenario === 'loading' && reads === 1) await hold;
        if (scenario === 'load-error' && reads === 1) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        if (kind === 'store') return route.fulfill({ json: { coins, items: scenario === 'empty' ? [] : catalog } });
        return route.fulfill({ json: { items: scenario === 'empty' ? [] : catalog.slice(0, 3).map((item, i) => ({ itemId: item.id, category: item.category, quantity: item.category === 'boost' ? quantity : 1, acquiredAt: 1700000000000 - i * 1000 })), purchases: scenario === 'empty' ? [] : [{ id: 'fixture-only', itemId: scenario === 'long-values' ? 'boost:' + 'long-id'.repeat(30) : 'boost:recharge', price: 100, createdAt: 1700000000000 }], equippedSkin: 'skin:aurora' } });
      }
      if (scenario === 'action' && route.request().method() === 'POST') {
        posts++;
        assert.equal(route.request().postDataJSON().itemId, 'boost:recharge');
        if (kind === 'store') {
          assert.equal(url.pathname, '/api/store/purchase');
          assert.match(route.request().postDataJSON().idempotencyKey, /^[0-9a-f-]{36}$/);
          coins -= 100;
        } else { assert.equal(url.pathname, '/api/inventory/activate'); quantity--; }
        return route.fulfill({ json: { state: state(), duplicate: false, items: [] } });
      }
      const path = url.pathname === '/' + kind ? '/tests/ui/rewards.html' : url.pathname;
      const body = files.get(path);
      if (body === undefined) { unexpected.push(url.pathname); return route.abort(); }
      return route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/' + kind + (scenario === 'demo' ? '?demo=1' : ''));
    await page.locator('.commerce-header').waitFor();
    if (scenario === 'demo') {
      assert.equal(reads, 0);
      assert.equal(await page.locator('.product-card').count(), 0);
    } else {
      if (scenario === 'loading') {
        await page.getByText(kind === 'store' ? 'Waking up the Store server…' : 'Loading inventory…', { exact: true }).waitFor();
        assert.equal(await page.locator('.product-card').count(), 0);
        release();
      }
      if (scenario === 'load-error') {
        await page.getByRole('button', { name: kind === 'store' ? 'Retry' : 'Refresh inventory', exact: true }).click();
      }
      if (scenario === 'empty') await page.locator('.empty-state').waitFor();
      else {
        await page.locator('.product-card').first().waitFor();
        assert.equal(await page.locator('.product-card').count(), kind === 'store' ? 4 : 3);
        assert.equal(await page.locator('.product-card').first().evaluate(el => getComputedStyle(el).color), 'rgb(237, 245, 255)');
        assert.equal(await page.locator('.product-card p').first().evaluate(el => getComputedStyle(el).color), 'rgb(168, 203, 232)');
        if (scenario === 'normal') {
          await page.getByRole('tab').nth(kind === 'store' ? 2 : 1).click();
          assert.equal(await page.locator('.product-card').count(), 1);
          assert.equal(await page.getByRole('tab').nth(kind === 'store' ? 2 : 1).getAttribute('aria-selected'), 'true');
          await page.getByRole('tab').first().click();
          if (kind === 'store') {
            await page.locator('.more-filters summary').click();
            await page.locator('.commerce-tools input').fill('no-match-xyz');
            await page.locator('.empty-state').waitFor();
            await page.locator('.commerce-tools input').fill('');
            await page.locator('.commerce-tools select').selectOption('low');
            assert.match(await page.locator('.product-card > strong').first().innerText(), /50|۵۰/);
            await page.locator('.commerce-tools select').selectOption('featured');
          } else {
            const before = await page.locator('.product-card h2').first().innerText();
            await page.locator('.inventory-sort button').click();
            assert.notEqual(await page.locator('.product-card h2').first().innerText(), before);
            await page.locator('.inventory-sort button').click();
          }
        }
        if (kind === 'store' && scenario !== 'long-values') {
          assert.equal(await page.locator('.product-card button:disabled').count(), 2, 'owned and unaffordable items remain disabled');
        }
        if (scenario === 'action') {
          await page.locator('.product-card button').first().click();
          await page.waitForFunction(() => document.querySelector('.status-message')?.textContent?.match(/purchased|used once/));
          assert.equal(posts, 1);
          assert.equal(await page.locator('.status-message').evaluate(el => getComputedStyle(el).position), 'static');
          if (kind === 'store') assert.equal(await page.evaluate(() => window.reviewState().score), 12350);
          else { assert.equal(quantity, 1); assert.equal(await page.evaluate(() => window.reviewState().energy), 1500); }
        }
      }
    }
    await page.keyboard.press('Tab');
    await page.locator('.commerce-switch').focus();
    assert.equal(await page.locator('.commerce-switch').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await page.locator('.commerce-switch').getAttribute('href'), kind === 'store' ? '/inventory' : '/store');
    assert.equal(await page.locator('.commerce-brand').getAttribute('href'), '/');
    if (kind === 'inventory') assert.equal(await page.locator('.robot-nav a.active').getAttribute('href'), '/inventory');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    await page.locator('.commerce-switch').evaluate(el => el.blur());
    await page.screenshot({ path: `.build-verification/commerce-preview/${kind}-${scenario}-${language}-${width}.png`, fullPage: true });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = kind === 'inventory' ? page.locator('.purchase-history') : page.locator('.product-card').last();
    if (await last.count()) assert.ok(await last.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.robot-nav').getBoundingClientRect().top), 'final content must be reachable above navigation');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.equal(posts, scenario === 'action' ? 1 : 0, 'layout tests must not trigger purchases or consume inventory');
    console.log('COMMERCE_DESIGN_UI_PASS', kind, scenario, width, language, theme);
    passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_COMMERCE_DESIGN_UI_PASS', passed, 'isolated scenarios; no live API traffic');
