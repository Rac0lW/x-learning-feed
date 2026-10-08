import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
const dom = new JSDOM('<main data-testid="primaryColumn"></main>',{url:'https://x.com/home'});
globalThis.window = dom.window; globalThis.document = dom.window.document;
const { Timeline } = await import('../.test-dist/timeline.js');
const { clean, render } = await import('../.test-dist/render.js');
const { readNotes, saveNotes } = await import('../.test-dist/db.js');
const {replaceSource,pending,savePending,acknowledge}=await import('../.test-dist/db.js');
const note = id => ({id:id.repeat(64),title:`笔记 ${id}`,html:'<p>正文</p>'});
function cell(id) {
  const el = document.createElement('div'); el.dataset.testid = 'cellInnerDiv';
  el.innerHTML = `<article data-testid="tweet"><a href="/user/status/${id}"><time>今天</time></a></article>`;
  return el;
}

test('每 10 条插入、重复扫描幂等、重绘恢复、节点复用和关闭清理',() => {
  const main = document.querySelector('main'); main.replaceChildren(...Array.from({length:30},(_,i) => cell(i+1)));
  const timeline = new Timeline(document);
  timeline.update({notes:[note('a'),note('b'),note('c')],settings:{every:10,enabled:true}});
  timeline.reconcile();
  const anchors = () => [...document.querySelectorAll('x-learning-card')].map(n => n.dataset.anchor);
  assert.deepEqual(anchors(),['10','20','30']);
  for (let i=0;i<100;i++) timeline.reconcile();
  assert.deepEqual(anchors(),['10','20','30']); assert.equal(timeline.seen.size,30);
  main.replaceChildren(...Array.from({length:30},(_,i) => cell(i+1)));
  timeline.reconcile(); assert.deepEqual(anchors(),['10','20','30']);
  const recycled = document.querySelector('x-learning-card').parentElement;
  recycled.querySelector('a').setAttribute('href','/user/status/99');
  timeline.reconcile(); assert.deepEqual(anchors(),['20','30']);
  main.append(...Array.from({length:20},(_,i) => cell(i+100)));
  timeline.reconcile(); assert.equal(anchors().length,2); // 本轮已用尽，不循环相同笔记。
  timeline.update({notes:[note('a')],settings:{every:10,enabled:false}});
  timeline.reconcile(); assert.equal(anchors().length,0);
});

test('离开首页清理；频率可设为 2',() => {
  const main = document.querySelector('main'); main.replaceChildren(...[1,2,3,4].map(cell));
  const timeline = new Timeline(document);
  timeline.update({notes:[note('a'),note('b')],settings:{every:2,enabled:true}});
  timeline.reconcile(); assert.equal(document.querySelectorAll('x-learning-card').length,2);
  dom.reconfigure({url:'https://x.com/user'}); timeline.reconcile();
  assert.equal(document.querySelectorAll('x-learning-card').length,0);
  dom.reconfigure({url:'https://x.com/home'});
});

test('浏览器清理与 Markdown 排版',() => {
  const html = clean('<script>bad()</script><p onclick="bad()" style="color:red">正文</p><img src="https://evil/track"><a href="javascript:bad()">链接</a><iframe srcdoc="bad"></iframe><svg onload="bad()"></svg>');
  assert.doesNotMatch(html,/script|onclick|style=|https:\/\/evil|javascript:|iframe|<svg/);
  assert.match(render('# 标题\n\n**加粗**\n\n```ts\nlet a = 1\n```',true),/<strong>加粗<\/strong>/);
});

test('漫游随机选文、不重复，切换模式和首次同步无需刷新页面',()=>{
  const main=document.querySelector('main');main.replaceChildren(...[1,2,3,4].map(cell));
  const timeline=new Timeline(document);const random=Math.random;
  try{
    Math.random=()=>0.99;
    timeline.update({notes:[],settings:{every:1,enabled:true,roam:true}});timeline.reconcile();
    timeline.update({notes:[note('a'),note('b'),note('c')],settings:{every:1,enabled:true,roam:true}});timeline.reconcile();
    assert.deepEqual([...timeline.assignments.values()],[note('c').id,note('b').id,note('a').id]);
    timeline.reconcile();assert.equal(document.querySelectorAll('x-learning-card').length,3);
    timeline.update({notes:[note('a')],settings:{every:1,enabled:true,roam:false}});timeline.reconcile();
    assert.deepEqual([...timeline.assignments.values()],[note('a').id]);
    assert.equal(document.querySelectorAll('x-learning-card').length,1);
  }finally{Math.random=random;}
});

test('IndexedDB 持久保存与重复 ID 覆盖',async () => {
  await saveNotes([note('a'),note('a'),note('b')]);
  assert.equal((await readNotes()).length,2);
  await saveNotes([{...note('a'),title:'更新'}]);
  assert.equal((await readNotes()).find(n => n.id === note('a').id).title,'更新');
});

test('来源快照更新与移除，待同步操作按添加顺序持久化和确认',async()=>{
  const source='d'.repeat(64);const remote={...note('e'),source};
  await replaceSource(source,[remote]);assert.ok((await readNotes()).some(n=>n.id===remote.id));
  await replaceSource(source,[{...remote,html:'<p>更新正文</p>'}]);assert.equal((await readNotes()).find(n=>n.id===remote.id).html,'<p>更新正文</p>');
  await replaceSource(source,[]);assert.ok(!(await readNotes()).some(n=>n.id===remote.id));
  assert.ok((await readNotes()).some(n=>n.id===note('a').id));
  const first={id:'z',noteId:remote.id,source,type:'review',reviewedAt:new Date().toISOString(),status:'pending'};
  const second={...first,id:'a'};
  await savePending(first);await savePending(second);
  assert.deepEqual((await pending()).map(op=>op.id),['z','a']);
  await acknowledge('z',remote);assert.deepEqual((await pending()).map(op=>op.id),['a']);
  await acknowledge('a');assert.equal((await pending()).length,0);
});
