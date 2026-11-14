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
const origin = 'http://127.0.0.1:4196';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {ReferralPage} from '/src/pages/ReferralPage.tsx';
import {LeaderboardPage} from '/src/pages/LeaderboardPage.tsx';
import {BottomNavigation} from '/src/components/navigation/BottomNavigation.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import {initializePreferences} from '/src/services/preferencesService.ts';
import '/src/index.css';
initializePreferences();
const now=Math.floor(Date.now()/1000);
setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'review',iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
useAppStore.setState({authStatus:'authenticated',user:{id:'review',username:'Review',avatar:'',isAdmin:false}});
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement('div',{className:'app-shell'},React.createElement(location.pathname==='/referral'?ReferralPage:LeaderboardPage),React.createElement(BottomNavigation))));
`;
const built = await build({ configFile: false, publicDir: false, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(''), 'import.meta.env.VITE_LEADERBOARD_WS': JSON.stringify('') }, plugins: [{
  name: 'social-design', resolveId(id) { if (id === '/rewards-review-entry.js') return '\0social-design'; }, load(id) { if (id === '\0social-design') return entry; },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
await mkdir('.build-verification/social-preview', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.REWARDS_BROWSER_PATH });
let passed = 0;
try {
  for (const kind of ['referral', 'leaderboard']) for (const [width, height, language, theme, long] of [
    [390, 844, 'en', 'dark', false], [320, 568, 'fa', 'light', false], [430, 932, 'ar', 'system', false],
    [844, 390, 'en', 'dark', false], [768, 1024, 'en', 'light', false], [320, 568, 'en', 'light', true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.addInitScript(p => localStorage.setItem('mtx.preferences.v1', JSON.stringify(p)), { language, theme, lowPower: true });
    const errors = [], unexpected = [], scopes = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || route.request().method() !== 'GET') { unexpected.push(url.href); return route.abort(); }
      if (url.pathname === '/api/referral') return route.fulfill({ json: { code: long ? 'MTX' + 'a'.repeat(120) : 'MTX-REVIEW', invited: long ? 999999999999 : 12, earned: 1200 } });
      if (url.pathname === '/api/leaderboard') {
        scopes.push(url.searchParams.get('scope'));
        return route.fulfill({ json: { entries: Array.from({ length: long ? 1000 : 20 }, (_, i) => ({ userId: i === 0 ? 'review' : 'user-' + i, username: long ? 'Player'.repeat(20) : i === 0 ? 'Review' : 'Player ' + (i + 1), rank: i + 1, coins: (long ? 999999999999 : 12450) - i })) } });
      }
      const path = url.pathname === '/' + kind ? '/tests/ui/rewards.html' : url.pathname;
      const body = files.get(path);
      if (body === undefined) { unexpected.push(url.pathname); return route.abort(); }
      return route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/' + kind);
    if (kind === 'referral') {
      await page.waitForFunction(() => document.querySelector('.referral-card input')?.disabled === false);
      assert.equal(await page.locator('.referral-card .button.primary').isDisabled(), true);
      assert.equal(await page.locator('.referral-card').evaluate(el => getComputedStyle(el).color), 'rgb(237, 245, 255)');
    } else {
      await page.locator('.current-player').waitFor();
      assert.ok(await page.locator('.leaderboard-entry').count() < 30);
      const geometry = await page.locator('.virtual-list-row').evaluateAll(rows => rows.slice(0, 2).map(row => ({ top: row.getBoundingClientRect().top, height: row.getBoundingClientRect().height })));
      assert.equal(geometry[0].height, 54);
      assert.equal(geometry[1].top - geometry[0].top, 54);
      await page.locator('.leaderboard-tabs button').nth(2).click();
      await page.locator('.current-player').waitFor();
      assert.equal(await page.locator('.leaderboard-tabs button').nth(2).getAttribute('aria-pressed'), 'true');
      assert.ok(scopes.includes('weekly'));
      await page.locator('.leaderboard-tabs button').first().click();
      await page.locator('.current-player').waitFor();
    }
    await page.keyboard.press('Tab');
    await page.locator('.social-switch').focus();
    assert.equal(await page.locator('.social-switch').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await page.locator('.social-switch').getAttribute('href'), kind === 'referral' ? '/leaderboard' : '/referral');
    await page.locator('.social-switch').evaluate(el => el.blur());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    await page.screenshot({ path: `.build-verification/social-preview/${kind}-${language}-${width}-${long}.png`, fullPage: true });
    if (kind === 'leaderboard') {
      assert.ok(await page.locator('.leaderboard').evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.locator('.leaderboard').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForFunction(count => Array.from(document.querySelectorAll('.leaderboard-entry b')).at(-1)?.textContent === '#' + new Intl.NumberFormat(document.documentElement.lang === 'fa' ? 'fa-IR' : document.documentElement.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US').format(count), long ? 1000 : 20);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.locator(kind === 'referral' ? '.referral-card' : '.leaderboard');
    assert.ok(await last.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.robot-nav').getBoundingClientRect().top));
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('SOCIAL_DESIGN_UI_PASS', kind, width, language, long); passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_SOCIAL_DESIGN_UI_PASS', passed, 'isolated scenarios; no live API traffic');
