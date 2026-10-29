/* global document, window, navigator */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { build } from 'vite';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Optional tooling stays out of Render's production build.
// PLAYWRIGHT_MODULE_PATH may point at an already installed Playwright entry file.
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright');
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
process.chdir(projectRoot);
// Isolated UI checks: synthetic session and intercepted API; never real rewards.
const origin = 'http://127.0.0.1:4188';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {DailyRewardPage} from '/src/pages/DailyRewardPage.tsx';
import {MissionsPage} from '/src/pages/MissionsPage.tsx';
import {ReferralPage} from '/src/pages/ReferralPage.tsx';
import {InventoryPage} from '/src/pages/InventoryPage.tsx';
import {appendTap, pendingTapCount} from '/src/services/tapOutboxService.ts';
import {useAppStore} from '/src/store/useAppStore.ts';
import {setApiSession} from '/src/api/httpClient.ts';
import '/src/styles/tokens.css';
import '/src/animations/motion.css';
import '/src/index.css';
const now=Math.floor(Date.now()/1000);
setApiSession({token:'fixture.'+btoa(JSON.stringify({sub:'reward-review',iat:now,exp:now+900}))+'.fixture',sessionKey:btoa('local-layout-test-only-32-byte-key')});
useAppStore.setState({authStatus:'authenticated',user:{id:'reward-review',username:'Review',avatar:'',isAdmin:false}});
window.expireReviewSession=()=>useAppStore.setState({authStatus:'expired'});
window.switchReviewAccount=()=>useAppStore.setState({user:{id:'other-review',username:'Other',avatar:'',isAdmin:false}});
const root=createRoot(document.getElementById('root'));
window.unmountReviewPage=()=>root.unmount();
window.inventoryReviewState=()=>({score:useAppStore.getState().score,skin:useAppStore.getState().inventory.equippedSkin,pending:pendingTapCount(localStorage,'reward-review')});
window.seedReviewTap=()=>appendTap(localStorage,'reward-review');
root.render(React.createElement(BrowserRouter,null,React.createElement(location.pathname==='/inventory'?InventoryPage:location.pathname==='/daily'?DailyRewardPage:location.pathname==='/referral'?ReferralPage:MissionsPage)));
`;
const result = await build({configFile:false,publicDir:false,define:{'import.meta.env.VITE_API_BASE':JSON.stringify('')},plugins:[{name:'rewards-review',resolveId(id){if(id==='/rewards-review-entry.js')return '\0rewards-review';},load(id){if(id==='\0rewards-review')return entry;}}],build:{write:false,rollupOptions:{input:'tests/ui/rewards.html'}}});
const assets=new Map(result.output.map(item=>['/'+item.fileName,item.type==='asset'?item.source:item.code]));
const html=assets.get('/tests/ui/rewards.html');
assert.ok(html);
const browser=await chromium.launch({headless:true,
  ...(process.env.REWARDS_BROWSER_PATH ? {executablePath:process.env.REWARDS_BROWSER_PATH} : {})});
let passed=0;
try {
  for(const pageKind of ['daily','missions']) {
    for(const scenario of ['repeat-click','network-error','accepted-response-lost','refresh-error','load-error','expired-session','late-response','account-switch','unmount',...(pageKind==='daily'?['cross-action']:[])]) {
      const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
      context.setDefaultTimeout(10000);
      let claimed=false, attempts=0, failedRead=false;
      const releases=[];
      const errors=[];
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==origin)return route.abort();
        if(url.pathname==='/daily'||url.pathname==='/missions')return route.fulfill({contentType:'text/html',body:html});
        if(assets.has(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:assets.get(url.pathname)});
        if(url.pathname.startsWith('/api/')) {
          if(route.request().method()==='POST') {
            attempts++;
            if(scenario==='network-error'||scenario==='accepted-response-lost') {
              claimed=scenario==='accepted-response-lost';
              return route.abort('connectionfailed');
            }
            await new Promise(resolve=>releases.push(resolve));
            if(claimed)return route.fulfill({status:409,json:{error:'ALREADY_CLAIMED'}});
            claimed=true;
            return route.fulfill({json:{reward:pageKind==='daily'?100:300}});
          }
          if(!failedRead && (scenario==='load-error'||(scenario==='refresh-error'&&claimed))) {
            failedRead=true;
            return route.fulfill({status:503,json:{error:'Temporary failure'}});
          }
          if(url.pathname==='/api/daily')return route.fulfill({json:{streak:claimed?1:0,reward:100,claimed}});
          if(url.pathname==='/api/daily/challenges')return route.fulfill({json:{combo:{slots:3,reward:750,claimed:false},cipher:{hint:'The current game name',length:3,reward:500,claimed:false}}});
          if(url.pathname==='/api/missions')return route.fulfill({json:{missions:[{id:'daily-taps',title:'Make 500 verified taps today',progress:500,target:500,reward:300,claimed,period:'daily'}]}});
          throw new Error('Unexpected fixture API path '+url.pathname);
        }
        return route.fulfill({status:404,body:''});
      });
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/'+pageKind);
      const button=page.locator(pageKind==='daily'?'.daily-card .button':'.social-card .button');
      if(scenario==='load-error') {
        await page.getByRole('alert').waitFor();
        assert.equal(await page.locator('.daily-card .button:not(:disabled),.social-card .button:not(:disabled)').count(),0);
        await page.getByRole('button',{name:'Refresh reward status'}).click();
      }
      await button.waitFor();
      await page.waitForFunction(()=>document.querySelector('.daily-card .button,.social-card .button')?.disabled===false);
      const observations={page:pageKind,scenario};
      if(scenario==='expired-session') {
        await page.evaluate(()=>window.expireReviewSession());
        await page.waitForTimeout(50);
        assert.equal(await page.locator('.daily-card .button:not(:disabled),.social-card .button:not(:disabled)').count(),0);
        assert.equal(attempts,0);
        observations.claimBlocked=true;
      } else if(['repeat-click','refresh-error','late-response','account-switch','unmount','cross-action'].includes(scenario)) {
        if(scenario==='cross-action') {
          for(let i=0;i<3;i++) await page.locator('.combo-option').nth(i).click();
          await page.getByLabel('Daily cipher answer').fill('MTX');
          await page.locator('.daily-card .button,.challenge-grid .button').evaluateAll(elements=>{
            for(const element of elements) element.click();
          });
        } else {
          await button.evaluate(el=>{el.click();el.click();});
        }
        for(let i=0;!releases.length&&i<100;i++)await page.waitForTimeout(20);
        assert.equal(attempts,1);
        assert.equal(await button.isDisabled(),true);
        if(scenario==='unmount')await page.evaluate(()=>window.unmountReviewPage());
        if(scenario==='late-response')await page.evaluate(()=>window.expireReviewSession());
        if(scenario==='account-switch') {
          await page.evaluate(()=>window.switchReviewAccount());
          await page.waitForFunction(()=>document.querySelector('.daily-card .button,.social-card .button')?.disabled===false);
        }
        for(const release of releases)release();
        if(scenario==='unmount') {
          await page.waitForTimeout(200);
          assert.equal(await page.locator('#root > *').count(),0);
        } else if(scenario==='account-switch') {
          await page.waitForTimeout(200);
          assert.equal(await button.isDisabled(),false,'Old account response cannot mark the new account claimed');
          assert.equal(await page.locator('.challenge-feedback.success').count(),0);
        } else if(scenario==='late-response') {
          await page.waitForTimeout(200);
          assert.equal(await page.locator('.social-card').count(),0);
          assert.equal(await page.locator('.daily-card .button:not(:disabled)').count(),0);
          assert.equal(await page.locator('.challenge-feedback.success').count(),0);
        } else {
          if(scenario==='refresh-error') {
            await page.getByRole('alert').waitFor();
            assert.match(await page.getByRole('alert').innerText(),/accepted/);
            await page.getByRole('button',{name:'Refresh reward status'}).click();
          }
          await page.waitForFunction(()=>/Come back tomorrow|Claimed/.test(document.querySelector('.daily-card .button,.social-card .button')?.textContent??''));
          await page.reload();
          await page.waitForFunction(()=>/Come back tomorrow|Claimed/.test(document.querySelector('.daily-card .button,.social-card .button')?.textContent??''));
          assert.equal(await button.isDisabled(),true);
        }
        assert.equal(attempts,1);
        observations.singleRequest=true;
      } else if(scenario!=='load-error') {
        await button.click();
        await page.getByRole('alert').waitFor();
        assert.equal(await page.locator('.daily-card .button:not(:disabled),.social-card .button:not(:disabled)').count(),0);
        await page.getByRole('button',{name:'Refresh reward status'}).click();
        await page.waitForFunction(()=>!document.querySelector('[role="alert"]')&&!document.body.innerText.includes('Loading reward status'));
        await button.waitFor();
        assert.equal(await button.isDisabled(),claimed);
        assert.equal(attempts,1,'Refresh must never repeat the claim');
        observations.visibleErrorAndReadOnlyRecovery=true;
      }
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify(observations));
      passed++;
      await context.close();
    }
  }
  let referralPassed=0;
  for(const scenario of ['repeat-click','network-error','accepted-response-lost','refresh-error','load-error','expired-session','late-response','account-switch','unmount','clipboard-ok','clipboard-denied','clipboard-late']) {
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    context.setDefaultTimeout(10000);
    let attempts=0, accepted=false, failedRead=false, account='reward-review';
    const releases=[], errors=[];
    await context.addInitScript((mode)=>{
      window.fixtureCopies=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        writeText:async value=>{
          window.fixtureCopies.push(value);
          if(mode==='clipboard-denied') throw new Error('Permission denied');
          if(mode==='clipboard-late') await new Promise(resolve=>{window.releaseFixtureCopy=resolve;});
        }
      }});
    },scenario);
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/referral')return route.fulfill({contentType:'text/html',body:html});
      if(assets.has(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:assets.get(url.pathname)});
      if(url.pathname==='/api/referral/accept' && route.request().method()==='POST') {
        attempts++;
        const body=route.request().postDataJSON();
        assert.equal(body.code,'MTX-friend');
        assert.match(body.deviceHash,/^[a-f0-9]{64}$/);
        if(scenario==='network-error'||scenario==='accepted-response-lost') {
          accepted=scenario==='accepted-response-lost';
          return route.abort('connectionfailed');
        }
        await new Promise(resolve=>releases.push(resolve));
        accepted=true;
        return route.fulfill({json:{ok:true}});
      }
      if(url.pathname==='/api/referral' && route.request().method()==='GET') {
        if(!failedRead && (scenario==='load-error'||(scenario==='refresh-error'&&accepted))) {
          failedRead=true; return route.fulfill({status:503,json:{error:'Temporary failure'}});
        }
        return route.fulfill({json:{code:'MTX-'+account,invited:2,earned:1000}});
      }
      return route.fulfill({status:404,body:''});
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/referral');
    const apply=page.getByRole('button',{name:'Apply code',exact:true});
    const input=page.getByRole('textbox',{name:'Referral code',exact:true});
    const copy=page.getByRole('button',{name:'Copy invite link',exact:true});
    if(scenario==='load-error') {
      await page.getByRole('alert').waitFor();
      assert.equal(await copy.isDisabled(),true);
      await page.getByRole('button',{name:'Refresh referral status'}).click();
    }
    await page.waitForFunction(()=>document.querySelector('.referral-card > strong')?.textContent==='MTX-reward-review');
    if(scenario.startsWith('clipboard-')) {
      await copy.evaluate(el=>{el.click();el.click();});
      await page.waitForFunction(()=>window.fixtureCopies.length===1);
      if(scenario==='clipboard-late') {
        await page.evaluate(()=>window.expireReviewSession());
        await page.waitForFunction(()=>document.querySelector('.referral-card > strong')?.textContent==='—');
        await page.evaluate(()=>window.releaseFixtureCopy());
        await page.waitForTimeout(100);
        assert.equal(await page.getByText('Invite link copied.',{exact:true}).count(),0);
      } else {
        await page.getByText(scenario==='clipboard-ok'?'Invite link copied.':'Could not copy the link. Check clipboard permission and try again.',{exact:true}).waitFor();
      }
      const copies=await page.evaluate(()=>window.fixtureCopies);
      assert.equal(copies.length,1);
      const invite=new URL(copies[0]);
      assert.equal(invite.origin,'https://t.me');
      assert.equal(invite.searchParams.get('startapp'),'MTX-reward-review');
      assert.equal(attempts,0);
    } else if(scenario==='expired-session') {
      await input.fill('MTX-friend');
      await page.evaluate(()=>window.expireReviewSession());
      await page.waitForFunction(()=>document.querySelector('.referral-card > strong')?.textContent==='—');
      assert.equal(await apply.isDisabled(),true);
      assert.equal(await copy.isDisabled(),true);
      assert.equal(attempts,0);
    } else if(scenario!=='load-error') {
      await input.fill('  MTX-friend  ');
      await apply.evaluate(el=>{el.click();el.click();});
      if(scenario==='network-error'||scenario==='accepted-response-lost') {
        await page.getByRole('alert').waitFor();
        assert.equal(await apply.isDisabled(),true);
        await page.getByRole('button',{name:'Refresh referral status'}).click();
        await page.waitForFunction(()=>document.querySelector('.referral-card > strong')?.textContent==='MTX-reward-review');
        assert.equal(await page.getByText('Referral code accepted.',{exact:true}).count(),0);
      } else {
        for(let i=0;!releases.length&&i<100;i++)await page.waitForTimeout(20);
        assert.equal(attempts,1);
        assert.equal(await input.isDisabled(),true);
        if(scenario==='late-response')await page.evaluate(()=>window.expireReviewSession());
        if(scenario==='unmount')await page.evaluate(()=>window.unmountReviewPage());
        if(scenario==='account-switch') {
          account='other-review';
          await page.evaluate(()=>window.switchReviewAccount());
          await page.waitForFunction(()=>document.querySelector('.referral-card > strong')?.textContent==='MTX-other-review');
        }
        for(const release of releases)release();
        if(scenario==='refresh-error') {
          await page.getByRole('alert').waitFor();
          assert.match(await page.getByRole('alert').innerText(),/accepted/);
          await page.getByRole('button',{name:'Refresh referral status'}).click();
          await page.waitForFunction(()=>document.querySelector('.referral-card > strong')?.textContent==='MTX-reward-review');
        } else if(scenario==='repeat-click') {
          await page.getByText('Referral code accepted.',{exact:true}).waitFor();
          assert.equal(await input.inputValue(),'');
        } else {
          await page.waitForTimeout(200);
          assert.equal(await page.getByText('Referral code accepted.',{exact:true}).count(),0);
          if(scenario==='unmount')assert.equal(await page.locator('#root > *').count(),0);
          if(scenario==='late-response')assert.equal(await copy.isDisabled(),true);
          if(scenario==='account-switch')assert.equal(await page.locator('.referral-card > strong').innerText(),'MTX-other-review');
        }
      }
      assert.equal(attempts,1,'Recovery must not automatically repeat referral acceptance');
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({page:'referral',scenario,pass:true}));
    referralPassed++;
    await context.close();
  }
  assert.equal(referralPassed,12);
  let inventoryPassed=0;
  for(const scenario of ['repeat-click','cross-action','skin-default','network-error','accepted-response-lost','refresh-error','load-error','expired-session','late-response','account-switch','unmount','taps-first','taps-fail','taps-expired']) {
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    context.setDefaultTimeout(10000);
    let quantity=3,skin='skin:aurora',failedRead=false,mutations=0;
    const posts=[],releases=[],errors=[];
    const fixture=()=>({items:[{itemId:'boost:recharge',category:'boost',quantity,acquiredAt:3},{itemId:'consumable:energy',category:'consumable',quantity:3,acquiredAt:2},{itemId:'skin:aurora',category:'skin',quantity:1,acquiredAt:1}],purchases:[],equippedSkin:skin});
    const game={coins:987,energy:1500,maximumEnergy:1500,profitPerTap:2,profitPerHour:0,tapLevel:1,energyLevel:1,profitLevel:0,version:2};
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/inventory')return route.fulfill({contentType:'text/html',body:html});
      if(assets.has(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:assets.get(url.pathname)});
      if(url.pathname==='/api/inventory'&&route.request().method()==='GET') {
        if(!failedRead&&(scenario==='load-error'||scenario==='refresh-error'&&mutations>0)) {
          failedRead=true;
          return route.fulfill({status:503,json:{error:'Temporary failure'}});
        }
        return route.fulfill({json:fixture()});
      }
      if(route.request().method()==='POST'&&url.pathname.startsWith('/api/')) {
        posts.push(url.pathname);
        if(url.pathname==='/api/game/taps') {
          if(scenario==='taps-fail')return route.abort('connectionfailed');
          if(scenario==='taps-expired')await new Promise(resolve=>releases.push(resolve));
          return route.fulfill({json:{state:game}});
        }
        assert.ok(['/api/inventory/activate','/api/inventory/skin'].includes(url.pathname));
        mutations++;
        if(scenario==='network-error')return route.abort('connectionfailed');
        if(scenario!=='accepted-response-lost')await new Promise(resolve=>releases.push(resolve));
        if(url.pathname.endsWith('/skin'))skin=route.request().postDataJSON().skinId;
        else quantity--;
        if(scenario==='accepted-response-lost')return route.abort('connectionfailed');
        return route.fulfill({json:url.pathname.endsWith('/skin')?{equippedSkin:skin}:{state:game,items:fixture().items}});
      }
      return route.fulfill({status:404,body:''});
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/inventory');
    if(scenario==='load-error') {
      await page.getByRole('alert').waitFor();
      await page.getByRole('button',{name:'Refresh inventory'}).click();
    }
    const buttons=page.locator('.product-card button');
    await buttons.first().waitFor();
    const before=await page.evaluate(()=>window.inventoryReviewState());
    if(scenario==='expired-session') {
      await page.evaluate(()=>window.expireReviewSession());
      await page.getByText('Reopen MTX in Telegram to use inventory.').waitFor();
      assert.equal(await buttons.count(),0);
      assert.equal(mutations,0);
    } else if(scenario==='load-error') {
      assert.equal(mutations,0);
    } else {
      if(scenario.startsWith('taps-'))await page.evaluate(()=>window.seedReviewTap());
      if(scenario==='cross-action')await buttons.evaluateAll(elements=>{for(const el of elements)el.click();});
      else await buttons.nth(scenario==='skin-default'?2:0).evaluate(el=>{el.click();el.click();});
      if(['network-error','accepted-response-lost','taps-fail'].includes(scenario)) {
        await page.getByRole('alert').waitFor();
        assert.equal(await buttons.count(),0);
      } else {
        for(let i=0;!releases.length&&i<100;i++)await page.waitForTimeout(20);
        assert.equal(releases.length,1);
        assert.equal(await page.locator('.product-card button:not(:disabled)').count(),0);
        if(scenario==='unmount')await page.evaluate(()=>window.unmountReviewPage());
        if(scenario==='late-response'||scenario==='taps-expired')await page.evaluate(()=>window.expireReviewSession());
        if(scenario==='account-switch')await page.evaluate(()=>window.switchReviewAccount());
        for(const release of releases)release();
      }
      if(['network-error','accepted-response-lost','refresh-error','taps-fail'].includes(scenario)) {
        await page.getByRole('alert').waitFor();
        await page.getByRole('button',{name:'Refresh inventory'}).click();
        await buttons.first().waitFor();
        assert.equal(await page.locator('.product-card strong').first().innerText(),'Quantity: '+quantity);
        assert.equal(mutations,scenario==='taps-fail'?0:1,'GET recovery must not repeat consumption');
      } else if(['late-response','account-switch','unmount','taps-expired'].includes(scenario)) {
        await page.waitForTimeout(200);
        const after=await page.evaluate(()=>window.inventoryReviewState());
        assert.equal(after.score,before.score,'Stale response must not change global game state');
        if(scenario==='taps-expired')assert.equal(after.pending,1,'Unacknowledged tap must remain recoverable');
      } else {
        await page.getByText(scenario==='skin-default'?'Default MTX appearance restored.':'Recharge used once. Energy is now full.',{exact:true}).waitFor();
        assert.equal(mutations,1);
        if(scenario==='skin-default')assert.equal(await page.evaluate(()=>window.inventoryReviewState().skin),null);
        else assert.equal(await page.locator('.product-card strong').first().innerText(),'Quantity: 2');
      }
      if(scenario==='taps-first')assert.deepEqual(posts,['/api/game/taps','/api/inventory/activate']);
      if(scenario==='taps-fail'||scenario==='taps-expired')assert.deepEqual(posts,['/api/game/taps']);
      assert.ok(mutations<=1);
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({page:'inventory',scenario,pass:true}));
    inventoryPassed++;
    await context.close();
  }
  assert.equal(inventoryPassed,14);
  console.log('MTX_INVENTORY_UI_PASS '+inventoryPassed+' isolated scenarios');
  console.log('MTX_REFERRAL_UI_PASS '+referralPassed+' isolated scenarios');
  assert.equal(passed,19);
  console.log('MTX_REWARD_UI_PASS '+passed+' isolated scenarios; no live API requests');
} finally {await browser.close();}
