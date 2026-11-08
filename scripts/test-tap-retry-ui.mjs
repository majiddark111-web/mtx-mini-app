/* global window, sessionStorage, localStorage, document, Event */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { build } from 'vite';

// Actual game screen, tap hook, Axios client and Web Storage. Both origins
// are intercepted; never read a real session or contact a deployed API.
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const pw = process.env.PLAYWRIGHT_MODULE_PATH;
const { chromium } = await import(pw ? pathToFileURL(resolve(pw)).href : 'playwright');
const ui = 'http://127.0.0.1:4187', api = 'http://127.0.0.1:4188';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {setApiSession} from '/src/api/httpClient.ts';
import {useAppStore} from '/src/store/useAppStore.ts';
import {GamePage} from '/src/pages/GamePage.tsx';
const iat=Math.floor(Date.now()/1000);
setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'tap-test',iat,exp:iat+900}))+'.fixture',sessionKey:btoa('synthetic-test-key')});
useAppStore.setState({authStatus:'authenticated',user:{id:'tap-test',username:'Test',avatar:'',isAdmin:false},energy:100,score:0,tapPower:1});
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(GamePage)));
`;
const built = await build({ configFile:false, publicDir:false, define:{'import.meta.env.VITE_API_BASE':JSON.stringify(api)},
  plugins:[{name:'tap-ui',resolveId(id){if(id==='/rewards-review-entry.js')return '\0tap-ui';},load(id){if(id==='\0tap-ui')return entry;}}],
  build:{write:false,rollupOptions:{input:'tests/ui/rewards.html'}} });
const assets=new Map(built.output.map(item=>['/'+item.fileName,item.type==='asset'?item.source:item.code]));
const browser=await chromium.launch({headless:true,...(process.env.REWARDS_BROWSER_PATH?{executablePath:process.env.REWARDS_BROWSER_PATH}:{})});
try {
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const epoch=Date.now(), deadline=epoch+8000, calls=[], seen=new Set(), errors=[];
  let coins=0;
  await ctx.addInitScript(base=>{ Date.now=()=>Number(sessionStorage.getItem('fixture-now')??base); },epoch);
  await ctx.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.origin===ui){
      if(url.pathname==='/game')return route.fulfill({contentType:'text/html',body:assets.get('/tests/ui/rewards.html')});
      if(assets.has(url.pathname))return route.fulfill({contentType:'text/javascript',body:assets.get(url.pathname)});
      return route.fulfill({status:404,body:''});
    }
    if(url.origin!==api || url.pathname!=='/api/game/taps')return route.abort();
    const headers={'access-control-allow-origin':ui,'access-control-allow-methods':'POST, OPTIONS',
      'access-control-allow-headers':'authorization, content-type, x-mtx-nonce, x-mtx-timestamp, x-mtx-signature','access-control-expose-headers':'Retry-After'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const batch=req.postDataJSON(), at=Number(req.headers()['x-mtx-timestamp']);
    calls.push({batch,at,nonce:req.headers()['x-mtx-nonce']});
    if(calls.length===1)return route.fulfill({status:429,headers:{...headers,'retry-after':'8'},json:{error:'Too many requests'}});
    const duplicate=seen.has(batch.batchId);
    if(!duplicate){seen.add(batch.batchId);coins+=batch.taps;}
    // Commit the first retry but lose its reply. The client cannot acknowledge it.
    if(calls.length===2)return route.abort();
    return route.fulfill({headers,json:{duplicate,acceptedTaps:batch.taps,state:{coins,energy:100-coins,maximumEnergy:100,
      profitPerTap:1,profitPerHour:0,tapLevel:0,energyLevel:0,profitLevel:0,version:1+coins}}});
  });
  const page=await ctx.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  const queue=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mtx.tap-outbox.v1:tap-test')??'[]'));
  await page.goto(ui+'/game');
  await page.locator('.coin-button').click();
  await page.waitForFunction(d=>Number(sessionStorage.getItem('mtx.tap-retry.v1:tap-test'))===d,deadline);
  const first=calls[0].batch;
  assert.equal((await queue())[0].batchId,first.batchId);
  await page.reload();
  await page.locator('.coin-button').click();
  await page.evaluate(d=>{
    sessionStorage.setItem('fixture-now',String(d-1));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  },deadline);
  // Allow the actual 2s hook timer a turn while the deadline is still in the future.
  await page.waitForTimeout(2200);
  assert.equal(calls.length,1,'reload, clicks and lifecycle signals must not bypass the cooldown');
  assert.equal((await queue()).reduce((n,b)=>n+b.taps,0),2);
  await page.evaluate(d=>sessionStorage.setItem('fixture-now',String(d)),deadline);
  await page.waitForFunction(()=>localStorage.getItem('mtx.tap-outbox.v1:tap-test')==='[]',null,{timeout:15000});
  assert.equal(calls.length,4);
  assert.deepEqual(calls.slice(0,3).map(c=>c.batch),[first,first,first]);
  assert.ok(calls.slice(1).every(c=>c.at>=deadline));
  assert.equal(new Set(calls.map(c=>c.nonce)).size,4);
  assert.equal(seen.size,2); assert.equal(coins,2);
  await page.waitForFunction(()=>document.querySelector('.score')?.textContent==='2 MTX');
  assert.deepEqual(errors,[]);
  console.log('TAP_RETRY_UI_PASS: reload + reconnect + timer respected 429; lost reply retried with original batch; 2 taps credited once each');
} finally { await browser.close(); }
