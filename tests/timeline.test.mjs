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
const {readFeedback,saveFeedback}=await import('../.test-dist/db.js');
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

test('卡片顶部显示来源文件树，支持根目录、未知路径和路径更新，文件名作为纯文本',()=>{
  const main=document.querySelector('main');main.replaceChildren(cell(1));
  const attach=dom.window.Element.prototype.attachShadow;let root;
  dom.window.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
  const timeline=new Timeline(document);
  const show=path=>{timeline.update({notes:[{...note('a'),path}],settings:{every:1,enabled:true}});timeline.reconcile();return root.querySelector('.source');};
  try{
    let source=show('学习/推荐系统/文章.md');
    assert.equal(source.title,'学习/推荐系统/文章.md');
    assert.deepEqual([...source.querySelectorAll('li>span:last-of-type')].map(n=>n.textContent),['学习','推荐系统','文章.md']);
    assert.equal(source.querySelectorAll('ul>li>ul>li>ul>li').length,1);
    assert.equal(source.nextElementSibling.tagName,'H2');assert.equal(source.getAttribute('aria-label'),'文章来源');
    source=show('根目录文章.md');assert.equal(source.querySelectorAll('li').length,1);
    source=show('资料/<img src=x onerror=bad()>.md');assert.equal(source.querySelector('img'),null);assert.ok(source.textContent.includes('<img src=x onerror=bad()>.md'));
    source=show(undefined);assert.equal(source.textContent,'导入副本 · 未提供原始路径');assert.equal(source.querySelector('ul'),null);
  }finally{dom.window.Element.prototype.attachShadow=attach;timeline.clear();}
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

test('切换自选标签重新分配文章，同一篇仍可进入新标签列表',()=>{
  const main=document.querySelector('main');main.replaceChildren(cell(1));
  const timeline=new Timeline(document);
  timeline.update({notes:[note('a')],settings:{every:1,enabled:true,tags:['学习']}});timeline.reconcile();
  assert.equal(timeline.assignments.get('1'),note('a').id);
  timeline.update({notes:[note('a')],settings:{every:1,enabled:true,tags:['编程']}});timeline.reconcile();
  assert.equal(timeline.assignments.get('1'),note('a').id);assert.equal(document.querySelectorAll('x-learning-card').length,1);timeline.clear();
});

test('今天已推送的文章刷新后不再推送，并通知记录新推送的文章',()=>{
  const main=document.querySelector('main');main.replaceChildren(cell(1),cell(2),cell(3));
  const recorded=[];const timeline=new Timeline(document,undefined,id=>recorded.push(id));
  timeline.update({notes:[note('a'),note('b')],settings:{every:1,enabled:true,roam:true},shown:[note('a').id]});timeline.reconcile();
  assert.equal(timeline.assignments.get('1'),note('b').id);assert.equal(timeline.assignments.size,1,'A note shown earlier today stays hidden even after the round is used up');
  assert.deepEqual(recorded,[note('b').id]);
  timeline.update({notes:[note('a'),note('b')],settings:{every:1,enabled:true,tags:['学习']},shown:[note('a').id,note('b').id]});timeline.reconcile();
  assert.equal(timeline.assignments.size,0,'Switching modes keeps today’s record');timeline.clear();
});

test('推送跳过未到期文章，到期后可以在后续推文中出现',()=>{
  const main=document.querySelector('main');main.replaceChildren(cell(1));
  const now=Date.now;const start=now();Date.now=()=>start;
  const timeline=new Timeline(document);
  try{
    timeline.update({notes:[{...note('a'),metadata:{reviewCount:1,lastReviewed:new Date(start).toISOString(),remarks:'',version:'a'.repeat(64),rating:1,nextReview:new Date(start+600000).toISOString()}},note('b')],settings:{every:1,enabled:true}});timeline.reconcile();
    assert.equal(timeline.assignments.get('1'),note('b').id);
    main.append(cell(2));timeline.reconcile();assert.equal(timeline.assignments.has('2'),false);
    Date.now=()=>start+600000;main.append(cell(3));timeline.reconcile();assert.equal(timeline.assignments.get('3'),note('a').id);
  }finally{Date.now=now;timeline.clear();}
});

test('Obsidian 更新熟悉度后，当前卡片移除，到期可重新推送',()=>{
  const main=document.querySelector('main');main.replaceChildren(cell(1));
  const now=Date.now;const start=now();Date.now=()=>start;
  const timeline=new Timeline(document);
  try{
    timeline.update({notes:[note('a')],settings:{every:1,enabled:true}});timeline.reconcile();assert.equal(document.querySelectorAll('x-learning-card').length,1);
    timeline.update({notes:[{...note('a'),metadata:{reviewCount:1,lastReviewed:new Date(start).toISOString(),remarks:'',version:'a'.repeat(64),rating:1,nextReview:new Date(start+600000).toISOString()}}],settings:{every:1,enabled:true}});timeline.reconcile();
    assert.equal(document.querySelectorAll('x-learning-card').length,0);assert.equal(timeline.used.has(note('a').id),false);
    Date.now=()=>start+600000;main.append(cell(2));timeline.reconcile();assert.equal(timeline.assignments.get('2'),note('a').id);
  }finally{Date.now=now;timeline.clear();}
});

test('默认时间权重影响标签顺序和漫游概率，关闭后去除时间加权',()=>{
  const main=document.querySelector('main');const now=Date.now;const random=Math.random;const start=now();Date.now=()=>start;
  const base={reviewCount:1,remarks:'',version:'a'.repeat(64)};
  const notes=[{...note('a'),metadata:{...base,lastReviewed:new Date(start).toISOString()}},{...note('b'),metadata:{...base,lastReviewed:new Date(start-28*86400000).toISOString()}}];
  const select=settings=>{main.replaceChildren(cell(1));const timeline=new Timeline(document);timeline.update({notes,settings:{every:1,enabled:true,...settings}});timeline.reconcile();const id=timeline.assignments.get('1');timeline.clear();return id;};
  try{
    assert.equal(select({}),note('b').id);assert.equal(select({timeWeight:false}),note('a').id);
    Math.random=()=>0.4;assert.equal(select({roam:true}),note('b').id);assert.equal(select({roam:true,timeWeight:false}),note('a').id);
  }finally{Date.now=now;Math.random=random;}
});

test('IndexedDB 持久保存与重复 ID 覆盖',async () => {
  await saveNotes([note('a'),note('a'),note('b')]);
  assert.equal((await readNotes()).length,2);
  await saveNotes([{...note('a'),title:'更新'}]);
  assert.equal((await readNotes()).find(n => n.id === note('a').id).title,'更新');
});

test('反馈调整标签优先级和漫游概率，每轮仍不重复',()=>{
  const main=document.querySelector('main');
  const notes=[{...note('a'),feedback:-1},note('b'),{...note('c'),feedback:1}];
  main.replaceChildren(...[1,2,3,4].map(cell));
  const ordered=new Timeline(document);ordered.update({notes,settings:{every:1,enabled:true}});ordered.reconcile();
  assert.deepEqual([...ordered.assignments.values()],[note('c').id,note('b').id,note('a').id]);ordered.clear();
  const random=Math.random;
  try{
    // Weight 0.5 : 1 : 2; this draw selects the liked note, unlike uniform sampling.
    Math.random=()=>0.5;
    const roaming=new Timeline(document);roaming.update({notes,settings:{every:1,enabled:true,roam:true}});roaming.reconcile();
    assert.deepEqual([...roaming.assignments.values()],[note('c').id,note('b').id,note('a').id]);roaming.clear();
    Math.random=()=>0;
    const low=new Timeline(document);low.update({notes,settings:{every:1,enabled:true,roam:true}});low.reconcile();
    assert.equal([...low.assignments.values()][0],note('a').id,'Disliked notes remain eligible');low.clear();
  }finally{Math.random=random;}
});

test('反馈独立持久保存，不被来源同步和写回覆盖，取消后恢复默认',async()=>{
  const remote={...note('f'),source:'d'.repeat(64)};
  await replaceSource(remote.source,[remote]);await saveFeedback(remote.id,1);
  await replaceSource(remote.source,[{...remote,title:'同步更新'}]);await acknowledge('missing',remote);
  assert.equal((await readFeedback()).find(item=>item.noteId===remote.id).value,1);
  await saveFeedback(remote.id,-1);assert.equal((await readFeedback()).find(item=>item.noteId===remote.id).value,-1);
  await saveFeedback(remote.id,0);assert.equal((await readFeedback()).find(item=>item.noteId===remote.id),undefined);
});

test('卡片反馈可点赞、切换、取消，失败保留选择并可重试',async()=>{
  const main=document.querySelector('main');main.replaceChildren(cell(1));
  const attach=dom.window.Element.prototype.attachShadow;let root;
  dom.window.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
  const sent=[];let fail=false;
  const timeline=new Timeline(document,async(type,noteId)=>{sent.push({type,noteId});return fail?{error:'保存失败'}:{};});
  try{
    timeline.update({notes:[note('a')],settings:{every:1,enabled:true}});timeline.reconcile();
    const like=[...root.querySelectorAll('button')].find(b=>b.textContent==='点赞');
    const dislike=[...root.querySelectorAll('button')].find(b=>b.textContent==='点踩');
    like.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(like.getAttribute('aria-pressed'),'true');
    dislike.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(like.getAttribute('aria-pressed'),'false');assert.equal(dislike.getAttribute('aria-pressed'),'true');
    fail=true;like.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(dislike.getAttribute('aria-pressed'),'true');assert.equal(like.disabled,false);assert.equal(root.querySelector('[role=status]').textContent,'保存失败');
    fail=false;dislike.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(dislike.getAttribute('aria-pressed'),'false');
    assert.deepEqual(sent.map(item=>item.type),['like','dislike','like','dislike']);assert.ok(sent.every(item=>item.noteId===note('a').id));
  }finally{dom.window.Element.prototype.attachShadow=attach;timeline.clear();}
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


test('现场编辑保留原始 Markdown、刷新不丢草稿，失败可重试，取消不写回',async()=>{
  document.querySelector('main').replaceChildren(cell(1));
  const attach=dom.window.Element.prototype.attachShadow;let root;
  dom.window.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
  const calls=[];let fail=true;
  const source={...note('a'),source:'b'.repeat(64)};
  const timeline=new Timeline(document,async(type,id,rating,edit)=>{calls.push({type,id,edit});return type==='document'?{markdown:'# 原文\n**格式**',version:'c'.repeat(64)}:fail?{error:'模拟保存失败'}:{ok:true};});
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
  try{
    timeline.update({notes:[source],settings:{every:1,enabled:true}});timeline.reconcile();
    button('现场编辑').click();await tick();
    const input=root.querySelector('textarea');assert.equal(input.value,'# 原文\n**格式**');
    input.value='# 修改\n**加粗**';input.dispatchEvent(new dom.window.Event('input'));
    const host=document.querySelector('x-learning-card');
    timeline.update({notes:[{...source,html:'<p>另一端已修改</p>'}],settings:{every:1,enabled:true}});timeline.reconcile();
    assert.equal(document.querySelector('x-learning-card'),host);assert.equal(input.value,'# 修改\n**加粗**');
    button('保存并同步').click();await tick();assert.equal(input.value,'# 修改\n**加粗**');assert.equal(input.parentElement.hidden,false);
    fail=false;button('保存并同步').click();await tick();
    assert.deepEqual(calls.find(c=>c.type==='edit').edit,{markdown:'# 修改\n**加粗**',expectedVersion:'c'.repeat(64)});
    button('现场编辑').click();await tick();button('取消').click();await tick();assert.equal(calls.filter(c=>c.type==='edit').length,2);
  }finally{dom.window.Element.prototype.attachShadow=attach;timeline.clear();}
});


test('字数降权适用于标签推送和漫游，忽略空白、标记和图片，按正文更新重新计算',()=>{
  const main=document.querySelector('main');const random=Math.random;
  const long={...note('a'),html:`<p>${'长'.repeat(3000)}</p>`};
  const short={...note('b'),html:`<p>${'短'.repeat(1000)}</p>`};
  const select=(notes,roam=false)=>{
    main.replaceChildren(cell(1));const timeline=new Timeline(document);
    timeline.update({notes,settings:{every:1,enabled:true,roam,timeWeight:false}});timeline.reconcile();
    const id=timeline.assignments.get('1');timeline.clear();return id;
  };
  try{
    assert.equal(select([long,short]),short.id);
    Math.random=()=>0.4;assert.equal(select([long,short],true),short.id,'Length must also affect roaming probability');
    Math.random=()=>0;assert.equal(select([long,short],true),long.id,'Long articles remain eligible');
    const decorated={...note('a'),html:`<p><strong>中&amp;文&#x1F600;</strong>${' \n&nbsp;'.repeat(1000)}<img src="data:image/png;base64,${'a'.repeat(9000)}"></p>`};
    const plain={...note('b'),html:'<p>中文ABCDE</p>'};
    assert.equal(select([plain,decorated]),decorated.id,'Count decoded non-whitespace text, excluding markup and image data');
    main.replaceChildren(cell(1));const timeline=new Timeline(document);
    timeline.update({notes:[long,short],settings:{every:1,enabled:true,timeWeight:false}});timeline.reconcile();
    assert.equal(timeline.assignments.get('1'),short.id);
    const changed={...long,html:'<p>缩短</p>'};
    timeline.update({notes:[changed,short],settings:{every:1,enabled:true,timeWeight:false}});main.append(cell(2));timeline.used.clear();timeline.reconcile();
    assert.equal(timeline.assignments.get('2'),long.id);timeline.clear();
  }finally{Math.random=random;}
});
