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
const origin = 'http://127.0.0.1:4198';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {SettingsPage} from '/src/pages/SettingsPage.tsx';
import {NotificationsPage} from '/src/pages/NotificationsPage.tsx';
import {BottomNavigation} from '/src/components/navigation/BottomNavigation.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import {initializePreferences} from '/src/services/preferencesService.ts';
import '/src/index.css';
initializePreferences();
const now=Math.floor(Date.now()/1000);
const guest=new URLSearchParams(location.search).get('state')==='guest';
if(!guest)setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'review',iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
useAppStore.setState({authStatus:guest?'demo':'authenticated',user:{id:'review',username:'Review',avatar:'',isAdmin:false}});
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement('div',{className:'app-shell'},React.createElement(location.pathname==='/settings'?SettingsPage:NotificationsPage),React.createElement(BottomNavigation))));
`;
const built = await build({ configFile: false, publicDir: false, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, plugins: [{
  name: 'utility-design', resolveId(id) { if (id === '/rewards-review-entry.js') return '\0utility-design'; },
  load(id) { if (id === '\0utility-design') return entry; },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
await mkdir('.build-verification/utility-preview', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.REWARDS_BROWSER_PATH });
let passed = 0;
try {
  for (const kind of ['settings', 'notifications']) for (const [width, height, language, theme, state] of [
    [390, 844, 'en', 'dark', 'normal'], [320, 568, 'fa', 'light', 'normal'], [430, 932, 'ar', 'system', 'normal'],
    [844, 390, 'en', 'dark', 'normal'], [768, 1024, 'en', 'light', 'normal'], [320, 568, 'en', 'light', 'long'],
    ...(kind === 'notifications' ? [[320, 568, 'fa', 'light', 'empty'], [390, 844, 'en', 'dark', 'error'], [320, 568, 'fa', 'light', 'guest']] : []),
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.addInitScript(p => { if (!localStorage.getItem('mtx.preferences.v1')) localStorage.setItem('mtx.preferences.v1', JSON.stringify(p)); }, { language, theme, lowPower: true, sound: false, haptics: false });
    const errors = [], unexpected = [];
    let marked = false, posts = 0;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
      if (kind === 'notifications' && url.pathname === '/api/notifications/read-all' && route.request().method() === 'POST') {
        posts++; marked = true; return route.fulfill({ json: { ok: true } });
      }
      if (route.request().method() !== 'GET') { unexpected.push(url.href); return route.abort(); }
      if (kind === 'notifications' && url.pathname === '/api/notifications') {
        if (state === 'error') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        const notifications = state === 'empty' ? [] : ['announcement', 'reward', 'payment', 'purchase', 'upgrade'].map((type, i) => ({
          id: 'notice-' + i, kind: type, title: state === 'long' ? 'Announcement'.repeat(16) : 'Testnet update',
          message: state === 'long' ? 'LongMessage'.repeat(24) : language === 'fa' ? 'این یک اعلان آزمایشی برای بررسی نمایش است.' : 'Your recorded game activity is available.',
          read: marked || i > 1, createdAt: 1793000000000 + i,
        }));
        return route.fulfill({ json: { notifications, unreadCount: notifications.filter(item => !item.read).length } });
      }
      const path = url.pathname === '/' + kind ? '/tests/ui/rewards.html' : url.pathname;
      const body = files.get(path);
      if (body === undefined) { unexpected.push(path); return route.abort(); }
      return route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/' + kind + '?state=' + state);
    await page.locator('.utility-switch').waitFor();
    if (kind === 'notifications') {
      if (state === 'error') await page.getByRole('alert').waitFor();
      else if (['empty', 'guest'].includes(state)) await page.locator('.empty-state').waitFor();
      else {
        await page.locator('.notification-item').first().waitFor();
        assert.equal(await page.locator('.notification-item.unread').count(), 2);
      }
    } else {
      assert.equal(await page.locator('.settings-card').first().evaluate(el => getComputedStyle(el).color), 'rgb(237, 245, 255)');
      assert.equal(await page.locator('.settings-row small').first().evaluate(el => getComputedStyle(el).color), 'rgb(168, 203, 232)');
    }
    await page.keyboard.press('Tab');
    await page.locator('.utility-switch').focus();
    assert.equal(await page.locator('.utility-switch').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await page.locator('.utility-switch').getAttribute('href'), kind === 'settings' ? '/notifications' : '/settings');
    await page.locator('.utility-switch').evaluate(el => el.blur());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    assert.ok(await page.locator('.settings-card, .notification-item').evaluateAll(items => items.every(el => el.scrollWidth <= el.clientWidth)), 'card overflow');
    await page.screenshot({ path: '.build-verification/utility-preview/' + kind + '-' + language + '-' + width + '-' + state + '.png', fullPage: true });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.locator(kind === 'settings' ? '.settings-card' : '.notification-item, .empty-state').last();
    assert.ok(await last.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.robot-nav').getBoundingClientRect().top), 'content hidden by navigation');
    if (kind === 'settings') {
      for (const [index, lang] of ['en', 'fa', 'ar'].entries()) {
        await page.locator('.language-options button').nth(index).click();
        assert.equal(await page.locator('html').getAttribute('lang'), lang);
        assert.equal(await page.locator('html').getAttribute('dir'), lang === 'en' ? 'ltr' : 'rtl');
        assert.equal(await page.locator('.language-options [aria-checked="true"]').count(), 1);
      }
      for (const [index, option] of ['system', 'dark', 'light'].entries()) {
        await page.locator('.theme-options button').nth(index).click();
        assert.equal(await page.locator('html').getAttribute('data-app-theme'), option);
      }
      await page.keyboard.press('Tab');
      for (let index = 0; index < 3; index++) {
        const input = page.locator('.settings-row input').nth(index);
        await input.focus();
        assert.equal(await input.evaluate(el => getComputedStyle(el.nextElementSibling).outlineStyle), 'solid');
        await page.keyboard.press('Space');
        assert.equal(await input.isChecked(), index < 2);
      }
      await page.reload();
      await page.locator('.settings-row input').first().waitFor({ state: 'attached' });
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('mtx.preferences.v1'))), { language: 'ar', theme: 'light', sound: true, haptics: true, lowPower: false });
      assert.deepEqual(await page.locator('.settings-row input').evaluateAll(inputs => inputs.map(input => input.checked)), [true, true, false]);
      assert.equal(await page.locator('.language-options button').nth(2).getAttribute('aria-checked'), 'true');
      assert.equal(await page.locator('.theme-options button').nth(2).getAttribute('aria-checked'), 'true');
      assert.equal(posts, 0);
    } else if (['normal', 'long'].includes(state)) {
      await page.locator('.commerce-header button').click();
      await page.waitForFunction(() => document.querySelectorAll('.notification-item.unread').length === 0);
      assert.equal(posts, 1);
      assert.equal(await page.locator('.notification-item').count(), 5);
      assert.equal(await page.locator('.commerce-header button').count(), 0);
    } else assert.equal(posts, 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('UTILITY_DESIGN_UI_PASS', kind, width, language, state); passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_UTILITY_DESIGN_UI_PASS', passed, 'isolated scenarios; synthetic notification writes only');
