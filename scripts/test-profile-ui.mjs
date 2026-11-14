/* global window, document, localStorage, innerWidth, getComputedStyle, requestAnimationFrame */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL, pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
import { setTimeout as delay } from 'node:timers/promises';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href : 'playwright');
const origin = 'http://127.0.0.1:4193';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {ProfilePage} from '/src/pages/ProfilePage.tsx';
import {BottomNavigation} from '/src/components/navigation/BottomNavigation.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import {initializePreferences} from '/src/services/preferencesService.ts';
import '/src/index.css';
initializePreferences();
window.reviewAccount=(id='review',status='authenticated')=>{
 const now=Math.floor(Date.now()/1000);
 setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:id,iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
 useAppStore.setState({authStatus:status,user:{id,username:id,avatar:'',isAdmin:false}});
};
window.reviewAccount('review',new URLSearchParams(location.search).get('auth')||'authenticated');
const root=createRoot(document.getElementById('root'));
window.reviewUnmount=()=>root.unmount();
root.render(React.createElement(BrowserRouter,null,React.createElement('div',{className:'app-shell'},React.createElement(ProfilePage),React.createElement(BottomNavigation))));
`;
const built = await build({ configFile: false, publicDir: false, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, plugins: [{
  name: 'profile-review', resolveId(id) { if (id === '/rewards-review-entry.js') return '\0profile-review'; },
  load(id) { if (id === '\0profile-review') return entry; },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
const fixture = coins => ({ state: { coins, xp: 280, level: 3, rank: 'Bronze', profitPerTap: 2, profitPerHour: 0 }, inventory: ['one', 'two'], referral: { invited: 2, earned: 20 }, payments: [], achievements: [
  { id: 'tap-rookie', icon: '⚡', title: 'Tap rookie', description: 'Complete 100 verified taps', progress: 120, target: 100, unlocked: true },
  { id: 'connector', icon: '🤝', title: 'Connector', description: 'Invite 3 friends', progress: 2, target: 3, unlocked: false },
  { id: 'tap-master', icon: '⚡', title: 'Tap master', description: 'Complete 5,000 verified taps', progress: 120, target: 5000, unlocked: false },
  { id: 'rising-star', icon: '⭐', title: 'Rising star', description: 'Reach level 5', progress: 3, target: 5, unlocked: false },
] });
await mkdir('.build-verification/profile-preview', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.REWARDS_BROWSER_PATH ? { executablePath: process.env.REWARDS_BROWSER_PATH } : {}) });
let passed = 0;
try {
  for (const [scenario, width, height, language, theme] of [
    ['normal', 390, 844, 'en', 'dark'], ['normal', 320, 568, 'fa', 'light'],
    ['normal', 430, 932, 'ar', 'system'], ['normal', 844, 390, 'en', 'dark'],
    ['normal', 768, 1024, 'en', 'light'], ['long-name', 320, 568, 'fa', 'dark'],
    ...['load-error', 'empty', 'demo', 'loading', 'error', 'expired', 'account-late', 'expired-late', 'unmount', 'loaded-expiry', 'progress-bounds'].map(s => [s, 390, 844, 'en', 'dark']),
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.addInitScript(p => localStorage.setItem('mtx.preferences.v1', JSON.stringify(p)), { language, theme, lowPower: true });
    let reads = 0, released;
    const late = ['account-late', 'expired-late', 'unmount'].includes(scenario);
    const hold = new Promise(resolve => { released = resolve; });
    const errors = [], unexpected = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
      if (url.pathname === '/api/profile' && route.request().method() === 'GET') {
        const current = ++reads;
        if (late && current === 1) await hold;
        if (scenario === 'load-error' && current === 1) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        const data = fixture(current === 1 ? 12450 : 98765);
        if (scenario === 'empty') data.achievements = [];
        if (scenario === 'progress-bounds') { data.achievements[0].target = 0; data.achievements[1].progress = -5; }
        return route.fulfill({ json: data });
      }
      const path = url.pathname === '/profile' ? '/tests/ui/rewards.html' : url.pathname;
      const body = files.get(path);
      if (body === undefined) { unexpected.push(url.pathname); return route.abort(); }
      return route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const authOnly = ['demo', 'loading', 'error', 'expired'].includes(scenario);
    await page.goto(origin + '/profile' + (authOnly ? '?auth=' + scenario : ''));
    if (authOnly) {
      await page.locator('.profile-message').waitFor();
      assert.equal(reads, 0);
      assert.equal(await page.locator('.profile-metrics').count(), 0);
      assert.match(await page.locator('.profile-message').innerText(), scenario === 'loading' ? /Signing in/ : /Reopen MTX/);
    } else if (late) {
      await page.waitForFunction(() => document.querySelector('[aria-busy="true"]'));
      // Wait for the original request to enter the route before switching accounts.
      await page.waitForFunction(() => window.performance.getEntriesByType('resource').length > 0);
      for (let attempt = 0; reads === 0 && attempt < 100; attempt++) await delay(10);
      assert.ok(reads > 0, 'initial request must be in flight');
      if (scenario === 'account-late') {
        await page.evaluate(() => window.reviewAccount('second'));
        await page.waitForFunction(() => document.querySelector('.profile-metrics dd')?.textContent === '98,765');
      } else if (scenario === 'expired-late') await page.evaluate(() => window.reviewAccount('review', 'expired'));
      else await page.evaluate(() => window.reviewUnmount());
      const response = page.waitForResponse(response => response.url().endsWith('/api/profile'));
      released();
      await response;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.profile-metrics dd').count(), scenario === 'account-late' ? 4 : 0);
      if (scenario === 'account-late') assert.equal(await page.locator('.profile-metrics dd').first().innerText(), '98,765');
    } else {
      if (scenario === 'load-error') {
        await page.locator('[role="alert"]').waitFor();
        assert.equal(await page.locator('.profile-metrics').count(), 0);
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
      }
      await page.locator('.profile-metrics').waitFor();
      assert.equal(await page.locator('.profile-metrics dd').first().innerText(), new Intl.NumberFormat(language === 'fa' ? 'fa-IR' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US').format(scenario === 'load-error' ? 98765 : 12450));
      if (scenario === 'loaded-expiry') {
        await page.evaluate(() => window.reviewAccount('review', 'expired'));
        await page.locator('.profile-message').waitFor();
        assert.equal(await page.locator('.profile-metrics').count(), 0);
      } else if (scenario === 'empty') assert.equal(await page.locator('.profile-badge').count(), 0);
      else {
        if (scenario === 'long-name') {
          await page.evaluate(() => window.reviewAccount('A'.repeat(120)));
          await page.waitForFunction(() => document.querySelector('.profile-identity h2')?.textContent === '@' + 'A'.repeat(120));
        }
        assert.equal(await page.locator('.profile-badge').count(), 4);
        const values = await page.locator('[role="progressbar"]').evaluateAll(elements => elements.map(el => Number(el.getAttribute('aria-valuenow'))));
        assert.ok(values.every(value => value >= 0 && value <= 100));
        if (scenario === 'progress-bounds') assert.deepEqual(values.slice(0, 2), [0, 0]);
        assert.equal(await page.locator('.robot-nav a.active').getAttribute('href'), '/profile');
        await page.keyboard.press('Tab');
        await page.locator('.profile-settings').focus();
        assert.equal(await page.locator('.profile-settings').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        assert.equal(await page.locator('.profile-settings').getAttribute('href'), '/settings');
        assert.equal(await page.locator('.profile-brand').getAttribute('href'), '/');
        assert.equal(await page.locator('.robot-profile').evaluate(el => getComputedStyle(el).color), 'rgb(237, 245, 255)');
        await page.locator('.profile-settings').evaluate(el => el.blur());
        await page.screenshot({ path: `.build-verification/profile-preview/${scenario}-${language}-${width}.png`, fullPage: true });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        assert.ok(await page.evaluate(() => {
          const cards = document.querySelectorAll('.profile-badge');
          return cards[cards.length - 1].getBoundingClientRect().bottom <= document.querySelector('.robot-nav').getBoundingClientRect().top;
        }), 'last badge must be reachable above fixed navigation');
      }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log('PROFILE_UI_PASS', scenario, width, language, theme);
    passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_PROFILE_UI_PASS', passed, 'isolated scenarios; no live API traffic');
