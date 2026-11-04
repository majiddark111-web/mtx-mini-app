import assert from 'node:assert/strict';
import { it } from 'node:test';
import { TapRetryWindow } from './tapRetryWindow.ts';

it('honors the deadline after reload, only for the limited account', () => {
  let now=1000;
  const values=new Map<string,string>();
  const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const create=()=>new TapRetryWindow(()=>storage,()=>now);
  create().defer('a','4');
  now=2000; create().defer('a','1');
  assert.equal(create().remaining('b'),0);
  now=4999; assert.equal(create().remaining('a'),1);
  now=5000; assert.equal(create().remaining('a'),0);
  assert.equal(values.size,0);
});

it('backs off even without a readable header or writable session storage',()=>{
  const gate=new TapRetryWindow(()=>{throw Error('storage unavailable');},()=>0);
  for (const value of [undefined,'invalid','-3','0','Infinity']) {
    gate.defer('a',value);
    assert.equal(gate.remaining('a'),2000);
  }
});
