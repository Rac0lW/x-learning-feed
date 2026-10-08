import { browser } from 'wxt/browser';
import type { Feed } from '../../lib/types';
import panel from './panel.html?raw';
import './style.css';

document.querySelector('main')!.innerHTML = panel;
if(window.parent!==window)document.addEventListener('keydown',event=>{
  if(event.key==='Escape')window.parent.postMessage('x-learning-feed:close','https://x.com');
});
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const enabled = element<HTMLInputElement>('enabled');
const every = element<HTMLInputElement>('every');
const roam = element<HTMLInputElement>('roam');
const token = element<HTMLInputElement>('token');
const port = element<HTMLInputElement>('port');
function status(text: string) { element('status').textContent = text; }
async function send(message: unknown) {
  const response = await browser.runtime.sendMessage(message);
  if (response?.error) throw new Error(response.error);
  return response;
}
async function refresh() {
  const feed: Feed = await send({type:'feed'});
  if(document.activeElement!==enabled)enabled.checked = feed.settings.enabled;
  if(document.activeElement!==every)every.value = String(feed.settings.every);
  if(document.activeElement!==roam)roam.checked=feed.settings.roam===true;
  element('note-count').textContent = `${feed.notes.length} 篇`;
  element('notes').replaceChildren(...feed.notes.map(note => {
    const li = document.createElement('li');
    const title = document.createElement('span'); title.textContent = note.title;
    const count = document.createElement('small'); count.textContent = `复习 ${note.metadata?.reviewCount??0} 次`;
    li.append(title,count); return li;
  }));
  if(!feed.notes.length)element('notes').textContent=feed.settings.roam?'正在读取笔记库，暂时没有可漫游的文章。':'还没有文章。连接 Obsidian 后，给一篇笔记加上标签试试。';
  const issues=(feed.pending??[]).filter(item=>item.status!=='pending');
  element('issues').hidden=!issues.length;
  element('pending').replaceChildren(...issues.map(item=>{
    const li=document.createElement('li');
    const title=document.createElement('span');title.textContent=feed.notes.find(n=>n.id===item.noteId)?.title??'已移除的文章';
    const reason=document.createElement('p');reason.textContent=item.error??'这次修改无法写回';
    li.append(title,reason);
    if(item.metadata){const draft=document.createElement('p');draft.textContent=`你的修改：${item.metadata.reviewCount} 次；时间 ${item.metadata.lastReviewed?new Date(item.metadata.lastReviewed).toLocaleString():'无'}；备注 ${item.metadata.remarks||'无'}`;li.append(draft);}
    const discard=document.createElement('button');discard.type='button';discard.className='secondary';discard.textContent='保留 Obsidian 当前数据';
    discard.addEventListener('click',async()=>{try{await send({type:'discard',id:item.id});await refresh();status('已保留 Obsidian 中的数据。需要调整时，请在 Obsidian 中修改属性。');}catch(error){status((error as Error).message);}});
    li.append(discard);return li;
  }));
  const state=await browser.storage.local.get(['token','syncStatus','lastSync']);
  const waiting=(feed.pending??[]).filter(item=>item.status==='pending').length;
  const offline=String(state.syncStatus??'').startsWith('待同步');
  element('sync-info').textContent=!state.token?'尚未连接 Obsidian':offline?`Obsidian 暂未连接${waiting?` · ${waiting} 条记录已存本地`: ' · 使用本地笔记'}`:waiting?'正在自动保存…':state.lastSync?'已连接 · 修改自动保存':'正在连接 Obsidian…';
  element('sync-info').dataset.state=state.token && !offline ? 'connected' : 'offline';
}
const settings=element<HTMLFormElement>('settings');
settings.addEventListener('change',async()=>{
  if(!every.reportValidity())return;
  try{await send({type:'settings',settings:{enabled:enabled.checked,every:Number(every.value),roam:roam.checked}});status('设置已保存。');}
  catch(error){status((error as Error).message);}
});
settings.addEventListener('submit',event=>event.preventDefault());
const bridge=element<HTMLFormElement>('bridge');
bridge.addEventListener('submit',async event=>{
  event.preventDefault();const button=bridge.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled=true;status('正在连接…');
  try{
    await browser.storage.local.set({token:token.value,port:Number(port.value)});
    await browser.storage.local.remove(['revision','peer']);
    await send({type:'sync'});await refresh();element<HTMLDetailsElement>('connection').open=false;status('已连接。以后会自动保存，无需手动同步。');
  }catch(error){status((error as Error).message);}
  finally{button.disabled=false;}
});
element('disconnect').addEventListener('click',async()=>{
  await browser.storage.local.remove(['token','revision']);token.value='';await refresh();status('已断开，笔记与未保存的修改仍留在本地。');
});
async function init(){
  const config=await browser.storage.local.get(['token','port']);
  token.value=typeof config.token==='string'?config.token:'';port.value=String(config.port??43127);
  element<HTMLDetailsElement>('connection').open=!config.token;
  await refresh();
  if(config.token)void send({type:'sync'}).catch(()=>{}).finally(()=>refresh().catch(error=>status(error.message)));
  browser.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && ['version','syncStatus','token'].some(key=>key in changes))void refresh().catch(error=>status(error.message));
  });
}
void init().catch(error=>status(error.message));
