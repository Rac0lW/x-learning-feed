import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { readNotes, saveNotes, replaceSource, pending, savePending, acknowledge } from '../lib/db';
import type { Note, Metadata, Operation, Settings } from '../lib/types';

function validMetadata(value:unknown):value is Metadata {
  const m=value as Metadata|undefined;
  return !!m && Number.isSafeInteger(m.reviewCount) && m.reviewCount>=0 && (m.lastReviewed===null || typeof m.lastReviewed==='string' && Number.isFinite(Date.parse(m.lastReviewed))) && typeof m.remarks==='string' && m.remarks.length<=4000 && /^[a-f0-9]{64}$/.test(m.version);
}
function validNote(value:unknown):value is Note {
  const n=value as Note|undefined;
  return !!n && /^[a-f0-9]{64}$/.test(n.id) && typeof n.title==='string' && n.title.length<=200 && typeof n.html==='string' && n.html.length<=4*1024*1024 && (n.roam===undefined || typeof n.roam==='boolean') && (n.source===undefined || /^[a-f0-9]{64}$/.test(n.source) && validMetadata(n.metadata));
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
      const roam=(config.settings as Settings|undefined)?.roam===true;
      const response=await fetch(`${url}/feed${roam?'?roam=1':''}`,{headers,signal:AbortSignal.timeout(roam?60000:10000)});
      if(!response.ok){let reason='';try{reason=(await response.json()).error??'';}catch{}throw new Error(`同步失败 (${response.status}) ${reason}`);}
      const feed=await response.json();
      if(roam && feed.roam!==true)throw new Error('笔记漫游需要新版 Obsidian 插件，请更新插件后重试');
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
        if(config.revision!==s.revision){await browser.storage.local.set({settings:{every:s.every,enabled:s.enabled},revision:s.revision});changed=true;}
      }
      if(changed)await bump();
      await browser.storage.local.set({syncStatus:'已同步',lastSync:new Date().toISOString()});
    })().catch(async(error)=>{
      // A snapshot or some writes can succeed before the connection fails; expose that partial progress.
      await bump();await browser.storage.local.set({syncStatus:`待同步：${error.message}`});throw error;
    }).finally(()=>{syncing=undefined;});
    return syncing;
  }
  async function queue(message:{type:string;noteId:string;metadata?:Metadata},sender:{url?:string}) {
    if(!sender.url?.startsWith('https://x.com/') && !sender.url?.startsWith(browser.runtime.getURL('/')))throw new Error('无效操作来源');
    const {peer,token}=await browser.storage.local.get(['peer','token']);
    if(!token || !peer)throw new Error('请先连接 Obsidian 插件');
    const note=(await readNotes()).find(n=>n.id===message.noteId);
    if(!note?.source || note.source!==peer || !note.metadata)throw new Error('这篇笔记不支持 Obsidian 元数据写回');
    const base={id:crypto.randomUUID(),noteId:note.id,source:note.source,...(note.roam?{roam:true}:{})};
    let operation:Operation;
    if(message.type==='review')operation={...base,type:'review',reviewedAt:new Date().toISOString()};
    else if(message.type==='archive')operation={...base,type:'archive'};
    else{
      if(!validMetadata(message.metadata))throw new Error('复习次数、时间或备注格式错误');
      if((await pending()).some(op=>op.noteId===note.id))throw new Error('上次修改还未写回，请稍候；若 Obsidian 已关闭，打开后会自动保存');
      const {version,...metadata}=message.metadata;
      operation={...base,type:'metadata',expectedVersion:version,metadata};
    }
    await savePending({...operation,status:'pending'});await bump();
    // A new operation may arrive after the active sync has already read its queue.
    if(syncing)void syncing.catch(()=>{}).then(()=>sync()).catch(()=>{});
    else void sync().catch(()=>{});
    return {ok:true,pending:true};
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
          const outbox=await pending();const archived=new Set(outbox.filter(op=>op.type==='archive').map(op=>op.noteId));
          return{notes:(await readNotes()).filter(n=>!archived.has(n.id) && (peer ? n.source===peer : !n.source) && !!n.roam===!!(settings as Settings|undefined)?.roam),settings:settings??{every:10,enabled:true},version,pending:outbox};
        }
        if(message.type==='review' || message.type==='metadata' || message.type==='archive'){
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
          const previous=await browser.storage.local.get('settings');
          await browser.storage.local.set({settings:s});await bump();
          if(!!s.roam!==!!(previous.settings as Settings|undefined)?.roam){
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
