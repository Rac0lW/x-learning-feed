import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { t, detectLocale, resolveLocale, setLocale } from '../.test-dist/i18n.js';
import { ratings } from '../.test-dist/review.js';

test('语言：自动识别、手动选择、参数与英文单复数',()=>{
  assert.equal(detectLocale('zh-TW'),'zh');assert.equal(detectLocale('en-GB'),'en');assert.equal(detectLocale('ja'),'en');assert.equal(detectLocale(undefined),'zh');
  assert.equal(resolveLocale('auto','fr'),'en');assert.equal(resolveLocale('zh','en-US'),'zh');assert.equal(resolveLocale('bogus','zh-CN'),'zh');
  assert.equal(t('card.reviewed',{count:1},'en'),'Reviewed 1 time');assert.equal(t('card.reviewed',{count:3},'en'),'Reviewed 3 times');
  assert.equal(t('card.reviewed',{count:3},'zh'),'已复习 3 次');
  setLocale('en');assert.deepEqual(ratings.map(r=>r.label),['Again','Hard','Good','Easy']);
  setLocale('zh');assert.deepEqual(ratings.map(r=>r.label),['重来','困难','良好','简单']);
});

test('构建后的卡片：按扩展语言显示英文，切换语言后重绘',async t=>{
  const dom=new JSDOM('<main data-testid="primaryColumn"><div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/u/status/1"><time>now</time></a></article></div></main>',{url:'https://x.com/home',runScripts:'dangerously',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window;let refresh;
  w.setInterval=callback=>{refresh=callback;return 1;};w.clearInterval=()=>{};
  let feed={notes:[{id:'a'.repeat(64),source:'b'.repeat(64),path:'notes/a.md',title:'A',html:'<p>Body</p>',metadata:{reviewCount:1,lastReviewed:null,remarks:'',version:'c'.repeat(64)}}],settings:{every:1,enabled:true},version:'one',locale:'en'};
  w.chrome={runtime:{id:'test',onMessage:{addListener:()=>{},removeListener:()=>{}},getURL:path=>`chrome-extension://test${path}`,sendMessage:async message=>message.type==='feed'?feed:{ok:true}}};
  const roots=new WeakMap();const attach=w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.set(this,root);return root;};
  w.eval(await readFile('.output/chrome-mv3/content-scripts/feed.js','utf8'));
  const frame=()=>new Promise(resolve=>setTimeout(resolve,50));await frame();
  const root=()=>roots.get(w.document.querySelector('x-learning-card'));
  const buttons=()=>[...root().querySelectorAll('footer button')].map(b=>b.textContent);
  assert.deepEqual(buttons(),['Expand','Open in Obsidian','Edit here','Like','Dislike','Archive','Again','Hard','Good','Easy']);
  assert.equal(root().querySelector('.summary').textContent,'Reviewed 1 time');
  feed={...feed,version:'two',locale:'zh'};refresh();await frame();
  assert.deepEqual(buttons(),['展开','在 Obsidian 中打开','现场编辑','点赞','点踩','归档','重来','困难','良好','简单']);
});

test('网页内面板：英文界面与语言切换',async t=>{
  const html=await readFile('.output/chrome-mv3/panel.html','utf8');
  const dom=new JSDOM(html,{url:'https://extension.invalid/panel.html',runScripts:'dangerously'});
  t.after(()=>dom.window.close());const w=dom.window;
  const storage={locale:'en'};const sent=[];let locale='en';
  w.browser={runtime:{id:'test',sendMessage:async message=>{
    if(message.type==='shown')return{ok:true};sent.push(message);
    if(message.type==='feed')return{notes:[],settings:{every:10,enabled:true},pending:[],locale};
    if(message.type==='locale'){storage.locale=message.locale;locale=message.locale==='auto'?'en':message.locale;}
    return{ok:true};
  }},storage:{local:{get:async keys=>Object.fromEntries([keys].flat().map(key=>[key,storage[key]]))},onChanged:{addListener:()=>{}}}};
  const script=html.match(/src="([^"]+\.js)"/)[1];
  w.eval(await readFile(`.output/chrome-mv3${script}`,'utf8'));
  const flush=()=>new Promise(resolve=>setTimeout(resolve,10));await flush();
  const $=id=>w.document.getElementById(id);
  assert.equal(w.document.documentElement.lang,'en');
  assert.equal($('language').value,'en');
  assert.ok(w.document.body.textContent.includes('Show notes on X Home'));
  assert.equal($('sync-info').textContent,'Not connected to Obsidian');
  assert.equal($('every').getAttribute('aria-label'),'Insert a note after this many posts');
  assert.equal($('note-count').textContent,'0 notes');
  $('language').value='zh';$('language').dispatchEvent(new w.Event('change',{bubbles:true}));await flush();
  assert.ok(sent.some(message=>message.type==='locale' && message.locale==='zh'));
  assert.ok(!sent.some(message=>message.type==='settings'),'Changing language must not resave feed settings');
  assert.equal(w.document.documentElement.lang,'zh-CN');
  assert.ok(w.document.body.textContent.includes('在 X 首页显示笔记'));
  assert.equal($('sync-info').textContent,'尚未连接 Obsidian');
});
