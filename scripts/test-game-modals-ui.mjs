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
const origin = 'http://127.0.0.1:4199';
const entry = `
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation} from 'react-router-dom';
import {BoostModal} from '/src/components/game/BoostModal.tsx';
import {EarnModal} from '/src/components/game/EarnModal.tsx';
import {initializePreferences} from '/src/services/preferencesService.ts';
import '/src/index.css';
import '/src/components/game/robot-game.css';
initializePreferences();
window.reviewOpened=[];
function Fixture(){
 const [modal,setModal]=useState(null),[tick,setTick]=useState(0);
 const location=useLocation();
 useEffect(()=>{window.reviewRerender=()=>setTick(value=>value+1);},[]);
 return React.createElement('main',{className:'robot-game','data-tick':tick},
   React.createElement('button',{id:'boost',onClick:()=>setModal('boost')},'Boost'),
   React.createElement('button',{id:'earn',onClick:()=>setModal('earn')},'Earn'),
   React.createElement('button',{id:'background'},'Background'),
   React.createElement('div',{style:{height:1200}},'Fixture background'),
   location.pathname==='/game'&&modal==='boost'&&React.createElement(BoostModal,{onClose:()=>setModal(null)}),
   location.pathname==='/game'&&modal==='earn'&&React.createElement(EarnModal,{onClose:()=>setModal(null)}));
}
const root=createRoot(document.getElementById('root'));
window.reviewUnmount=()=>root.unmount();
root.render(React.createElement(React.StrictMode,null,React.createElement(BrowserRouter,null,React.createElement(Fixture))));
`;
const built = await build({ configFile: false, publicDir: false, plugins: [{
  name: 'modals-review', enforce: 'pre',
  resolveId(id) {
    if (id === '/rewards-review-entry.js') return '\0modals-review.jsx';
    if (id.endsWith('/services/telegramService')) return '\0telegram-fixture';
  },
  load(id) {
    if (id === '\0modals-review.jsx') return entry;
    if (id === '\0telegram-fixture') return 'export const hapticTap=()=>{}; export const openExternalLink=url=>window.reviewOpened.push(url);';
  },
}], build: { write: false, rollupOptions: { input: 'tests/ui/rewards.html' } } });
const files = new Map(built.output.map(item => ['/' + item.fileName, item.type === 'asset' ? item.source : item.code]));
await mkdir('.build-verification/modal-preview', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.REWARDS_BROWSER_PATH });
let passed = 0;
try {
  for (const kind of ['boost', 'earn']) for (const [width, height, language, theme, lowPower] of [
    [390, 844, 'en', 'dark', false], [320, 568, 'fa', 'light', true], [430, 932, 'ar', 'system', false],
    [844, 390, 'en', 'dark', true], [768, 1024, 'en', 'light', false], [320, 568, 'en', 'light', false],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.addInitScript(p => localStorage.setItem('mtx.preferences.v1', JSON.stringify(p)), { language, theme, lowPower });
    const errors = [], unexpected = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      const path = url.pathname === '/game' ? '/tests/ui/rewards.html' : url.pathname;
      const body = files.get(path);
      if (url.origin !== origin || route.request().method() !== 'GET' || body === undefined) { unexpected.push(url.href); return route.abort(); }
      return route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/game');
    const trigger = page.locator('#' + kind);
    const dialog = page.getByRole('dialog');
    const close = page.locator('.modal-header button');
    await trigger.click();
    await dialog.waitFor();
    assert.ok(await close.evaluate(el => el === document.activeElement));
    assert.ok(await dialog.getAttribute('aria-labelledby'));
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.keyboard.press('Shift+Tab');
    const controls = dialog.locator('button, a');
    assert.ok(await controls.last().evaluate(el => el === document.activeElement));
    await page.keyboard.press('Tab');
    assert.ok(await close.evaluate(el => el === document.activeElement));
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement.textContent);
    await page.evaluate(() => window.reviewRerender());
    await page.waitForFunction(() => document.querySelector('main').dataset.tick === '1');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), focused, 'rerender must not reset focus');
    await page.locator('#background').evaluate(el => el.focus());
    assert.ok(await close.evaluate(el => el === document.activeElement));
    assert.equal(await close.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).color), 'rgb(237, 245, 255)');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'dialog overflow');
    assert.ok(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
    await page.screenshot({ path: '.build-verification/modal-preview/' + kind + '-' + language + '-' + width + '.png' });
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.ok(await close.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }), 'close must stay reachable');
    assert.ok(await controls.last().evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.modal-card').getBoundingClientRect().bottom), 'last action clipped');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    await trigger.click();
    await page.mouse.click(2, 2);
    await dialog.waitFor({ state: 'detached' });
    await trigger.click();
    await close.click();
    await dialog.waitFor({ state: 'detached' });
    await trigger.click();
    if (kind === 'boost') {
      for (const href of ['/store?category=upgrade', '/inventory']) {
        await dialog.locator('a[href="' + href + '"]').click();
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, href);
        await dialog.waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        await page.locator('#background').focus();
        assert.ok(await page.locator('#background').evaluate(el => el === document.activeElement));
        await page.goto(origin + '/game');
        await trigger.click();
      }
    } else {
      for (const button of await page.locator('.mission-card button').all()) await button.click();
      assert.deepEqual(await page.evaluate(() => window.reviewOpened), ['https://t.me/TOKXCOIN', 'https://youtube.com/@tokx.community', 'https://www.instagram.com/tokx_org', 'https://x.com/Tokxcommunity']);
    }
    await page.evaluate(() => window.reviewUnmount());
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('GAME_MODAL_UI_PASS', kind, width, language); passed++;
    await context.close();
  }
} finally { await browser.close(); }
console.log('MTX_GAME_MODAL_UI_PASS', passed, 'isolated scenarios; no live API, purchases or external navigation');
