import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { indexedDB } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';

test('原页面面板：图标只向当前标签发消息，不打开扩展页面',async()=>{
  let click;const sent=[];
  const chrome={runtime:{id:'test',getURL:path=>`chrome-extension://test${path}`,onMessage:{addListener:()=>{}}},
    action:{onClicked:{addListener:fn=>{click=fn;}},setTitle:async()=>{}},
    tabs:{sendMessage:async(id,message)=>sent.push({id,message}),create:()=>assert.fail('Must not open a tab')},
    alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},storage:{local:{get:async()=>({})}}};
  runInNewContext(await readFile('.output/chrome-mv3/background.js','utf8'),{chrome,indexedDB,crypto:webcrypto,console});
  assert.equal(typeof click,'function');await click({id:7});
  assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{id:7,message:{type:'toggle-panel'}}]);
});

test('原页面面板：原位展开、切换、点外部与 Esc 收起，保持页面地址',async t=>{
  const dom=new JSDOM('<main data-testid="primaryColumn"></main>',{url:'https://x.com/home',runScripts:'dangerously',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window;let message;
  w.setInterval=()=>1;w.clearInterval=()=>{};w.open=()=>assert.fail('Must not open a window');
  w.chrome={runtime:{id:'test',getURL:path=>`chrome-extension://test${path}`,
    onMessage:{addListener:fn=>{message=fn;},removeListener:()=>{}},sendMessage:async()=>({notes:[],settings:{every:10,enabled:false}})}};
  const roots=new WeakMap();const attach=w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.set(this,root);return root;};
  w.eval(await readFile('.output/chrome-mv3/content-scripts/feed.js','utf8'));
  assert.equal(typeof message,'function','The content script must receive toolbar clicks');
  const toggle=()=>message({type:'toggle-panel'},{id:'test'});
  const panel=()=>w.document.querySelector('x-learning-panel');
  message({type:'toggle-panel'},{id:'other-extension'});assert.equal(panel(),null);
  toggle();assert.ok(panel());assert.equal(roots.get(panel()).querySelector('iframe').src,'chrome-extension://test/panel.html');
  assert.equal(w.document.querySelectorAll('x-learning-panel').length,1);
  toggle();assert.equal(panel(),null);toggle();
  roots.get(panel()).querySelector('button').click();assert.equal(panel(),null);
  toggle();panel().dispatchEvent(new w.Event('pointerdown',{bubbles:true,composed:true}));assert.ok(panel());
  w.document.querySelector('main').dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal(panel(),null);
  toggle();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(panel(),null);
  toggle();const frame=roots.get(panel()).querySelector('iframe');
  w.dispatchEvent(new w.MessageEvent('message',{data:'x-learning-feed:close',source:w}));assert.ok(panel());
  w.dispatchEvent(new w.MessageEvent('message',{data:'x-learning-feed:close',source:frame.contentWindow}));assert.equal(panel(),null);
  assert.equal(w.location.href,'https://x.com/home');
});
