import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { readNotes, readState, saveNotes, replaceSource, pending, savePending, acknowledge, readFeedback, saveFeedback } from '../lib/db';
import type { Note, Metadata, Operation, Settings, Rating, Pending, Mode } from '../lib/types';
import { reviewMetadata } from '../lib/review';
import { siteFor } from '../lib/sites';
import { t, setLocale, resolveLocale, isPreference, type Locale } from '../lib/i18n';

const isMode=(value:unknown):value is Mode=>value==='learn' || value==='browse';
function validMetadata(value:unknown):value is Metadata {
  const m=value as Metadata|undefined;
  if(m && m.mode!==undefined && !isMode(m.mode))return false;
  if(m && (m.rating!==undefined && m.rating!==null && ![1,2,3,4].includes(m.rating) || m.intervalDays!==undefined && (!Number.isFinite(m.intervalDays) || m.intervalDays<0 || m.intervalDays>36500) || m.nextReview!==undefined && m.nextReview!==null && (typeof m.nextReview!=='string' || !Number.isFinite(Date.parse(m.nextReview)))))return false;
  return !!m && Number.isSafeInteger(m.reviewCount) && m.reviewCount>=0 && (m.lastReviewed===null || typeof m.lastReviewed==='string' && Number.isFinite(Date.parse(m.lastReviewed))) && typeof m.remarks==='string' && m.remarks.length<=4000 && /^[a-f0-9]{64}$/.test(m.version);
}
function withPendingReviews(note:Note,outbox:Pending[]):Note {
  if(!note.metadata)return note;
  return {...note,metadata:outbox.filter(op=>op.noteId===note.id && (op.type==='review' || op.type==='mode') && op.status==='pending').reduce((metadata,op)=>op.type==='mode'?{...metadata,mode:op.mode}:reviewMetadata(metadata,op.reviewedAt!,op.rating),note.metadata)};
}
function validNote(value:unknown):value is Note {
  const n=value as Note|undefined;
  if(n?.tags!==undefined && (!Array.isArray(n.tags) || !n.tags.every(tag=>typeof tag==='string')))return false;
  return !!n && /^[a-f0-9]{64}$/.test(n.id) && typeof n.title==='string' && n.title.length<=200 && typeof n.html==='string' && n.html.length<=4*1024*1024 && (n.path===undefined || typeof n.path==='string') && (n.roam===undefined || typeof n.roam==='boolean') && (n.source===undefined || /^[a-f0-9]{64}$/.test(n.source) && validMetadata(n.metadata));
}
// Local calendar day, so "today" resets at the user's midnight rather than UTC.
function today(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
async function shownToday():Promise<string[]>{
  const {shown}=await browser.storage.local.get('shown');
  const value=shown as {day?:string;ids?:unknown}|undefined;
  return value?.day===today() && Array.isArray(value.ids) ? value.ids.filter((id):id is string=>typeof id==='string') : [];
}
export default defineBackground(() => {
  // The service worker renders errors and the feed in the language chosen on the panel.
  async function applyLocale():Promise<Locale> {
    const {locale}=await browser.storage.local.get('locale');
    const resolved=resolveLocale(locale,globalThis.navigator?.language);setLocale(resolved);return resolved;
  }
  let syncing:Promise<void>|undefined;
  let queuing:Promise<unknown>=Promise.resolve();
  const bump=()=>browser.storage.local.set({version:crypto.randomUUID()});
  async function sync() {
    if(syncing)return syncing;
    syncing=(async()=>{
      const config=await browser.storage.local.get(['token','port','revision','peer','settings']);
      if(!config.token)throw new Error(t('bg.connectFirst'));
      const url=`http://127.0.0.1:${config.port??43127}`;
      const headers={Authorization:`Bearer ${config.token}`,'Accept-Language':await applyLocale()};
      const selected=(config.settings as Settings|undefined)?.tags;
      // ponytail: 标签自选复用全库缓存；超过 10,000 篇时改为插件端按标签读取。
      const roam=selected!==undefined;
      const response=await fetch(`${url}/feed${roam?'?roam=1':''}`,{headers,signal:AbortSignal.timeout(roam?60000:10000)});
      if(!response.ok){let reason='';try{reason=(await response.json()).error??'';}catch{}throw new Error(t('bg.syncFailed',{status:response.status,reason}));}
      const feed=await response.json();
      if(selected && feed.tagSelection!==true)throw new Error(t('bg.needTags'));
      if(roam && feed.roam!==true)throw new Error(t('bg.needTags'));
      if((await pending()).some(op=>op.rating!==undefined) && feed.reviewScheduling!==true)throw new Error(t('bg.needScheduling'));
      if(!Array.isArray(feed.notes) || feed.notes.length>10000 || !feed.notes.every(validNote) || new Set(feed.notes.map((n:Note)=>n.id)).size!==feed.notes.length)throw new Error(t('bg.invalidNotes'));
      let changed=false;
      if(feed.source!==undefined){
        if(!/^[a-f0-9]{64}$/.test(feed.source) || feed.notes.some((n:Note)=>n.source!==feed.source))throw new Error(t('bg.invalidSource'));
        if(config.peer && config.peer!==feed.source)throw new Error(t('bg.vaultChanged'));
        if(!config.peer)await browser.storage.local.set({peer:feed.source});
        changed=await replaceSource(feed.source,feed.notes);
        for(const item of await pending()){
          if(item.status!=='pending')continue;
          if(item.source!==feed.source){await savePending({...item,status:'conflict',error:t('bg.discardOld')});changed=true;continue;}
          const {status,error,sequence,...operation}=item;
          const write=await fetch(`${url}/metadata`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(operation),signal:AbortSignal.timeout(item.roam?60000:10000)});
          const reply=await write.json();
          if(!write.ok){
            if(write.status>=500)throw new Error(reply.error??t('bg.writeUnavailable'));
            await savePending({...item,status:write.status===409?'conflict':'failed',error:reply.error??t('bg.writeRejected')});changed=true;continue;
          }
          if(item.type==='archive'){
            if(reply.archived!==item.noteId)throw new Error(t('bg.badArchive'));
            await acknowledge(item.id,undefined,item.noteId);changed=true;continue;
          }
          if(!validNote(reply.note) || reply.note.id!==item.noteId || reply.note.source!==feed.source)throw new Error(t('bg.badWrite'));
          await acknowledge(item.id,reply.note);changed=true;
        }
      }else{
        const s=feed.settings;
        if(!s || !Number.isInteger(s.every) || s.every<1 || s.every>100 || typeof s.enabled!=='boolean')throw new Error(t('bg.invalidMcp'));
        const known=new Set((await readNotes()).map(n=>n.id));const added=feed.notes.filter((n:Note)=>!known.has(n.id));
        if(added.length){await saveNotes(added);changed=true;}
        if(config.revision!==s.revision){await browser.storage.local.set({settings:{every:s.every,enabled:s.enabled,timeWeight:(config.settings as Settings|undefined)?.timeWeight!==false,...((config.settings as Settings|undefined)?.mode?{mode:(config.settings as Settings).mode}:{})},revision:s.revision});changed=true;}
      }
      if(changed)await bump();
      await browser.storage.local.set({syncStatus:'已同步',lastSync:new Date().toISOString()});
    })().catch(async(error)=>{
      // A snapshot or some writes can succeed before the connection fails; expose that partial progress.
      await bump();await browser.storage.local.set({syncStatus:`待同步：${error.message}`});throw error;
    }).finally(()=>{syncing=undefined;});
    return syncing;
  }
  async function queue(message:{type:string;noteId:string;metadata?:Metadata;rating?:Rating;markdown?:string;expectedVersion?:string;mode?:Mode},sender:{url?:string}) {
    if(!siteFor(sender.url) && !sender.url?.startsWith(browser.runtime.getURL('/')))throw new Error(t('bg.badOrigin'));
    if(message.type==='shown'){
      if(typeof message.noteId!=='string' || !/^[a-f0-9]{64}$/.test(message.noteId))throw new Error(t('bg.noNote'));
      const ids=await shownToday();
      if(!ids.includes(message.noteId))await browser.storage.local.set({shown:{day:today(),ids:[...ids,message.noteId].slice(-10000)}});
      return{ok:true};
    }
    if(message.type==='like' || message.type==='dislike'){
      if(typeof message.noteId!=='string' || !/^[a-f0-9]{64}$/.test(message.noteId) || !(await readNotes()).some(n=>n.id===message.noteId))throw new Error(t('bg.noNote'));
      const previous=(await readFeedback()).find(item=>item.noteId===message.noteId)?.value??0;
      const requested=message.type==='like'?1:-1;
      const feedback=previous===requested?0:requested;
      await saveFeedback(message.noteId,feedback);await bump();return{ok:true,feedback};
    }
    const {peer,token,port}=await browser.storage.local.get(['peer','token','port']);
    if(!token || !peer)throw new Error(t('bg.connectFirst'));
    const state=await readState();const note=state.notes.find(n=>n.id===message.noteId);
    if(!note?.source || note.source!==peer || !note.metadata)throw new Error(t('bg.noWriteback'));
    if(message.type==='open' || message.type==='document'){
      if(message.type==='document'){const draft=state.pending.find(op=>op.noteId===note.id && op.type==='edit');if(draft)return{markdown:draft.markdown,version:draft.expectedVersion};}
      const response=await fetch(`http://127.0.0.1:${port??43127}/${message.type==='open'?'open':'document'}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Accept-Language':await applyLocale(),'Content-Type':'application/json'},body:JSON.stringify({source:note.source,noteId:note.id,...(note.roam?{roam:true}:{})}),signal:AbortSignal.timeout(note.roam?60000:10000)});
      if(response.status===404)throw new Error(t('bg.needOpen'));
      const reply=await response.json();if(!response.ok)throw new Error(reply.error??t('bg.cannotOpen'));
      if(message.type==='document'){if(typeof reply.markdown!=='string' || reply.markdown.length>2*1024*1024 || !/^[a-f0-9]{64}$/.test(reply.version))throw new Error(t('bg.badDocument'));return reply;}
      if(reply.opened!==note.id)throw new Error(t('bg.badOpen'));return{ok:true};
    }
    const base={id:crypto.randomUUID(),noteId:note.id,source:note.source,...(note.roam?{roam:true}:{})};
    let operation:Operation;
    if(message.type==='review'){
      if(message.rating!==undefined && ![1,2,3,4].includes(message.rating))throw new Error(t('bg.badRating'));
      operation={...base,type:'review',reviewedAt:new Date().toISOString(),...(message.rating!==undefined?{rating:message.rating}:{})};
    }
    else if(message.type==='edit'){
      if(typeof message.markdown!=='string' || new TextEncoder().encode(message.markdown).length>2*1024*1024 || typeof message.expectedVersion!=='string' || !/^[a-f0-9]{64}$/.test(message.expectedVersion))throw new Error(t('bg.badEdit'));
      if(state.pending.some(op=>op.noteId===note.id && op.type==='edit'))throw new Error(t('bg.editPending'));
      operation={...base,type:'edit',markdown:message.markdown,expectedVersion:message.expectedVersion};
    }
    else if(message.type==='archive')operation={...base,type:'archive'};
    else if(message.type==='mode'){
      if(!isMode(message.mode))throw new Error(t('bg.badMode'));
      operation={...base,type:'mode',mode:message.mode};
    }
    else{
      if(!validMetadata(message.metadata))throw new Error(t('bg.badMetadata'));
      if((await pending()).some(op=>op.noteId===note.id))throw new Error(t('bg.metadataPending'));
      const {version,...metadata}=message.metadata;
      operation={...base,type:'metadata',expectedVersion:version,metadata};
    }
    const current=withPendingReviews(note,state.pending).metadata!;
    const projected=operation.type==='review'?reviewMetadata(current,operation.reviewedAt!,operation.rating):operation.type==='mode'?{...current,mode:operation.mode}:undefined;
    await savePending({...operation,status:'pending'});await bump();
    // A new operation may arrive after the active sync has already read its queue.
    if(syncing)void syncing.catch(()=>{}).then(()=>sync()).catch(()=>{});
    else void sync().catch(()=>{});
    return {ok:true,pending:true,...(projected?{metadata:projected}:{})};
  }
  browser.alarms.create('sync',{periodInMinutes:0.5});
  browser.action.onClicked.addListener(async tab=>{
    if(tab.id===undefined)return;
    await applyLocale();
    try{
      await browser.tabs.sendMessage(tab.id,{type:'toggle-panel'});
      await browser.action.setTitle({tabId:tab.id,title:'X Learning Feed'});
    }catch{
      await browser.action.setTitle({tabId:tab.id,title:t('bg.openX')});
    }
  });
  browser.alarms.onAlarm.addListener(()=>{void sync().catch(()=>{});});
  browser.runtime.onMessage.addListener((message,sender)=>{
    if(sender.id!==browser.runtime.id)return;
    return(async()=>{
      try{
        const locale=await applyLocale();
        if(message.type==='feed'){
          const {settings,version=0,peer}=await browser.storage.local.get(['settings','version','peer']);
          if(message.version===version)return{unchanged:true,version};
          const snapshot=await readState();const outbox=snapshot.pending;const archived=new Set(outbox.filter(op=>op.type==='archive').map(op=>op.noteId));
          const feedback=new Map((await readFeedback()).map(item=>[item.noteId,item.value]));
          const s=settings as Settings|undefined;
          return{notes:snapshot.notes.filter(n=>!archived.has(n.id) && (peer ? n.source===peer : !n.source) && !!n.roam===(s?.tags!==undefined) && (!s?.tags || s.tags.some(tag=>n.tags?.includes(tag)))).map(n=>({...withPendingReviews(n,outbox),feedback:feedback.get(n.id)??0})),settings:{timeWeight:true,...(settings??{every:10,enabled:true})},version,pending:outbox,locale,shown:await shownToday()};
        }
        if(message.type==='shown' || message.type==='review' || message.type==='metadata' || message.type==='archive' || message.type==='like' || message.type==='dislike' || message.type==='open' || message.type==='document' || message.type==='edit' || message.type==='mode'){
          const next=queuing.then(()=>queue(message,sender));queuing=next.catch(()=>{});return await next;
        }
        if(!sender.url?.startsWith(browser.runtime.getURL('/')))throw new Error(t('bg.settingsOnly'));
        if(message.type==='sync'){await sync();return{ok:true};}
        if(message.type==='discard'){
          const item=(await pending()).find(op=>op.id===message.id);
          if(!item || item.status==='pending')throw new Error(t('bg.discardOnly'));
          await acknowledge(item.id);await bump();return{ok:true};
        }
        if(message.type==='locale'){
          if(!isPreference(message.locale))throw new Error(t('bg.badLocale'));
          await browser.storage.local.set({locale:message.locale});await bump();return{ok:true,locale:await applyLocale()};
        }
        if(message.type==='settings'){
          const {roam:_,...s}:Settings&{roam?:unknown}=message.settings??{};
          if(!s || !Number.isInteger(s.every) || s.every<1 || s.every>100 || typeof s.enabled!=='boolean')throw new Error(t('bg.invalidSettings'));
          if(s.timeWeight!==undefined && typeof s.timeWeight!=='boolean')throw new Error(t('bg.badTimeWeight'));
          if(s.mode!==undefined && !isMode(s.mode))throw new Error(t('bg.badMode'));
          if(s.tags!==undefined && (!Array.isArray(s.tags) || s.tags.length<1 || s.tags.length>20 || !s.tags.every(tag=>typeof tag==='string' && tag.length<=100 && /^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(tag))))throw new Error(t('bg.badTags'));
          const previous=await browser.storage.local.get('settings');
          await browser.storage.local.set({settings:s});await bump();
          if(JSON.stringify(s.tags)!==JSON.stringify((previous.settings as Settings|undefined)?.tags)){
            if(syncing)void syncing.catch(()=>{}).then(()=>sync()).catch(()=>{});
            else void sync().catch(()=>{});
          }
          return{ok:true};
        }
        throw new Error(t('bg.unknown'));
      }catch(error){return{error:(error as Error).message};}
    })();
  });
});
