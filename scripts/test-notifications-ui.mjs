/* global window, document, CustomEvent */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { build } from 'vite';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath=process.env.PLAYWRIGHT_MODULE_PATH;
const {chromium}=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'playwright');
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const origin='http://127.0.0.1:4190';
const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {NotificationsPage} from '/src/pages/NotificationsPage.tsx';
import {NotificationBell} from '/src/components/notifications/NotificationBell.tsx';
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
root.render(React.createElement(BrowserRouter,null,React.createElement(React.Fragment,null,React.createElement(NotificationsPage),React.createElement(NotificationBell))));
`;
const result=await build({configFile:false,publicDir:false,define:{'import.meta.env.VITE_API_BASE':JSON.stringify(''),'import.meta.env.VITE_LEADERBOARD_WS':JSON.stringify('wss://fixture.invalid/live')},plugins:[{name:'notifications-review',resolveId(id){if(id==='/rewards-review-entry.js')return '\0notifications-review';},load(id){if(id==='\0notifications-review')return entry;}}],build:{write:false,rollupOptions:{input:'tests/ui/rewards.html'}}});
const assets=new Map(result.output.map(item=>['/'+item.fileName,item.type==='asset'?item.source:item.code]));
const html=assets.get('/tests/ui/rewards.html');
const browser=await chromium.launch({headless:true,...(process.env.REWARDS_BROWSER_PATH?{executablePath:process.env.REWARDS_BROWSER_PATH}:{})});

const inbox=(name='review',read=false,fresh=false)=> {
 const notifications=[{id:name+':1',kind:'reward',title:'Reward',message:name+' earned 100 MTX',createdAt:1000,read}];
 if(fresh)notifications.unshift({id:name+':2',kind:'announcement',title:'New notice',message:'Arrived after marking',createdAt:2000,read:false});
 return {notifications,unreadCount:notifications.filter(item=>!item.read).length};
};
let passed=0;
try {
 for(const scenario of ['normal','new-notice','empty','all-read','badge-cap','expired-before','load-error','duplicate','network-error','accepted-response-lost','refresh-error','bad-ack','account-late','expired-late','unmount','read-account-late','bell-stale','bell-single-flight','bell-failure','foreign-event']) {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  context.setDefaultTimeout(10000);
  await context.addInitScript(()=>{
   const timers=new Map();let id=0;
   window.setInterval=callback=>{timers.set(++id,callback);return id;};
   window.clearInterval=id=>timers.delete(id);
   window.reviewTick=()=>{for(const callback of timers.values())callback();};
   window.reviewTimerCount=()=>timers.size;
   window.reviewNoticeChange=userId=>window.dispatchEvent(new CustomEvent('mtx:notifications-read',{detail:{userId}}));
  });
  let reads=0,posts=0,account='review',marked=false,failReads=false,holdRead=false;
  const releases=[],postReleases=[],errors=[];
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/notifications')return route.fulfill({contentType:'text/html',body:html});
   if(assets.has(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:assets.get(url.pathname)});
   if(url.pathname==='/api/notifications'&&route.request().method()==='GET') {
    reads++;
    const name=account,read=reads;
    let data=inbox(name,marked,scenario==='new-notice'&&marked||scenario==='bell-stale'&&marked);
    if(scenario==='all-read')data=inbox(name,true);
    if(scenario==='badge-cap')data={notifications:Array.from({length:105},(_,i)=>({...inbox(name).notifications[0],id:name+':'+i})),unreadCount:105};
    if(scenario==='empty')data={notifications:[],unreadCount:0};
    if(scenario==='duplicate'&&read<=2)data.notifications.push(data.notifications[0]);
    if(holdRead||scenario==='read-account-late'&&read<=2)await new Promise(resolve=>releases.push(resolve));
    if(failReads||scenario==='load-error'&&read<=2)return route.fulfill({status:503,json:{error:'Unavailable'}});
    return route.fulfill({json:data});
   }
   if(url.pathname==='/api/notifications/read-all'&&route.request().method()==='POST') {
    posts++;assert.deepEqual(route.request().postDataJSON(),{});
    if(scenario==='network-error')return route.abort('connectionfailed');
    if(scenario!=='accepted-response-lost')await new Promise(resolve=>postReleases.push(resolve));
    marked=true;
    if(scenario==='accepted-response-lost')return route.abort('connectionfailed');
    if(scenario==='refresh-error')failReads=true;
    return route.fulfill({json:scenario==='bad-ack'?{ok:false}:{ok:true}});
   }
   if(url.pathname.startsWith('/api/'))throw new Error('Unexpected API request '+url.pathname);
   return route.fulfill({status:404,body:''});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/notifications');
  const rows=page.locator('.notification-item'),badge=page.locator('.notification-bell b');
  const mark=page.getByRole('button',{name:'Mark all read',exact:true});
  if(scenario==='read-account-late') {
   for(let i=0;releases.length<2&&i<100;i++)await page.waitForTimeout(20);
   assert.equal(releases.length,2);
   account='other';await page.evaluate(()=>window.reviewAccount('other'));
   await page.getByText('other earned 100 MTX').waitFor();
   for(const release of releases)release();
   await page.waitForTimeout(100);
   assert.equal(await page.getByText('review earned 100 MTX').count(),0);
   assert.equal(await badge.innerText(),'1');
  } else if(scenario==='empty') {
   await page.getByText('No notifications yet.').waitFor();
   assert.equal(await mark.count(),0);assert.equal(await badge.count(),0);
  } else if(scenario==='all-read') {
   await rows.first().waitFor();
   assert.equal(await page.locator('.notification-item.unread').count(),0);
   assert.equal(await mark.count(),0);assert.equal(await badge.count(),0);assert.equal(posts,0);
  } else {
   if(scenario==='load-error'||scenario==='duplicate') {
    await page.getByRole('alert').waitFor();
    assert.equal(await mark.count(),0);assert.equal(await badge.count(),0);
    await page.getByRole('button',{name:'Retry',exact:true}).click();
   }
   await mark.waitFor();
   if(!['load-error','duplicate'].includes(scenario))await badge.waitFor();
   if(scenario==='expired-before') {
    await page.evaluate(()=>window.reviewExpire());
    await page.getByText('Open MTX inside Telegram to view notifications.').waitFor();
    assert.equal(await mark.count(),0);assert.equal(await badge.count(),0);
    assert.equal(posts,0);assert.equal(await page.evaluate(()=>window.reviewTimerCount()),0);
   } else if(scenario==='badge-cap') {
    assert.equal(await badge.innerText(),'99+');assert.equal(posts,0);
   } else if(scenario==='foreign-event') {
    await page.evaluate(()=>window.reviewNoticeChange('unrelated'));
    await page.waitForTimeout(100);
    assert.equal(reads,2);assert.equal(await badge.innerText(),'1');
   } else if(scenario==='bell-single-flight') {
    holdRead=true;
    await page.evaluate(()=>{window.reviewTick();window.reviewTick();window.reviewTick();});
    for(let i=0;!releases.length&&i<100;i++)await page.waitForTimeout(20);
    assert.equal(reads,3);assert.equal(releases.length,1);
    holdRead=false;for(const release of releases)release();
   } else if(scenario==='bell-failure') {
    failReads=true;await page.evaluate(()=>window.reviewTick());
    await page.waitForFunction(()=>!document.querySelector('.notification-bell b'));
    failReads=false;await page.evaluate(()=>window.reviewTick());await badge.waitFor();
    assert.equal(await badge.innerText(),'1');
   } else if(!['load-error','duplicate'].includes(scenario)) {
    if(scenario==='bell-stale') {
     holdRead=true;await page.evaluate(()=>window.reviewTick());
     for(let i=0;!releases.length&&i<100;i++)await page.waitForTimeout(20);
     assert.equal(releases.length,1);holdRead=false;
    }
    await mark.evaluate(el=>{el.click();el.click();});
    if(!['network-error','accepted-response-lost'].includes(scenario)) {
     for(let i=0;!postReleases.length&&i<100;i++)await page.waitForTimeout(20);
     assert.equal(posts,1);
     assert.equal(await page.getByRole('button',{name:'Saving…',exact:true}).isDisabled(),true);
     if(scenario==='account-late'){account='other';await page.evaluate(()=>window.reviewAccount('other'));await page.getByText('other earned 100 MTX').waitFor();}
     if(scenario==='expired-late')await page.evaluate(()=>window.reviewExpire());
     if(scenario==='unmount')await page.evaluate(()=>window.reviewUnmount());
     for(const release of postReleases)release();
    }
    if(['network-error','accepted-response-lost','refresh-error','bad-ack'].includes(scenario)) {
     await page.getByRole('alert').waitFor();
     assert.equal(await mark.count(),0);
     failReads=false;
     await page.getByRole('button',{name:'Retry',exact:true}).click();
     await rows.first().waitFor();
     assert.equal(await page.locator('.notification-item.unread').count(),marked?0:1);
     assert.equal(posts,1,'Recovery must never repeat marking');
    } else if(['account-late','expired-late','unmount'].includes(scenario)) {
     await page.waitForTimeout(100);
     if(scenario==='account-late') {
      assert.equal(await page.locator('.notification-item.unread').count(),1);
      assert.equal(await badge.innerText(),'1');
      assert.equal(reads,4,'Old account completion cannot refetch or clear the current account badge');
     } else {assert.equal(await rows.count(),0);assert.equal(await badge.count(),0);assert.equal(await page.evaluate(()=>window.reviewTimerCount()),0);}
    } else {
     await page.waitForFunction(()=>document.querySelectorAll('.notification-item:not(.unread)').length===1);
     if(scenario==='bell-stale') {
      for(const release of releases)release();
      await badge.waitFor();assert.equal(await badge.innerText(),'1');
      assert.equal(await page.locator('.notification-item.unread').count(),1);
     } else if(scenario==='new-notice') {
      await page.getByText('Arrived after marking').waitFor();
      assert.equal(await page.locator('.notification-item.unread').count(),1);
      await badge.waitFor();assert.equal(await badge.innerText(),'1');
     } else {
      await page.waitForFunction(()=>!document.querySelector('.notification-bell b'));
      assert.equal(await mark.count(),0);
      await page.reload();await rows.first().waitFor();
      assert.equal(await page.locator('.notification-item.unread').count(),0);
     }
    }
    assert.equal(posts,1);
   }
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({page:'notifications',scenario,pass:true}));
  passed++;await context.close();
 }
 assert.equal(passed,20);
 console.log('MTX_NOTIFICATIONS_UI_PASS '+passed+' isolated scenarios');
} finally {await browser.close();}
