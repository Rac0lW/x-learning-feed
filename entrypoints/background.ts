import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { readNotes, readState, saveNotes, replaceSource, pending, savePending, acknowledge, readFeedback, saveFeedback } from '../lib/db';
import type { Note, Metadata, Operation, Settings, Rating, Pending } from '../lib/types';
import { reviewMetadata } from '../lib/review';

function validMetadata(value:unknown):value is Metadata {
  const m=value as Metadata|undefined;
  if(m && (m.rating!==undefined && m.rating!==null && ![1,2,3,4].includes(m.rating) || m.intervalDays!==undefined && (!Number.isFinite(m.intervalDays) || m.intervalDays<0 || m.intervalDays>36500) || m.nextReview!==undefined && m.nextReview!==null && (typeof m.nextReview!=='string' || !Number.isFinite(Date.parse(m.nextReview)))))return false;
  return !!m && Number.isSafeInteger(m.reviewCount) && m.reviewCount>=0 && (m.lastReviewed===null || typeof m.lastReviewed==='string' && Number.isFinite(Date.parse(m.lastReviewed))) && typeof m.remarks==='string' && m.remarks.length<=4000 && /^[a-f0-9]{64}$/.test(m.version);
}
function withPendingReviews(note:Note,outbox:Pending[]):Note {
  if(!note.metadata)return note;
  return {...note,metadata:outbox.filter(op=>op.noteId===note.id && op.type==='review' && op.status==='pending').reduce((metadata,op)=>reviewMetadata(metadata,op.reviewedAt!,op.rating),note.metadata)};
}
function validNote(value:unknown):value is Note {
  const n=value as Note|undefined;
  if(n?.tags!==undefined && (!Array.isArray(n.tags) || !n.tags.every(tag=>typeof tag==='string')))return false;
  return !!n && /^[a-f0-9]{64}$/.test(n.id) && typeof n.title==='string' && n.title.length<=200 && typeof n.html==='string' && n.html.length<=4*1024*1024 && (n.path===undefined || typeof n.path==='string') && (n.roam===undefined || typeof n.roam==='boolean') && (n.source===undefined || /^[a-f0-9]{64}$/.test(n.source) && validMetadata(n.metadata));
}
export default defineBackground(() => {
  let syncing:Promise<void>|undefined;
  let queuing:Promise<unknown>=Promise.resolve();
  const bump=()=>browser.storage.local.set({version:crypto.randomUUID()});
  async function sync() {
    if(syncing)return syncing;
    syncing=(async()=>{
      const config=await browser.storage.local.get(['token','port','revision','peer','settings']);
      if(!config.token)throw new Error('请先连接 Obsidian 插件');
      const url=`http://127.0.0.1:${config.port??43127}`;
      const headers={Authorization:`Bearer ${config.token}`};
      const selected=(config.settings as Settings|undefined)?.tags;
      // ponytail: 标签自选复用全库缓存；超过 10,000 篇时改为插件端按标签读取。
      const roam=(config.settings as Settings|undefined)?.roam===true || selected!==undefined;
      const response=await fetch(`${url}/feed${roam?'?roam=1':''}`,{headers,signal:AbortSignal.timeout(roam?60000:10000)});
      if(!response.ok){let reason='';try{reason=(await response.json()).error??'';}catch{}throw new Error(`同步失败 (${response.status}) ${reason}`);}
      const feed=await response.json();
      if(selected && feed.tagSelection!==true)throw new Error('标签自选需要新版 Obsidian 插件，请更新插件后重试');
      if(roam && feed.roam!==true)throw new Error('笔记漫游需要新版 Obsidian 插件，请更新插件后重试');
      if((await pending()).some(op=>op.rating!==undefined) && feed.reviewScheduling!==true)throw new Error('熟悉度排程需要新版 Obsidian 插件，请更新插件后重试');
      if(!Array.isArray(feed.notes) || feed.notes.length>10000 || !feed.notes.every(validNote) || new Set(feed.notes.map((n:Note)=>n.id)).size!==feed.notes.length)throw new Error('无效笔记数据');
      let changed=false;
      if(feed.source!==undefined){
        if(!/^[a-f0-9]{64}$/.test(feed.source) || feed.notes.some((n:Note)=>n.source!==feed.source))throw new Error('无效 Obsidian 来源');
        if(config.peer && config.peer!==feed.source)throw new Error('笔记库已变化，请在扩展设置重新连接');
        if(!config.peer)await browser.storage.local.set({peer:feed.source});
        changed=await replaceSource(feed.source,feed.notes);
        for(const item of await pending()){
          if(item.status!=='pending')continue;
          if(item.source!==feed.source){await savePending({...item,status:'conflict',error:'笔记库已变化，请放弃旧操作'});changed=true;continue;}
          const {status,error,sequence,...operation}=item;
          const write=await fetch(`${url}/metadata`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(operation),signal:AbortSignal.timeout(item.roam?60000:10000)});
          const reply=await write.json();
          if(!write.ok){
            if(write.status>=500)throw new Error(reply.error??'Obsidian 暂时无法写回');
            await savePending({...item,status:write.status===409?'conflict':'failed',error:reply.error??'写回被拒绝'});changed=true;continue;
          }
          if(item.type==='archive'){
            if(reply.archived!==item.noteId)throw new Error('归档响应格式错误');
            await acknowledge(item.id,undefined,item.noteId);changed=true;continue;
          }
          if(!validNote(reply.note) || reply.note.id!==item.noteId || reply.note.source!==feed.source)throw new Error('写回响应格式错误');
          await acknowledge(item.id,reply.note);changed=true;
        }
      }else{
        const s=feed.settings;
        if(!s || !Number.isInteger(s.every) || s.every<1 || s.every>100 || typeof s.enabled!=='boolean')throw new Error('无效 MCP 设置');
        const known=new Set((await readNotes()).map(n=>n.id));const added=feed.notes.filter((n:Note)=>!known.has(n.id));
        if(added.length){await saveNotes(added);changed=true;}
        if(config.revision!==s.revision){await browser.storage.local.set({settings:{every:s.every,enabled:s.enabled,timeWeight:(config.settings as Settings|undefined)?.timeWeight!==false},revision:s.revision});changed=true;}
      }
      if(changed)await bump();
      await browser.storage.local.set({syncStatus:'已同步',lastSync:new Date().toISOString()});
    })().catch(async(error)=>{
      // A snapshot or some writes can succeed before the connection fails; expose that partial progress.
      await bump();await browser.storage.local.set({syncStatus:`待同步：${error.message}`});throw error;
    }).finally(()=>{syncing=undefined;});
    return syncing;
  }
  async function queue(message:{type:string;noteId:string;metadata?:Metadata;rating?:Rating;markdown?:string;expectedVersion?:string},sender:{url?:string}) {
    if(!sender.url?.startsWith('https://x.com/') && !sender.url?.startsWith(browser.runtime.getURL('/')))throw new Error('无效操作来源');
    if(message.type==='like' || message.type==='dislike'){
      if(typeof message.noteId!=='string' || !/^[a-f0-9]{64}$/.test(message.noteId) || !(await readNotes()).some(n=>n.id===message.noteId))throw new Error('笔记不存在');
      const previous=(await readFeedback()).find(item=>item.noteId===message.noteId)?.value??0;
      const requested=message.type==='like'?1:-1;
      const feedback=previous===requested?0:requested;
      await saveFeedback(message.noteId,feedback);await bump();return{ok:true,feedback};
    }
    const {peer,token,port}=await browser.storage.local.get(['peer','token','port']);
    if(!token || !peer)throw new Error('请先连接 Obsidian 插件');
    const state=await readState();const note=state.notes.find(n=>n.id===message.noteId);
    if(!note?.source || note.source!==peer || !note.metadata)throw new Error('这篇笔记不支持 Obsidian 元数据写回');
    if(message.type==='open' || message.type==='document'){
      if(message.type==='document'){const draft=state.pending.find(op=>op.noteId===note.id && op.type==='edit');if(draft)return{markdown:draft.markdown,version:draft.expectedVersion};}
      const response=await fetch(`http://127.0.0.1:${port??43127}/${message.type==='open'?'open':'document'}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({source:note.source,noteId:note.id,...(note.roam?{roam:true}:{})}),signal:AbortSignal.timeout(note.roam?60000:10000)});
      if(response.status===404)throw new Error('打开原文需要新版 Obsidian 插件，请更新插件');
      const reply=await response.json();if(!response.ok)throw new Error(reply.error??'无法打开 Obsidian 原文');
      if(message.type==='document'){if(typeof reply.markdown!=='string' || reply.markdown.length>2*1024*1024 || !/^[a-f0-9]{64}$/.test(reply.version))throw new Error('正文响应格式错误');return reply;}
      if(reply.opened!==note.id)throw new Error('打开原文响应格式错误');return{ok:true};
    }
    const base={id:crypto.randomUUID(),noteId:note.id,source:note.source,...(note.roam?{roam:true}:{})};
    let operation:Operation;
    if(message.type==='review'){
      if(message.rating!==undefined && ![1,2,3,4].includes(message.rating))throw new Error('熟悉度必须是重来、困难、良好或简单');
      operation={...base,type:'review',reviewedAt:new Date().toISOString(),...(message.rating!==undefined?{rating:message.rating}:{})};
    }
    else if(message.type==='edit'){
      if(typeof message.markdown!=='string' || new TextEncoder().encode(message.markdown).length>2*1024*1024 || typeof message.expectedVersion!=='string' || !/^[a-f0-9]{64}$/.test(message.expectedVersion))throw new Error('正文或版本格式错误，正文最多 2 MiB');
      if(state.pending.some(op=>op.noteId===note.id && op.type==='edit'))throw new Error('上次正文修改尚未保存，请先在扩展设置中处理保留的草稿');
      operation={...base,type:'edit',markdown:message.markdown,expectedVersion:message.expectedVersion};
    }
    else if(message.type==='archive')operation={...base,type:'archive'};
    else{
      if(!validMetadata(message.metadata))throw new Error('复习次数、时间或备注格式错误');
      if((await pending()).some(op=>op.noteId===note.id))throw new Error('上次修改还未写回，请稍候；若 Obsidian 已关闭，打开后会自动保存');
      const {version,...metadata}=message.metadata;
      operation={...base,type:'metadata',expectedVersion:version,metadata};
    }
    const projected=operation.type==='review'?reviewMetadata(withPendingReviews(note,state.pending).metadata!,operation.reviewedAt!,operation.rating):undefined;
    await savePending({...operation,status:'pending'});await bump();
    // A new operation may arrive after the active sync has already read its queue.
    if(syncing)void syncing.catch(()=>{}).then(()=>sync()).catch(()=>{});
    else void sync().catch(()=>{});
    return {ok:true,pending:true,...(projected?{metadata:projected}:{})};
  }
  browser.alarms.create('sync',{periodInMinutes:0.5});
  browser.action.onClicked.addListener(async tab=>{
    if(tab.id===undefined)return;
    try{
      await browser.tabs.sendMessage(tab.id,{type:'toggle-panel'});
      await browser.action.setTitle({tabId:tab.id,title:'X Learning Feed'});
    }catch{
      await browser.action.setTitle({tabId:tab.id,title:'请打开或刷新 X 页面，再点此处展开学习设置'});
    }
  });
  browser.alarms.onAlarm.addListener(()=>{void sync().catch(()=>{});});
  browser.runtime.onMessage.addListener((message,sender)=>{
    if(sender.id!==browser.runtime.id)return;
    return(async()=>{
      try{
        if(message.type==='feed'){
          const {settings,version=0,peer}=await browser.storage.local.get(['settings','version','peer']);
          if(message.version===version)return{unchanged:true,version};
          const snapshot=await readState();const outbox=snapshot.pending;const archived=new Set(outbox.filter(op=>op.type==='archive').map(op=>op.noteId));
          const feedback=new Map((await readFeedback()).map(item=>[item.noteId,item.value]));
          const s=settings as Settings|undefined;
          return{notes:snapshot.notes.filter(n=>!archived.has(n.id) && (peer ? n.source===peer : !n.source) && !!n.roam===(!!s?.roam || s?.tags!==undefined) && (!s?.tags || s.tags.some(tag=>n.tags?.includes(tag)))).map(n=>({...withPendingReviews(n,outbox),feedback:feedback.get(n.id)??0})),settings:{timeWeight:true,...(settings??{every:10,enabled:true})},version,pending:outbox};
        }
        if(message.type==='review' || message.type==='metadata' || message.type==='archive' || message.type==='like' || message.type==='dislike' || message.type==='open' || message.type==='document' || message.type==='edit'){
          const next=queuing.then(()=>queue(message,sender));queuing=next.catch(()=>{});return await next;
        }
        if(!sender.url?.startsWith(browser.runtime.getURL('/')))throw new Error('只允许设置页面修改数据');
        if(message.type==='sync'){await sync();return{ok:true};}
        if(message.type==='discard'){
          const item=(await pending()).find(op=>op.id===message.id);
          if(!item || item.status==='pending')throw new Error('只可放弃已冲突或失败的操作');
          await acknowledge(item.id);await bump();return{ok:true};
        }
        if(message.type==='settings'){
          const s:Settings=message.settings;
          if(!s || !Number.isInteger(s.every) || s.every<1 || s.every>100 || typeof s.enabled!=='boolean' || s.roam!==undefined && typeof s.roam!=='boolean')throw new Error('无效设置');
          if(s.timeWeight!==undefined && typeof s.timeWeight!=='boolean')throw new Error('时间权重开关格式错误');
          if(s.tags!==undefined && (s.roam || !Array.isArray(s.tags) || s.tags.length<1 || s.tags.length>20 || !s.tags.every(tag=>typeof tag==='string' && tag.length<=100 && /^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(tag))))throw new Error('请填写 1–20 个标签，使用文字、数字、下划线、短横线或斜杠；标签自选与漫游不能同时开启');
          const previous=await browser.storage.local.get('settings');
          await browser.storage.local.set({settings:s});await bump();
          if(!!s.roam!==!!(previous.settings as Settings|undefined)?.roam || JSON.stringify(s.tags)!==JSON.stringify((previous.settings as Settings|undefined)?.tags)){
            if(syncing)void syncing.catch(()=>{}).then(()=>sync()).catch(()=>{});
            else void sync().catch(()=>{});
          }
          return{ok:true};
        }
        throw new Error('未知消息');
      }catch(error){return{error:(error as Error).message};}
    })();
  });
});
