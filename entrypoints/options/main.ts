import { browser } from 'wxt/browser';
import type { Feed } from '../../lib/types';
import { t, setLocale, getLocale, resolveLocale, formatDate, type Key } from '../../lib/i18n';
import { sites } from '../../lib/sites';
import panel from './panel.html?raw';
import './style.css';

document.querySelector('main')!.innerHTML = panel;
function translate(){
  document.documentElement.lang=getLocale()==='zh'?'zh-CN':'en';
  for(const node of document.querySelectorAll<HTMLElement>('[data-i18n]'))node.textContent=t(node.dataset.i18n as Key);
  for(const node of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]'))node.placeholder=t(node.dataset.i18nPlaceholder as Key);
  for(const node of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]'))node.setAttribute('aria-label',t(node.dataset.i18nAriaLabel as Key));
}
if(window.parent!==window)document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const parent=location.ancestorOrigins?.[0];
  if(parent && sites.some(site=>site.origin===parent))window.parent.postMessage('x-learning-feed:close',parent);
});
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const enabled = element<HTMLInputElement>('enabled');
const every = element<HTMLInputElement>('every');
const timeWeight = element<HTMLInputElement>('time-weight');
const tagMode = element<HTMLInputElement>('tag-mode');
const modes = [...document.querySelectorAll<HTMLInputElement>('input[name=mode]')];
const tags = element<HTMLInputElement>('tags');
const token = element<HTMLInputElement>('token');
const port = element<HTMLInputElement>('port');
const language = element<HTMLSelectElement>('language');
function status(text: string) { element('status').textContent = text; }
async function send(message: unknown) {
  const response = await browser.runtime.sendMessage(message);
  if (response?.error) throw new Error(response.error);
  return response;
}
async function refresh() {
  const feed: Feed = await send({type:'feed'});
  if(feed.locale && feed.locale!==getLocale()){setLocale(feed.locale);translate();}
  if(document.activeElement!==enabled)enabled.checked = feed.settings.enabled;
  if(document.activeElement!==every)every.value = String(feed.settings.every);
  if(document.activeElement!==timeWeight)timeWeight.checked=feed.settings.timeWeight!==false;
  if(!modes.includes(document.activeElement as HTMLInputElement))for(const mode of modes)mode.checked=mode.value===(feed.settings.mode??'browse');
  if(document.activeElement!==tagMode)tagMode.checked=feed.settings.tags!==undefined;
  if(document.activeElement!==tags)tags.value=feed.settings.tags?.join(', ')??'x-feed';
  tags.disabled=!tagMode.checked;
  element('selection-info').textContent=feed.settings.tags?t('panel.select.tags',{tags:feed.settings.tags.map(tag=>`#${tag}`).join(t('panel.tagSeparator'))}):t('panel.select.default');
  element('note-count').textContent = t('panel.count',{count:feed.notes.length});
  element('notes').replaceChildren(...feed.notes.map(note => {
    const li = document.createElement('li');
    const title = document.createElement('span'); title.textContent = note.title;
    const count = document.createElement('small'); count.textContent = note.metadata?.nextReview && Date.parse(note.metadata.nextReview)>Date.now()?t('panel.due'):t('panel.reviewCount',{count:note.metadata?.reviewCount??0});
    li.append(title,count); return li;
  }));
  if(!feed.notes.length)element('notes').textContent=t('panel.empty');
  const issues=(feed.pending??[]).filter(item=>item.status!=='pending');
  element('issues').hidden=!issues.length;
  element('pending').replaceChildren(...issues.map(item=>{
    const li=document.createElement('li');
    const title=document.createElement('span');title.textContent=feed.notes.find(n=>n.id===item.noteId)?.title??t('panel.removed');
    const reason=document.createElement('p');reason.textContent=item.error??t('panel.unwritable');
    li.append(title,reason);
    if(item.metadata){const draft=document.createElement('p');draft.textContent=t('panel.draft',{count:item.metadata.reviewCount,time:item.metadata.lastReviewed?formatDate(item.metadata.lastReviewed):t('panel.none'),remarks:item.metadata.remarks||t('panel.none')});li.append(draft);}
    const discard=document.createElement('button');discard.type='button';discard.className='secondary';discard.textContent=t(item.type==='edit'?'panel.discardDraft':'panel.keep');
    discard.addEventListener('click',async()=>{try{await send({type:'discard',id:item.id});await refresh();status(t('panel.kept'));}catch(error){status((error as Error).message);}});
    if(item.type==='edit'){const draft=document.createElement('textarea');draft.readOnly=true;draft.value=item.markdown??'';draft.setAttribute('aria-label',t('panel.draftAria'));draft.style.cssText='width:100%;min-height:160px;';li.append(draft);}
    li.append(discard);return li;
  }));
  const state=await browser.storage.local.get(['token','syncStatus','lastSync']);
  const waiting=(feed.pending??[]).filter(item=>item.status==='pending').length;
  const offline=String(state.syncStatus??'').startsWith('待同步');
  element('sync-info').textContent=!state.token?t('panel.notConnected'):offline?t('panel.offline')+(waiting?t('panel.offline.waiting',{count:waiting}):t('panel.offline.local')):t(waiting?'panel.autosaving':state.lastSync?'panel.connected':'panel.connecting');
  element('sync-info').dataset.state=state.token && !offline ? 'connected' : 'offline';
}
const settings=element<HTMLFormElement>('settings');
settings.addEventListener('change',async event=>{
  if(event.target===language){
    try{await send({type:'locale',locale:language.value});await refresh();}
    catch(error){status((error as Error).message);}
    return;
  }
  tags.disabled=!tagMode.checked;
  if(!every.reportValidity())return;
  if(tagMode.checked && !tags.reportValidity())return;
  const selected=[...new Set(tags.value.split(/[\s,，]+/).map(tag=>tag.replace(/^#/,'')).filter(Boolean))];
  try{await send({type:'settings',settings:{enabled:enabled.checked,every:Number(every.value),timeWeight:timeWeight.checked,mode:modes.find(mode=>mode.checked)?.value??'browse',...(tagMode.checked?{tags:selected}:{})}});status(t('panel.settingsSaved'));}
  catch(error){status((error as Error).message);}
});
settings.addEventListener('submit',event=>event.preventDefault());
const bridge=element<HTMLFormElement>('bridge');
bridge.addEventListener('submit',async event=>{
  event.preventDefault();const button=bridge.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled=true;status(t('panel.connectingShort'));
  try{
    await browser.storage.local.set({token:token.value,port:Number(port.value)});
    await browser.storage.local.remove(['revision','peer']);
    await send({type:'sync'});await refresh();element<HTMLDetailsElement>('connection').open=false;status(t('panel.connectedDone'));
  }catch(error){status((error as Error).message);}
  finally{button.disabled=false;}
});
element('disconnect').addEventListener('click',async()=>{
  await browser.storage.local.remove(['token','revision']);token.value='';await refresh();status(t('panel.disconnected'));
});
async function init(){
  const config=await browser.storage.local.get(['token','port','locale']);
  language.value=typeof config.locale==='string'?config.locale:'auto';
  setLocale(resolveLocale(config.locale,navigator.language));translate();
  token.value=typeof config.token==='string'?config.token:'';port.value=String(config.port??43127);
  element<HTMLDetailsElement>('connection').open=!config.token;
  await refresh();
  if(config.token)void send({type:'sync'}).catch(()=>{}).finally(()=>refresh().catch(error=>status(error.message)));
  browser.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && 'locale' in changes)language.value=typeof changes.locale.newValue==='string'?changes.locale.newValue:'auto';
    if(area==='local' && ['version','syncStatus','token'].some(key=>key in changes))void refresh().catch(error=>status(error.message));
  });
}
void init().catch(error=>status(error.message));
