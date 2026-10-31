/* global window, document, EventTarget, Event, MessageEvent */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { build } from 'vite';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath=process.env.PLAYWRIGHT_MODULE_PATH;
const {chromium}=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'playwright');
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const origin='http://127.0.0.1:4189';
const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {HistoryPage} from '/src/pages/HistoryPage.tsx';
import {LeaderboardPage} from '/src/pages/LeaderboardPage.tsx';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import '/src/styles/tokens.css';
import '/src/animations/motion.css';
import '/src/index.css';
window.reviewAccount=(id='review')=>{
 const now=Math.floor(Date.now()/1000);
 setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:id,iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
 useAppStore.setState({authStatus:'authenticated',user:{id,username:id,avatar:'',isAdmin:false}});
};
window.reviewAccount();
window.reviewExpire=()=>useAppStore.setState({authStatus:'expired'});
const root=createRoot(document.getElementById('root'));
window.reviewUnmount=()=>root.unmount();
root.render(React.createElement(BrowserRouter,null,React.createElement(location.pathname==='/history'?HistoryPage:LeaderboardPage)));
`;
const result=await build({configFile:false,publicDir:false,define:{'import.meta.env.VITE_API_BASE':JSON.stringify(''),'import.meta.env.VITE_LEADERBOARD_WS':JSON.stringify('wss://fixture.invalid/live')},plugins:[{name:'activity-review',resolveId(id){if(id==='/rewards-review-entry.js')return '\0activity-review';},load(id){if(id==='\0activity-review')return entry;}}],build:{write:false,rollupOptions:{input:'tests/ui/rewards.html'}}});
const assets=new Map(result.output.map(item=>['/'+item.fileName,item.type==='asset'?item.source:item.code]));
const html=assets.get('/tests/ui/rewards.html');
const browser=await chromium.launch({headless:true,...(process.env.REWARDS_BROWSER_PATH?{executablePath:process.env.REWARDS_BROWSER_PATH}:{})});
const history=(name='review')=>({purchases:[{id:'same',itemId:'boost:recharge',price:1250,createdAt:1000}],payments:['confirmed','pending','failed','refunded'].map((status,i)=>({transactionId:'p'+i,provider:'ton',asset:'TON',amount:0.01,creditedCoins:100,status,createdAt:2000+i})),rewards:[{id:'same',title:name+' reward',amount:300,createdAt:3000}]});
const leaders=(name='review')=>[{userId:name,username:name,coins:1250,rank:1}];
let passed=0;
try {
 for(const kind of ['history','leaderboard']) {
  const scenarios=['normal','empty','load-error','duplicate','account-late','expired-late','unmount',...(kind==='history'?['filters','legacy-date']:['scope-late','poll-single-flight','poll-failure','socket-malformed','socket-newer','socket-silent','socket-stale','scroll-shrink'])];
  for(const scenario of scenarios) {
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
   context.setDefaultTimeout(10000);
   await context.addInitScript(()=>{
    const timers=new Map();let timer=0,offset=0;
    const now=Date.now;
    Date.now=()=>now()+offset;
    window.setInterval=callback=>{timers.set(++timer,callback);return timer;};
    window.clearInterval=id=>timers.delete(id);
    window.reviewTick=()=>{offset+=5000;for(const callback of timers.values())callback();};
    window.reviewTimerCount=()=>timers.size;
    window.reviewSockets=[];
    window.WebSocket=class extends EventTarget {
     constructor(){super();window.reviewSockets.push(this);}
     send(){}
     close(){this.dispatchEvent(new Event('close'));}
    };
    window.reviewSocket=(type,data)=>window.reviewSockets.at(-1).dispatchEvent(type==='message'?new MessageEvent(type,{data}):new Event(type));
   });
   const errors=[],releases=[];let reads=0,account='review',failNext=false;
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/'+kind)return route.fulfill({contentType:'text/html',body:html});
    if(assets.has(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:assets.get(url.pathname)});
    if(url.pathname.startsWith('/api/')) {
     assert.equal(route.request().method(),'GET','Read-only pages must never mutate data');
     reads++;
     const read=reads,name=account,scope=url.searchParams.get('scope');
     if((['account-late','expired-late','unmount','scope-late','socket-newer'].includes(scenario)&&read===1)||(scenario==='poll-single-flight'&&read===2))await new Promise(resolve=>releases.push(resolve));
     if((scenario==='load-error'&&read===1)||failNext){failNext=false;return route.fulfill({status:503,json:{error:'Unavailable'}});}
     let data=kind==='history'?history(name):{entries:leaders(scope==='friends'?'friend':name)};
     if(scenario==='legacy-date')data.rewards[0]={...data.rewards[0],createdAt:Date.parse('2026-10-26T00:00:00Z'),dateOnly:'2026-10-26'};
     if(scenario==='scroll-shrink'&&read===1)data={entries:Array.from({length:100},(_,i)=>({userId:'u'+i,username:'User '+i,coins:100-i,rank:i+1}))};
     if(scenario==='empty')data=kind==='history'?{purchases:[],payments:[],rewards:[]}:{entries:[]};
     if(scenario==='duplicate'&&read===1){if(kind==='history')data.purchases.push(data.purchases[0]);else data.entries.push(data.entries[0]);}
     return route.fulfill({json:data});
    }
    return route.fulfill({status:404,body:''});
   });
   const page=await context.newPage();
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/'+kind);
   const rows=page.locator(kind==='history'?'.activity-item':'.leaderboard-entry');
   if(['account-late','expired-late','unmount','scope-late','socket-newer'].includes(scenario)) {
    for(let i=0;!releases.length&&i<100;i++)await page.waitForTimeout(20);
    assert.equal(releases.length,1);
    if(scenario==='account-late'){account='other';await page.evaluate(()=>window.reviewAccount('other'));await rows.first().waitFor();}
    if(scenario==='expired-late')await page.evaluate(()=>window.reviewExpire());
    if(scenario==='unmount')await page.evaluate(()=>window.reviewUnmount());
    if(scenario==='scope-late'){await page.getByRole('button',{name:'👥 Friends'}).click();await rows.first().waitFor();}
    if(scenario==='socket-newer'){await page.evaluate(()=>window.reviewSocket('message',JSON.stringify({type:'leaderboard',entries:[{userId:'new',username:'Newest',coins:2000,rank:1}]})));await rows.first().waitFor();}
    for(const release of releases)release();
    await page.waitForTimeout(150);
    if(scenario==='account-late'){assert.match(await rows.allTextContents().then(x=>x.join(' ')),/other/);assert.doesNotMatch(await rows.allTextContents().then(x=>x.join(' ')),/review/);}
    if(scenario==='expired-late'||scenario==='unmount'){assert.equal(await rows.count(),0);if(kind==='leaderboard')assert.equal(await page.evaluate(()=>window.reviewTimerCount()),0);}
    if(scenario==='scope-late')assert.match(await rows.innerText(),/friend/);
    if(scenario==='socket-newer')assert.match(await rows.innerText(),/Newest/);
   } else if(scenario==='empty') {
    await page.getByText(kind==='history'?'No activity in this category yet.':'No ranking data for this period yet.').waitFor();
    assert.equal(await rows.count(),0);
   } else {
    if(scenario==='load-error'||scenario==='duplicate') {
     await page.getByRole('alert').waitFor();
     assert.equal(await rows.count(),0);
     await page.getByRole('button',{name:'Retry',exact:true}).evaluate(el=>{el.click();el.click();});
    }
    await rows.first().waitFor();
    if(kind==='history') {
     assert.equal(await rows.count(),6);
     assert.match(await rows.first().innerText(),/review reward/);
     assert.equal(await page.locator('.activity-item .positive').count(),2,'Only confirmed payment and actual reward show credit');
     assert.equal(await page.getByText('No credit',{exact:true}).count(),3);
     assert.match(await rows.last().innerText(),/−1,250 MTX/);
     if(scenario==='legacy-date')assert.equal(await rows.first().locator('time').innerText(),'2026-10-26 · UTC date; exact time unavailable');
     if(scenario==='filters') {
      for(const [tab,count] of [['Payments',4],['Rewards',1],['Purchases',1],['All',6]]){await page.getByRole('tab',{name:tab}).click();assert.equal(await rows.count(),count);}
      assert.equal(reads,1,'Filtering must not refetch or create records');
     }
    } else {
     if(scenario!=='scroll-shrink')assert.equal(await rows.count(),1);
     if(scenario==='normal')assert.equal(await page.locator('.current-player').count(),1);
     if(scenario==='poll-single-flight') {
      await page.evaluate(()=>{window.reviewTick();window.reviewTick();window.reviewTick();});
      for(let i=0;!releases.length&&i<100;i++)await page.waitForTimeout(20);
      assert.equal(reads,2,'Only one polling request can be pending');
      for(const release of releases)release();
     }
     if(scenario==='poll-failure') {
      failNext=true;await page.evaluate(()=>window.reviewTick());await page.getByRole('alert').waitFor();assert.equal(await rows.count(),0);
      await page.getByRole('button',{name:'Retry',exact:true}).click();await rows.first().waitFor();
     }
     if(scenario==='socket-malformed') {
      await page.evaluate(()=>window.reviewSocket('message','not-json'));
      await page.evaluate(()=>window.reviewTick());
      for(let i=0;reads<2&&i<100;i++)await page.waitForTimeout(20);
      assert.equal(reads,2);
     }
     if(scenario==='socket-silent') {
      await page.evaluate(()=>window.reviewSocket('open'));
      assert.equal(await page.getByText('Live updates',{exact:true}).count(),0);
      await page.evaluate(()=>window.reviewTick());
      for(let i=0;reads<2&&i<100;i++)await page.waitForTimeout(20);
      assert.equal(reads,2,'Open without valid messages must not disable polling');
     }
     if(scenario==='socket-stale') {
      await page.evaluate(()=>window.reviewSocket('message',JSON.stringify({type:'leaderboard',entries:[{userId:'new',username:'Live user',coins:2000,rank:1}]})));
      await page.getByText('Live updates',{exact:true}).waitFor();
      await page.evaluate(()=>{window.reviewTick();window.reviewTick();});
      for(let i=0;reads<2&&i<100;i++)await page.waitForTimeout(20);
      assert.equal(reads,2,'Stale live data must resume HTTP polling');
     }
     if(scenario==='scroll-shrink') {
      await page.locator('.virtual-list').evaluate(el=>{el.scrollTop=4500;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
      await page.evaluate(()=>window.reviewTick());
      await page.waitForFunction(()=>document.querySelectorAll('.leaderboard-entry').length===1);
      assert.match(await rows.innerText(),/review/,'A shorter refreshed list must not remain scrolled into blank space');
     }
    }
   }
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({page:kind,scenario,pass:true}));
   passed++;await context.close();
  }
 }
 assert.equal(passed,24);
 console.log('MTX_ACTIVITY_UI_PASS '+passed+' isolated read-only scenarios');
} finally {await browser.close();}
