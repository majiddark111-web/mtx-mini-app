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
const origin = 'http://127.0.0.1:4195';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {MissionsPage} from '/src/pages/MissionsPage.tsx';
import {DailyRewardPage} from '/src/pages/DailyRewardPage.tsx';
import {BottomNavigation} from '/src/components/navigation/BottomNavigation.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import {initializePreferences} from '/src/services/preferencesService.ts';
import '/src/index.css';
initializePreferences();
const now=Math.floor(Date.now()/1000);
setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'design-review',iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
useAppStore.setState({authStatus:location.search.includes('demo')?'demo':'authenticated',user:{id:'design-review',username:'Review',avatar:'',isAdmin:false}});
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement('div',{className:'app-shell'},React.createElement(location.pathname==='/missions'?MissionsPage:DailyRewardPage),React.createElement(BottomNavigation))));
`;
const built = await build({ configFile: false, publicDir: false, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, plugins: [{
  name: 'rewards-design-review', resolveId(id) { if (id === '/rewards-review-entry.js') return '\0rewards-design-review'; },
  load(id) { if (id === '\0rewards-design-review') return entry; },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
await mkdir('.build-verification/rewards-preview', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.REWARDS_BROWSER_PATH ? { executablePath: process.env.REWARDS_BROWSER_PATH } : {}) });
let passed = 0;
try {
  for (const kind of ['missions', 'daily-reward']) for (const [scenario, width, height, language, theme] of [
    ['normal', 390, 844, 'en', 'dark'], ['normal', 320, 568, 'fa', 'light'],
    ['normal', 430, 932, 'ar', 'system'], ['normal', 844, 390, 'en', 'dark'],
    ['normal', 768, 1024, 'en', 'light'],
    ...['claimed', 'load-error', 'demo', 'loading', 'claim', 'long-values', ...(kind === 'missions' ? ['empty', 'progress-bounds'] : ['combo', 'cipher'])].map(s => [s, 320, 568, 'en', 'light']),
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.addInitScript(p => localStorage.setItem('mtx.preferences.v1', JSON.stringify(p)), { language, theme, lowPower: true });
    let reads = 0, posts = 0, claimed = scenario === 'claimed', comboClaimed = claimed, cipherClaimed = claimed, release;
    const hold = new Promise(resolve => { release = resolve; });
    const errors = [], unexpected = [];
    const missions = () => scenario === 'empty' ? [] : [
      { id: 'daily-taps', title: 'Make 500 verified taps today', target: scenario === 'progress-bounds' ? 0 : 500, progress: 500, reward: scenario === 'long-values' ? 999999999999999 : 300, claimed, period: 'daily' },
      { id: 'weekly-coins', title: 'Earn 10,000 MTX this week', target: 10000, progress: scenario === 'progress-bounds' ? -10 : 2500, reward: 1000, claimed, period: 'weekly' },
      { id: 'monthly-level', title: 'Advance 10 levels this month', target: 10, progress: 12, reward: 2000, claimed: true, period: 'monthly' },
    ];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
      if (route.request().method() === 'GET' && ['/api/missions', '/api/daily', '/api/daily/challenges'].includes(url.pathname)) {
        const read = ++reads;
        if (scenario === 'loading') await hold;
        if (scenario === 'load-error' && read === 1) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        if (url.pathname === '/api/missions') return route.fulfill({ json: { missions: missions() } });
        if (url.pathname === '/api/daily') return route.fulfill({ json: { streak: 3, reward: scenario === 'long-values' ? 999999999999999 : 300, claimed } });
        return route.fulfill({ json: { combo: { slots: 3, reward: 750, claimed: comboClaimed }, cipher: { hint: 'The current game name', length: 3, reward: 500, claimed: cipherClaimed } } });
      }
      if (['claim', 'combo', 'cipher'].includes(scenario) && route.request().method() === 'POST') {
        posts++;
        if (scenario === 'claim') {
          assert.equal(url.pathname, kind === 'missions' ? '/api/missions/claim' : '/api/daily/claim');
          if (kind === 'missions') assert.equal(route.request().postDataJSON().missionId, 'daily-taps');
          claimed = true;
        } else {
          assert.equal(url.pathname, '/api/daily/challenges/claim');
          assert.deepEqual(route.request().postDataJSON(), { type: scenario, answer: scenario === 'combo' ? ['upgrade:tap', 'upgrade:energy', 'upgrade:profit'] : ['MTX'] });
          if (scenario === 'combo') comboClaimed = true; else cipherClaimed = true;
        }
        return route.fulfill({ json: { reward: scenario === 'claim' ? 300 : scenario === 'combo' ? 750 : 500 } });
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
    const mainButton = page.locator(kind === 'missions' ? '.social-card .button' : '.daily-card .button').first();
    if (scenario === 'demo') {
      await page.getByText('Reopen MTX in Telegram to sign in before claiming rewards.', { exact: true }).waitFor();
      assert.equal(reads, 0);
      assert.equal(await page.locator('.robot-rewards .button:not(:disabled)').count(), 0);
    } else {
      if (scenario === 'loading') {
        await page.getByText('Loading reward status…', { exact: true }).waitFor();
        assert.equal(await page.locator('.robot-rewards .button:not(:disabled)').count(), 0);
        release();
      }
      if (scenario === 'load-error') {
        await page.getByRole('alert').waitFor();
        await page.getByRole('button', { name: 'Refresh reward status', exact: true }).click();
      }
      if (scenario === 'empty') await page.locator('.reward-empty').waitFor();
      else {
        if (scenario === 'claimed') {
          await page.waitForFunction(() => document.querySelectorAll('.reward-claimed').length > 0);
          assert.equal(await page.locator('.robot-rewards .button:not(:disabled)').count(), 0);
        } else await page.waitForFunction(selector => document.querySelector(selector)?.disabled === false, kind === 'missions' ? '.social-card .button' : '.daily-card .button');
        if (kind === 'missions') {
          assert.equal(await page.locator('.social-card').count(), 3);
          const progress = await page.getByRole('progressbar').evaluateAll(elements => elements.map(el => Number(el.getAttribute('aria-valuenow'))));
          assert.ok(progress.every(value => value >= 0 && value <= 100));
          if (scenario === 'progress-bounds') assert.deepEqual(progress, [0, 0, 100]);
          assert.equal(await page.locator('.social-card .button').nth(1).isDisabled(), true, 'incomplete mission cannot be claimed');
        } else {
          assert.equal(await page.locator('.streak-row i').count(), 7);
          assert.equal(await page.locator('.streak-row i.active').count(), 3);
          if (scenario !== 'claimed') assert.equal(await page.locator('.challenge-grid .button:not(:disabled)').count(), 0, 'challenge requires an answer');
          if (scenario === 'combo') {
            for (let i = 0; i < 3; i++) await page.locator('.combo-option').nth(i).click();
            await page.locator('.combo-card .button').click();
          } else if (scenario === 'cipher') {
            await page.getByLabel('Daily cipher answer', { exact: true }).fill('mtx');
            await page.locator('.challenge-grid article').last().locator('.button').click();
          }
        }
        if (scenario === 'claim') await mainButton.click();
        if (['claim', 'combo', 'cipher'].includes(scenario)) {
          const claimedButton = scenario === 'claim' ? mainButton : page.locator('.challenge-grid article').nth(scenario === 'combo' ? 0 : 1).locator('.button');
          await page.waitForFunction(() => Array.from(document.querySelectorAll('.robot-rewards .button')).some(button => button.textContent === 'Come back tomorrow' || button.textContent === 'Claimed'));
          // Wait for the exact clicked action to finish its read-only refresh.
          await claimedButton.getByText(kind === 'daily-reward' && scenario === 'claim' ? 'Come back tomorrow' : 'Claimed', { exact: true }).waitFor();
          assert.equal(await claimedButton.isDisabled(), true);
          assert.equal(posts, 1);
        }
        const card = page.locator(kind === 'missions' ? '.social-card' : '.daily-card').first();
        assert.equal(await card.evaluate(el => getComputedStyle(el).color), 'rgb(237, 245, 255)');
      }
    }
    assert.equal(await page.locator('h1').count(), 1);
    await page.keyboard.press('Tab');
    await page.locator('.reward-switch').focus();
    assert.equal(await page.locator('.reward-switch').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await page.locator('.reward-switch').getAttribute('href'), kind === 'missions' ? '/daily-reward' : '/missions');
    assert.equal(await page.locator('.reward-brand').getAttribute('href'), '/');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    await page.locator('.reward-switch').evaluate(el => el.blur());
    await page.screenshot({ path: `.build-verification/rewards-preview/${kind}-${scenario}-${language}-${width}.png`, fullPage: true });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.locator(kind === 'missions' ? '.social-card' : '.challenge-grid article').last();
    if (await last.count()) assert.ok(await last.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.robot-nav').getBoundingClientRect().top), 'last action is reachable above navigation');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.equal(posts, ['claim', 'combo', 'cipher'].includes(scenario) ? 1 : 0);
    console.log('REWARDS_DESIGN_UI_PASS', kind, scenario, width, language, theme);
    passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_REWARDS_DESIGN_UI_PASS', passed, 'isolated scenarios; no live API traffic');
