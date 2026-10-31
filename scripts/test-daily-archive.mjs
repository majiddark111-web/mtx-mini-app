import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import pg from 'pg';
import { runMigrations } from '../server/migrations.mjs';
import { PostgresSocialPersistence } from '../server/src/socialPersistence.ts';
import { createGameState } from '../server/src/gameEngine.ts';
import { rewardHistory } from '../server/src/rewardHistory.ts';

// No external connection string is accepted. This creates its own loopback-only
// PostgreSQL cluster and uses synthetic records; it never opens the user's DB.
const bin=process.env.MTX_TEST_POSTGRES_BIN;
if(!bin)throw new Error('Set MTX_TEST_POSTGRES_BIN to an installed PostgreSQL bin directory');
const base=resolve('.build-verification');
await mkdir(base,{recursive:true});
const dir=await mkdtemp(join(base,'daily-archive-'));
const data=join(dir,'data');
const env={...process.env};
for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
const run=(name,args)=>{
 const result=spawnSync(join(bin,name+(process.platform==='win32'?'.exe':'')),args,{env,encoding:'utf8',timeout:60000,windowsHide:true,...(name==='pg_ctl'?{stdio:'ignore'}:{})});
 if(result.error||result.status!==0)throw new Error(name+' failed: '+(result.error?.message??result.stderr??''));
};
const listener=createServer();
await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
const port=listener.address().port;
await new Promise(resolve=>listener.close(resolve));
let started=false,pool,failure;
try {
 run('initdb',['-D',data,'-U','archive_test','-A','trust','--encoding=UTF8','--no-locale']);
 started=true;
 run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
 const connection={host:'127.0.0.1',port,user:'archive_test',database:'postgres',max:4,connectionTimeoutMillis:5000,statement_timeout:10000};
 pool=new pg.Pool(connection);
 const wrap=client=>({query:(sql,values=[])=>client.query(sql,values)});
 const database={...wrap(pool),transaction:async operation=>{
  const client=await pool.connect();
  try {await client.query('BEGIN');const result=await operation(wrap(client));await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
 }};
 const old=join(dir,'baseline');await mkdir(old);
 for(const file of await readdir('server/migrations'))if(/^00[1-5]_.*\.sql$/.test(file))await copyFile(join('server/migrations',file),join(old,file));
 assert.equal((await runMigrations(database,pathToFileURL(old+'/'))).length,5);
 const initial=createGameState('archive-user',Date.now());initial.coins=1000;
 await database.query('INSERT INTO mtx_game_state(user_id,state) VALUES($1,$2)',[initial.userId,JSON.stringify(initial)]);
 await database.query("INSERT INTO mtx_daily_claims VALUES('archive-user','2026-10-26',3)",[]);
 assert.deepEqual(await runMigrations(database),['006_daily_reward_history.sql']);
 const legacy=(await database.query('SELECT * FROM mtx_daily_reward_history',[])).rows;
 assert.equal(legacy.length,1);assert.equal(legacy[0].reward,300);assert.equal(legacy[0].claimed_at,null);
 const state=async()=> (await database.query('SELECT state FROM mtx_game_state WHERE user_id=$1',[initial.userId])).rows[0].state;
 assert.equal((await state()).coins,1000,'Migration must not award legacy credit again');
 const persistence=new PostgresSocialPersistence(database);
 const claim=async(day,yesterday)=>persistence.claimDaily(initial.userId,day,yesterday,await state());
 assert.equal((await claim('2026-10-27','2026-10-26')).state.coins,1400);
 assert.equal((await claim('2026-10-28','2026-10-27')).state.coins,1900);
 assert.equal(await claim('2026-10-28','2026-10-27'),null);
 const same=await state();
 const concurrent=await Promise.allSettled([
  persistence.claimDaily(initial.userId,'2026-10-29','2026-10-28',same),
  persistence.claimDaily(initial.userId,'2026-10-29','2026-10-28',same),
 ]);
 assert.equal(concurrent.filter(result=>result.status==='fulfilled'&&result.value).length,1);
 assert.equal((await state()).coins,2500,'Concurrent claim credits once');
 const before=await state();
 const failing={...database,transaction:operation=>database.transaction(client=>operation({
  query:(sql,values)=>{if(sql.startsWith('INSERT INTO mtx_game_state'))throw new Error('INJECTED_SAVE_FAILURE');return client.query(sql,values);}
 }))};
 await assert.rejects(new PostgresSocialPersistence(failing).claimDaily(initial.userId,'2026-10-30','2026-10-29',before),/INJECTED_SAVE_FAILURE/);
 assert.deepEqual(await state(),before);
 assert.equal((await database.query("SELECT count(*)::int AS n FROM mtx_daily_reward_history WHERE claim_day='2026-10-30'",[])).rows[0].n,0);
 assert.equal((await persistence.daily(initial.userId)).day,'2026-10-29','Failed credit rolls back latest claim too');
 await assert.rejects(claim('2026-10-27','2026-10-26'),/DAILY_ALREADY_CLAIMED/);
 assert.deepEqual(await state(),before,'Archive duplicate failure must roll back claim and credit');
 assert.equal((await claim('2026-10-30','2026-10-29')).streak,7);
 assert.equal((await claim('2026-10-31','2026-10-30')).streak,7);
 assert.equal((await claim('2026-11-02','2026-11-01')).streak,1);
 const rows=await rewardHistory(database,initial.userId);
 assert.equal(rows.length,7);assert.equal(new Set(rows.map(row=>row.id)).size,7);
 assert.equal(rows.filter(row=>row.dateOnly).length,1);
 assert.equal(rows.filter(row=>!row.dateOnly).length,6);
 assert.equal((await state()).coins,4000);
 assert.deepEqual(await rewardHistory(database,'another-user'),[]);
 assert.deepEqual(await runMigrations(database),[]);
 // Restore the synthetic database into a new local DB, including the trigger.
 const archive=join(dir,'synthetic.backup');
 run('pg_dump',['-h','127.0.0.1','-p',String(port),'-U','archive_test','-d','postgres','-Fc','-f',archive]);
 await database.query('CREATE DATABASE archive_restore',[]);
 run('pg_restore',['-h','127.0.0.1','-p',String(port),'-U','archive_test','-d','archive_restore','--no-owner','--no-acl','--single-transaction','--exit-on-error',archive]);
 const restored=new pg.Pool({...connection,database:'archive_restore',max:1});
 try {
  assert.equal((await restored.query('SELECT count(*)::int AS n FROM mtx_daily_reward_history')).rows[0].n,7);
  await restored.query("INSERT INTO mtx_daily_claims VALUES('restore-fixture','2026-11-03',1)");
  assert.equal((await restored.query("SELECT reward FROM mtx_daily_reward_history WHERE user_id='restore-fixture'")).rows[0].reward,100);
 } finally {await restored.end();}
} catch(error) {failure=error;} finally {
 try {if(pool)await pool.end();} catch(error) {failure=failure?new AggregateError([failure,error]):error;}
 try {
  if(started){
   const status=spawnSync(join(bin,'pg_ctl'+(process.platform==='win32'?'.exe':'')),['-D',data,'status'],{env,stdio:'ignore',timeout:10000,windowsHide:true});
   if(status.status===0)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
   if(status.status!==0&&status.status!==3)failure=new Error('Local cluster cleanup requires inspection: '+dir);
   else console.log('MTX_DAILY_ARCHIVE_CLUSTER_STOPPED');
  }
 } catch(error) {failure=failure?new AggregateError([failure,error]):error;}
 console.log('Synthetic artifacts retained at '+dir);
}
if(failure)throw failure;
console.log('MTX_DAILY_ARCHIVE_PASS backfill, atomic credit, duplicate, concurrency, rollback, cap, gap, isolation, migration replay, synthetic restore');
