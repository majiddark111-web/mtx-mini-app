/* global document, localStorage */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { resolve } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { build } from 'vite';

const pw = process.env.PLAYWRIGHT_MODULE_PATH;
const { chromium } = await import(pw ? pathToFileURL(resolve(pw)).href : 'playwright');
const origin = 'http://127.0.0.1:4187';
const order = { transactionId: 'ton_' + 'a'.repeat(32), recipient: '0:' + '1'.repeat(64), amountNano: 10000000, creditedCoins: 100, expiresAt: Date.now() + 600000 };
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {setApiSession} from '/src/api/httpClient.ts';
import {useAppStore} from '/src/store/useAppStore.ts';
import {Buffer} from 'buffer';
window.Buffer=Buffer;
const now=Math.floor(Date.now()/1000);
setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'wallet-test',iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('synthetic-key-test-only')});
useAppStore.setState({authStatus:'authenticated',user:{id:'wallet-test',username:'fixture',avatar:'',isAdmin:false}});
import('/src/pages/WalletPage.tsx').then(({WalletPage})=>createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(WalletPage))));
`;
const sdk = `
export const TonConnectUIProvider=({children})=>children,TonConnectButton=()=>null;
export const useIsConnectionRestored=()=>true,useTonAddress=()=>'fixture',useTonWallet=()=>({account:{chain:'-3',address:'fixture'}});
export const useTonConnectUI=()=>[{sendTransaction:async()=>{window.recordWalletSend();throw Error('Unexpected send');}}];
`;
const built = await build({ configFile:false, publicDir:false, define:{'import.meta.env.VITE_API_BASE':JSON.stringify('')},
  plugins:[{name:'wallet-retry-fixture',enforce:'pre',resolveId(id){if(id==='/rewards-review-entry.js')return '\0retry-entry';if(id==='@tonconnect/ui-react')return '\0retry-wallet';},
    load(id){if(id==='\0retry-entry')return entry;if(id==='\0retry-wallet')return sdk;}}],
  build:{write:false,rollupOptions:{input:'tests/ui/rewards.html'}} });
const assets=new Map(built.output.map(item=>['/'+item.fileName,item.type==='asset'?item.source:item.code]));
const browser=await chromium.launch({headless:true,...(process.env.REWARDS_BROWSER_PATH?{executablePath:process.env.REWARDS_BROWSER_PATH}:{})});
try {
 for (const [language, expectedMessage] of [
   ['en', 'Your order is saved. Select Check payment again; do not pay again.'],
   ['fa', 'سفارش شما محفوظ است. دوباره «بررسی پرداخت» را بزنید؛ نیازی به پرداخت مجدد نیست.'],
   ['ar', 'طلبك محفوظ. اضغط على Check payment مرة أخرى؛ لا تدفع مجددًا.'],
 ]) {
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  await ctx.addInitScript(lang=>localStorage.setItem('mtx.preferences.v1',JSON.stringify({language:lang,theme:'light',lowPower:true,sound:false,haptics:false})),language);
  let checks=0, sends=0, creates=0, reloaded=false;
  await ctx.exposeFunction('recordWalletSend',()=>{sends++;});
  await ctx.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/retry')return route.fulfill({contentType:'text/html',body:assets.get('/tests/ui/rewards.html')});
    if(assets.has(url.pathname))return route.fulfill({contentType:'text/javascript',body:assets.get(url.pathname)});
    if(url.pathname==='/api/wallet/payments/intents'){
      if(route.request().method()!=='GET'){creates++;return route.fulfill({status:400,json:{error:'Unexpected creation'}});}
      return route.fulfill({json:{intents:reloaded?[]:[order],hasMore:false}});
    }
    if(url.pathname==='/api/wallet/transactions')return route.fulfill({json:{transactions:checks===2?[{...order,asset:'TON',amount:0.01,status:'confirmed'}]:[]}});
    if(url.pathname==='/api/wallet/payments/confirm'){
      assert.equal(route.request().method(),'POST');
      assert.deepEqual(route.request().postDataJSON(),{provider:'ton',transactionId:order.transactionId,amount:0.01,asset:'TON'});
      checks++;
      return checks===1?route.fulfill({status:409,json:{error:'Conflict'}}):route.fulfill({json:{transaction:{transactionId:order.transactionId,status:'confirmed'}}});
    }
    return route.abort();
  });
  const page=await ctx.newPage();
  page.on('pageerror',error=>console.error('Fixture page:',error.message));
  await page.goto(origin+'/retry');
  const check=page.locator('.payment-check-button'), buy=page.locator('.wallet-card button.primary');
  await check.click();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent && !document.querySelector('.payment-check-button')?.disabled);
  const feedback=await page.locator('[role=status]').innerText();
  assert.equal(feedback,expectedMessage);
  assert.equal(await buy.isDisabled(),true);
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mtx.ton.pending.v2:wallet-test')));
  assert.deepEqual((await saved()).map(o=>o.transactionId),[order.transactionId]);
  reloaded=true;
  await page.reload();
  await check.waitFor();
  await check.click();
  await page.locator('.transaction-row').waitFor();
  assert.equal(await check.count(),0);
  assert.deepEqual(await saved(),[]);
  assert.equal(await page.locator('.transaction-row').count(),1);
  assert.deepEqual({checks,creates,sends},{checks:2,creates:0,sends:0});
  console.log('WALLET_RETRY_UI_PASS', {language,feedback,checks,creates,sends});
  await ctx.close();
 }
} finally { await browser.close(); }
