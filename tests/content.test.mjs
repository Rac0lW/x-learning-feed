import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

test('构建后的 Content Script：无限滚动、事件操作、重绘、关闭与无观察器循环',async t => {
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError',e => errors.push(e)); console.on('error',e => errors.push(e));
  const dom = new JSDOM('<main data-testid="primaryColumn"></main>', {url:'https://x.com/home',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console});
  t.after(() => dom.window.close());
  const w = dom.window; let refresh;
  w.setInterval = callback => { refresh = callback; return 1; };
  w.clearInterval = () => {};
  let feed = {notes:Array.from({length:3},(_,i) => ({id:String(i).repeat(64),title:`笔记 ${i}`,html:'<p>正文</p><script>window.attacked=true</script><img src="https://evil/track">'})),settings:{every:10,enabled:true}};
  w.chrome = {runtime:{id:'test-extension',onMessage:{addListener:()=>{},removeListener:()=>{}},getURL:path=>`chrome-extension://test-extension${path}`,sendMessage:async () => feed}};
  let callbacks = 0;
  const Observer = w.MutationObserver;
  w.MutationObserver = class extends Observer { constructor(fn) { super((...args) => {callbacks++;fn(...args);}); } };
  const roots = new WeakMap(); const attach = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function(options) {const root = attach.call(this,options);roots.set(this,root);return root;};
  const main = w.document.querySelector('main');
  function cell(id) { const el = w.document.createElement('div');el.dataset.testid = 'cellInnerDiv';el.innerHTML = `<article data-testid="tweet"><a href="/u/status/${id}"><time>今天</time></a></article>`;return el; }
  main.append(...Array.from({length:20},(_,i) => cell(i+1)));
  w.eval(await readFile('.output/chrome-mv3/content-scripts/feed.js','utf8'));
  const frame = () => new Promise(resolve => setTimeout(resolve,50)); await frame();
  const cards = () => [...w.document.querySelectorAll('x-learning-card')];
  assert.deepEqual(cards().map(c => c.dataset.anchor),['10','20']);
  const root = roots.get(cards()[0]); const [toggle,skip] = root.querySelectorAll('button');
  toggle.click(); assert.equal(toggle.getAttribute('aria-expanded'),'true');
  toggle.click(); assert.equal(toggle.getAttribute('aria-expanded'),'false');
  skip.click(); await frame(); assert.deepEqual(cards().map(c => c.dataset.anchor),['20']);
  assert.equal(w.attacked,undefined); assert.equal(root.querySelectorAll('script,img').length,0);
  main.append(...Array.from({length:30},(_,i) => cell(i+21))); await frame();
  assert.deepEqual(cards().map(c => c.dataset.anchor),['20','30']);
  main.replaceChildren(...Array.from({length:50},(_,i) => cell(i+1))); await frame();
  assert.deepEqual(cards().map(c => c.dataset.anchor),['20','30']);
  const before = callbacks; await frame(); assert.equal(callbacks,before);
  assert.ok(callbacks < 10,`observer callbacks: ${callbacks}`);
  feed = {...feed,settings:{every:10,enabled:false}}; refresh(); await frame(); assert.equal(cards().length,0);
  feed = {...feed,settings:{every:10,enabled:true}}; refresh(); await frame(); assert.equal(cards().length,2);
  delete w.chrome.runtime.id; refresh(); await frame(); assert.equal(cards().length,0);
  assert.deepEqual(errors,[]);
});

test('构建后的卡片：只发送复习元数据、保留时间精度与重绘中的草稿',async t=>{
  const dom=new JSDOM('<main data-testid="primaryColumn"><div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/u/status/1"><time>今天</time></a></article></div></main>',{url:'https://x.com/home',runScripts:'dangerously',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window;let refresh;const sent=[];
  w.setInterval=callback=>{refresh=callback;return 1;};w.clearInterval=()=>{};
  let feed={notes:[{id:'a'.repeat(64),source:'b'.repeat(64),title:'Obsidian 文章',html:'<p>正文</p>',metadata:{reviewCount:2,lastReviewed:'2026-10-07T09:20:33.123Z',remarks:'原备注',version:'c'.repeat(64)}}],settings:{every:1,enabled:true},version:'one'};
  w.chrome={runtime:{id:'test',onMessage:{addListener:()=>{},removeListener:()=>{}},getURL:path=>`chrome-extension://test${path}`,sendMessage:async message=>{if(message.type==='feed')return feed;sent.push(message);return{ok:true,pending:true};}}};
  const roots=new WeakMap();const attach=w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.set(this,root);return root;};
  w.eval(await readFile('.output/chrome-mv3/content-scripts/feed.js','utf8'));
  const frame=()=>new Promise(resolve=>setTimeout(resolve,50));await frame();
  const root=()=>roots.get(w.document.querySelector('x-learning-card'));
  [...root().querySelectorAll('button')].find(b=>b.textContent==='已复习 +1').click();await frame();
  assert.equal(sent[0].type,'review');assert.equal(sent[0].noteId,'a'.repeat(64));assert.equal(sent[0].metadata,undefined);
  [...root().querySelectorAll('button')].find(b=>b.textContent==='修改复习信息').click();
  const textarea=root().querySelector('textarea');textarea.value='正在编辑的草稿';textarea.dispatchEvent(new w.Event('input',{bubbles:true}));
  feed={...feed,notes:[{...feed.notes[0],metadata:{...feed.notes[0].metadata,reviewCount:3,version:'d'.repeat(64)}}],version:'two'};
  refresh();await frame();assert.equal(root().querySelector('textarea').value,'正在编辑的草稿');
  root().querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await frame();
  assert.equal(sent[1].type,'metadata');assert.equal(sent[1].metadata.remarks,'正在编辑的草稿');
  assert.equal(sent[1].metadata.version,'c'.repeat(64)); // Retain the editing base so the plugin can report a conflict.
  assert.equal(sent[1].metadata.lastReviewed,'2026-10-07T09:20:33.123Z');
  assert.ok(!('html' in sent[1]) && !('body' in sent[1]));
});
