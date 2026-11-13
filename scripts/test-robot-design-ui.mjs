/* global document, localStorage, innerWidth, getComputedStyle */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { build } from 'vite';

const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href);
const origin = 'http://127.0.0.1:4187';
const homePreview = process.argv.includes('--home');
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import '/src/index.css';
import {GameScreen} from '/src/components/game/GameScreen.tsx';
import {HomePage} from '/src/pages/HomePage.tsx';
import {BottomNavigation} from '/src/components/navigation/BottomNavigation.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {initializePreferences} from '/src/services/preferencesService.ts';
initializePreferences();
useAppStore.setState({score:12450,energy:1500,maxEnergy:1500,tapPower:2,authStatus:'demo',user:{id:'preview-only',username:'Player',avatar:'',isAdmin:false}});
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement('div',{className:'app-shell'},React.createElement(${homePreview ? 'HomePage' : 'GameScreen'}),React.createElement(BottomNavigation))));
`;
const built = await build({configFile:false,publicDir:false,plugins:[{
  name:'robot-preview',resolveId(id){if(id==='/rewards-review-entry.js')return '\0robot-preview';},
  load(id){if(id==='\0robot-preview')return entry;},
}],build:{write:false,rollupOptions:{input:'tests/ui/rewards.html'}}});
const files = new Map(built.output.map(x=>['/'+x.fileName,x.type==='asset'?x.source:x.code]));
const picture = await readFile('public/mtx-robot-scene.png');
const webp = await readFile('public/mtx-robot-scene.webp');
await mkdir('.build-verification/robot-preview',{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.REWARDS_BROWSER_PATH});
try {
  for(const [width,height,language,theme,lowPower] of [
    [390,844,'en','dark',false], [320,568,'fa','light',true],
    [430,932,'ar','system',false], [844,390,'en','dark',true],
    [390,844,'fa','dark',false], [768,1024,'en','light',false],
  ]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(p=>localStorage.setItem('mtx.preferences.v1',JSON.stringify(p)),{language,theme,lowPower});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/mtx-robot-scene.png')return route.fulfill({contentType:'image/png',body:picture});
      if(url.pathname==='/mtx-robot-scene.webp')return route.fulfill({contentType:'image/webp',body:webp});
      const path=['/','/game'].includes(url.pathname)?'/tests/ui/rewards.html':url.pathname;
      const body=files.get(path);
      return body===undefined?route.abort():route.fulfill({body,contentType:path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript'});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+(homePreview?'/':'/game'));
    if(homePreview){
      await page.locator('.home-robot img').evaluate(img=>img.decode());
      assert.ok(await page.locator('.home-robot img').evaluate(img=>img.currentSrc.endsWith('.webp')));
      assert.equal(await page.locator('.home-shortcuts a').count(),6);
      assert.equal(await page.locator('.robot-nav a.active').getAttribute('href'),'/');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const balance=await page.locator('.home-balance').textContent();
      assert.equal(balance,new Intl.NumberFormat(language==='fa'?'fa-IR':language==='ar'?'ar-EG-u-nu-latn':'en-US').format(12450)+' MTX');
      assert.equal(await page.locator('.home-shortcuts a').first().evaluate(el=>getComputedStyle(el).color),'rgb(231, 244, 255)');
      await page.locator('.launch').focus();
      assert.equal(await page.locator('.launch').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
      await page.locator('.launch').evaluate(el=>el.blur());
      await page.screenshot({path:'.build-verification/robot-preview/home-'+language+'-'+width+'.png',fullPage:true});
      for(const href of ['/referral','/daily-reward','/store','/leaderboard','/history','/settings','/game']){
        await page.locator('.robot-home a[href="'+href+'"]').click();
        assert.equal(new URL(page.url()).pathname,href);
      }
      assert.deepEqual(errors,[]);
      console.log('ROBOT_HOME_UI_PASS',width,height,language,theme,lowPower);
      await context.close();
      continue;
    }
    await page.locator('.robot-scene').evaluate(img=>img.decode());
    assert.ok(await page.locator('.robot-scene').evaluate(img=>img.currentSrc.endsWith('.webp')));
    const framing=await page.locator('.robot-scene').evaluate(img=>{
      const scene=img.getBoundingClientRect();
      const coin=document.querySelector('.coin-button').getBoundingClientRect();
      const paintedWidth=Math.min(scene.width,scene.height*img.naturalWidth/img.naturalHeight);
      return {width:scene.width,paintedWidth,coinWidth:coin.width,coinTop:(coin.top-scene.top)/scene.height};
    });
    assert.ok(framing.paintedWidth>=framing.width*.98,'robot artwork must fill the stage width');
    assert.ok(framing.coinWidth<=framing.paintedWidth*.42,'coin must not dominate the robot');
    assert.ok(framing.coinTop>=.6,'coin must leave the face and upper body unobscured');
    assert.equal(await page.locator('.robot-nav a').count(),6);
    assert.equal(await page.locator('.robot-nav a.active').getAttribute('href'),'/game');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
    await page.locator('.coin-button').focus();
    assert.equal(await page.locator('.coin-button').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.locator('.coin-button').evaluate(el=>el.blur());
    await page.screenshot({path:'.build-verification/robot-preview/game-'+language+'-'+width+'.png',fullPage:true});
    await page.locator('.game-actions button').first().click();
    await page.locator('.modal-card').waitFor();
    await page.locator('.modal-header button').click();
    await page.locator('.game-actions button').nth(1).click();
    await page.locator('.modal-card').waitFor();
    await page.locator('.modal-header button').click();
    await page.locator('.player-diagnostics summary').click();
    await page.locator('.player-diagnostics').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for(const href of ['/','/inventory','/missions','/wallet','/profile','/game']){
      await page.locator('.robot-nav a[href="'+href+'"]').click();
      assert.equal(new URL(page.url()).pathname,href);
      assert.equal(await page.locator('.robot-nav a.active').getAttribute('href'),href);
    }
    assert.deepEqual(errors,[]);
    console.log('ROBOT_DESIGN_UI_PASS',width,height,language,theme,lowPower);
    await context.close();
  }
} finally {await browser.close();}
