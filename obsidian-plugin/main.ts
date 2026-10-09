import * as obsidian from 'obsidian';
import { Plugin, PluginSettingTab, Setting, Notice, TFile, getAllTags } from 'obsidian';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { render } from '../src/render';
import { BridgeError, operationSchema, openSchema, bodyVersion, splitNote, hasTag, excluded, ensureIdentity, readMetadata, applyOperation, readTags } from './core';
import type { Note } from '../lib/types';
import { t, setLocale, resolveLocale, isPreference, type Locale, type LocalePreference } from '../lib/i18n';

type Config = {token:string;source:string;port:number;language?:LocalePreference};
// getLanguage exists from Obsidian 1.8; older versions keep the language in localStorage.
const obsidianLanguage=()=>typeof obsidian.getLanguage==='function'?obsidian.getLanguage():globalThis.localStorage?.getItem('language')??'en';
export default class XLearningFeed extends Plugin {
  declare settings: Config;
  server?: Server;
  status:{key:'ob.notStarted'|'ob.running'|'ob.stopped'}|{message:string} = {key:'ob.notStarted'};
  get state() {return 'message' in this.status ? this.status.message : t(this.status.key,{port:this.settings.port});}
  set state(message:string) {this.status={message};}
  applyLanguage() {setLocale(resolveLocale(this.settings.language??'auto',obsidianLanguage()));}
  private files = new Map<string,TFile>();
  private cache = new Map<string,{mtime:number;size:number;content:string;note:Note;tagKey?:string}>();
  private work:Promise<unknown> = Promise.resolve();
  async onload() {
    const saved = await this.loadData();
    this.settings = {token:randomBytes(32).toString('hex'),source:randomBytes(32).toString('hex'),port:43127,...saved};
    if(this.settings.language!==undefined && !isPreference(this.settings.language))this.settings.language='auto';
    this.applyLanguage();
    if (!/^[a-f0-9]{64}$/.test(this.settings.token) || !/^[a-f0-9]{64}$/.test(this.settings.source) || !Number.isInteger(this.settings.port) || this.settings.port<1 || this.settings.port>65535) throw new Error(t('ob.badConfig'));
    await this.saveData(this.settings);
    this.addSettingTab(new BridgeSettings(this.app,this));
    this.app.workspace.onLayoutReady(() => {void this.start().catch(error => {this.state=error.message;new Notice(`X Learning Feed: ${error.message}`);});});
  }
  async start() {
    if (this.server) return;
    const server = createServer((req,res) => {void this.handle(req,res);});
    await new Promise<void>((resolve,reject) => {server.once('error',reject);server.listen(this.settings.port,'127.0.0.1',resolve);});
    this.server = server; this.status = {key:'ob.running'};
    server.on('error',error => {this.state=error.message;new Notice(`X Learning Feed: ${error.message}`);});
  }
  onunload() {this.server?.closeAllConnections();this.server?.close();this.server=undefined;this.status={key:'ob.stopped'};}
  private serialized<T>(task:()=>Promise<T>):Promise<T> {
    const next=this.work.then(task);this.work=next.catch(()=>{});return next;
  }
  private async feed(roam=false,archiveId?:string) {
    const notes:Note[]=[];const files=new Map<string,TFile>();
    const vaultFiles=this.app.vault.getMarkdownFiles();
    const paths=new Set(vaultFiles.map(file=>file.path));
    for(const path of this.cache.keys())if(!paths.has(path))this.cache.delete(path);
    const contents=new Map<string,string>();
    if(roam){
      const missing=vaultFiles.filter(file=>{
        const cached=this.cache.get(file.path);
        return file.stat.size<=2*1024*1024 && (!cached || cached.mtime!==file.stat.mtime || cached.size!==file.stat.size);
      });
      // Read in small batches so a large vault doesn't wait for thousands of serial disk requests.
      for(let i=0;i<missing.length;i+=20)await Promise.all(missing.slice(i,i+20).map(async file=>{contents.set(file.path,await this.app.vault.read(file));}));
    }
    for (const file of vaultFiles) {
      const cached=this.cache.get(file.path);
      const cache=this.app.metadataCache.getFileCache(file);
      // A just-written note can temporarily disappear from Obsidian's tag index.
      if (!roam && !(archiveId && cached?.note.id===archiveId) && !(cache && getAllTags(cache)?.includes('#x-feed'))) continue;
      if (file.stat.size>2*1024*1024) {if(roam)continue;throw new BridgeError(422,'ob.tooLarge',{name:file.basename});}
      const fresh=cached && cached.mtime===file.stat.mtime && cached.size===file.stat.size;
      if(fresh && !archiveId && excluded(cached.content))continue;
      if(fresh && (roam || hasTag(cached.content,'x-feed'))){
        if(files.has(cached.note.id))throw new BridgeError(409,'ob.duplicateId',{name:file.basename});
        files.set(cached.note.id,file);
        // Tags only change with the file or Obsidian's tag index, so reuse them instead of re-parsing every note on each sync.
        const candidates=cache?getAllTags(cache)??[]:[];const tagKey=candidates.join('\n');
        if(cached.tagKey!==tagKey){cached.note={...cached.note,tags:readTags(cached.content,candidates)};cached.tagKey=tagKey;}
        notes.push({...cached.note,...(roam?{roam:true}:{})});continue;
      }
      let content=contents.get(file.path)??await this.app.vault.read(file);
      if (!archiveId && excluded(content) || !roam && !hasTag(content,'x-feed')) continue;
      if (!roam && !splitNote(content).frontmatter.xfeed_id) content=await this.app.vault.process(file,data => ensureIdentity(data,createHash('sha256').update(`${this.settings.source}:${file.path}`).digest('hex')));
      if (!archiveId && excluded(content) || !roam && !hasTag(content,'x-feed')) continue;
      const {frontmatter,body}=splitNote(content);
      // Roaming is read-only until the user actually records a review.
      const id=frontmatter.xfeed_id??createHash('sha256').update(`${this.settings.source}:${file.path}`).digest('hex');
      if (typeof id!=='string' || !/^[a-f0-9]{64}$/.test(id)) throw new BridgeError(422,'ob.badIdIn',{name:file.basename});
      if (files.has(id)) throw new BridgeError(409,'ob.duplicateIdFix',{name:file.basename});
      files.set(id,file);
      const candidates=cache?getAllTags(cache)??[]:[];
      const note={id,title:file.basename.slice(0,200),html:render(body,'markdown'),source:this.settings.source,path:file.path,metadata:readMetadata(frontmatter),tags:readTags(content,candidates)};
      if(Number.isFinite(file.stat.mtime))this.cache.set(file.path,{mtime:file.stat.mtime,size:file.stat.size,content,note,tagKey:candidates.join('\n')});
      notes.push({...note,...(roam?{roam:true}:{})});
    }
    this.files=files;
    return {source:this.settings.source,notes,roam,tagSelection:true,reviewScheduling:true,openInObsidian:true,inlineEditing:true};
  }
  // Opening a note the last scan already found must not wait for a whole-vault rescan or a running sync.
  private known(noteId:string,roam:boolean) {
    const file=this.files.get(noteId);if(!file)return undefined;
    const cached=this.cache.get(file.path);
    if(!cached || cached.note.id!==noteId || cached.mtime!==file.stat.mtime || cached.size!==file.stat.size || !this.app.vault.getMarkdownFiles().includes(file))return undefined;
    if(excluded(cached.content) || !roam && !hasTag(cached.content,'x-feed'))return undefined;
    return file;
  }
  private async handle(req:IncomingMessage,res:ServerResponse) {
    const requested=req.headers['accept-language'];
    const locale:Locale=requested==='zh' || requested==='en' ? requested : resolveLocale(this.settings.language??'auto',obsidianLanguage());
    const send=(status:number,value:unknown) => {if(!res.destroyed)res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));};
    const supplied=Buffer.from(req.headers.authorization??'');const expected=Buffer.from(`Bearer ${this.settings.token}`);
    if (req.headers.host!==`127.0.0.1:${this.settings.port}` || (req.headers.origin && !/^chrome-extension:\/\//.test(req.headers.origin)) || supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) {send(403,{error:t('ob.forbidden',{},locale)});return;}
    try {
      if (req.method==='GET' && (req.url==='/feed' || req.url==='/feed?roam=1')) {send(200,await this.serialized(()=>this.feed(req.url==='/feed?roam=1')));return;}
      if (req.method!=='POST' || !['/metadata','/open','/document'].includes(req.url??'')) {send(404,{error:t('ob.notFound',{},locale)});return;}
      if (!req.headers['content-type']?.startsWith('application/json')) throw new BridgeError(415,'ob.jsonOnly');
      const chunks:Buffer[]=[];let bytes=0;
      for await (const chunk of req) {bytes+=chunk.length;if(bytes>(req.url==='/metadata'?16*1024*1024:32768))throw new BridgeError(413,'ob.tooBig');chunks.push(chunk);}
      let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new BridgeError(400,'ob.badJson');}
      if(req.url==='/open' || req.url==='/document'){
        const parsed=openSchema.safeParse(input);if(!parsed.success)throw new BridgeError(400,'ob.badOpen');
        const op=parsed.data;if(op.source!==this.settings.source)throw new BridgeError(409,'ob.vaultChanged');
        const serve=async(file:TFile)=>{
          if(req.url==='/document'){const {body}=splitNote(await this.app.vault.read(file));return{markdown:body,version:bodyVersion(body)};}
          await this.app.workspace.getLeaf(false).openFile(file,{active:true,state:{mode:'source'}});
          const remote=require('electron').remote;const window=remote.getCurrentWindow();
          if(window.isMinimized())window.restore();
          window.show();remote.app.focus({steal:true});window.focus();
        };
        const file=this.known(op.noteId,op.roam===true);
        const document=file?await serve(file):await this.serialized(async()=>{
          await this.feed(op.roam===true);const file=this.files.get(op.noteId);if(!file)throw new BridgeError(409,'ob.removed');
          return serve(file);
        });
        send(200,document??{opened:op.noteId});return;
      }
      const parsed=operationSchema.safeParse(input);if(!parsed.success)throw new BridgeError(400,'ob.badWrite');
      const operation=parsed.data;
      if (operation.source!==this.settings.source) throw new BridgeError(409,'ob.vaultChangedReconnect');
      const note=await this.serialized(async () => {
        await this.feed(operation.roam===true,operation.type==='archive'?operation.noteId:undefined);
        const file=this.files.get(operation.noteId);if(!file)throw new BridgeError(409,'ob.untagged');
        const content=await this.app.vault.process(file,data => applyOperation(ensureIdentity(data,operation.noteId,operation.roam===true),operation));
        if(operation.type!=='archive')this.cache.delete(file.path);
        if(operation.type==='archive')return undefined;
        const cache=this.app.metadataCache.getFileCache(file);
        return {id:operation.noteId,title:file.basename.slice(0,200),html:render(splitNote(content).body,'markdown'),source:this.settings.source,path:file.path,metadata:readMetadata(splitNote(content).frontmatter),tags:readTags(content,cache?getAllTags(cache)??[]:[]),...(operation.roam?{roam:true}:{})};
      });
      send(200,note?{note}:{archived:operation.noteId});
    } catch(error) {send(error instanceof BridgeError ? error.status : 500,{error:error instanceof BridgeError ? error.translate(locale) : t('ob.failed',{},locale)});if(!(error instanceof BridgeError))console.error('X Learning Feed:',error);}
  }
}
const settingsStyle=`.xlf-hero{display:flex;gap:14px;align-items:center;padding:16px 18px;margin-bottom:12px;border-radius:var(--radius-l);background:linear-gradient(140deg,rgba(var(--color-purple-rgb),.12),transparent 70%);border:1px solid var(--background-modifier-border)}
.xlf-mark{flex:none;display:grid;place-items:center;width:42px;height:42px;border-radius:12px;color:#fff;font-size:22px;background:linear-gradient(140deg,#9b7af0,#6a3fd1);box-shadow:0 4px 12px rgba(106,63,209,.3)}
.xlf-hero h2{margin:0;font-size:var(--font-ui-large)}.xlf-hero p{margin:4px 0 0;color:var(--text-muted);font-size:var(--font-ui-small);line-height:1.5}
.xlf-status{display:inline-flex;align-items:center;gap:7px;padding:2px 10px;border-radius:999px;font-weight:var(--font-medium);background:var(--background-modifier-hover)}.xlf-status:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--text-faint)}
.xlf-status[data-state=running]{color:var(--color-green);background:rgba(var(--color-green-rgb),.1)}.xlf-status[data-state=running]:before{background:var(--color-green);box-shadow:0 0 0 3px rgba(var(--color-green-rgb),.25)}.xlf-status[data-state=error]{color:var(--color-red);background:rgba(var(--color-red-rgb),.1)}.xlf-status[data-state=error]:before{background:var(--color-red)}
.xlf-port{display:block;margin-top:6px}.xlf-token input{font-family:var(--font-monospace);font-size:var(--font-ui-smaller);width:min(320px,40vw)}`;
class BridgeSettings extends PluginSettingTab {
  constructor(app:Plugin['app'],private plugin:XLearningFeed){super(app,plugin);}
  display() {
    const {containerEl}=this;containerEl.empty();
    containerEl.createEl('style',{text:settingsStyle});
    const hero=containerEl.createDiv({cls:'xlf-hero'});hero.createDiv({cls:'xlf-mark',text:'✦',attr:{'aria-hidden':'true'}});
    const intro=hero.createDiv();intro.createEl('h2',{text:'X Learning Feed'});intro.createEl('p',{text:t('ob.intro')});
    const running=!!this.plugin.server;
    const server=new Setting(containerEl).setName(t('ob.server')).setDesc(createFragment(desc=>{
      desc.createSpan({cls:'xlf-status',text:this.plugin.state,attr:{'data-state':running?'running':'message' in this.plugin.status?'error':'idle'}});
      desc.createSpan({cls:'xlf-port',text:t('ob.port',{port:this.plugin.settings.port})});
    }));
    if(!running)server.addButton(button=>button.setButtonText(t('ob.retry')).setCta().onClick(async()=>{try{await this.plugin.start();}catch(error){this.plugin.state=(error as Error).message;}this.display();}));
    new Setting(containerEl).setName(t('ob.heading.connection')).setHeading();
    new Setting(containerEl).setName(t('ob.token')).setDesc(t('ob.token.desc')).setClass('xlf-token')
      .addText(text=>{text.setValue(this.plugin.settings.token);text.inputEl.readOnly=true;text.inputEl.addEventListener('focus',()=>text.inputEl.select());})
      .addButton(button=>button.setButtonText(t('ob.copy')).setTooltip(t('ob.copyToken')).setCta().onClick(async()=>{await navigator.clipboard.writeText(this.plugin.settings.token);new Notice(t('ob.copied'));}));
    new Setting(containerEl).setName(t('ob.heading.general')).setHeading();
    new Setting(containerEl).setName(t('ob.language')).setDesc(t('ob.language.desc')).addDropdown(dropdown=>dropdown.addOption('auto',t('ob.language.auto')).addOption('zh','中文').addOption('en','English').setValue(this.plugin.settings.language??'auto').onChange(async value=>{
      this.plugin.settings.language=value as LocalePreference;await this.plugin.saveData(this.plugin.settings);this.plugin.applyLanguage();this.display();
    }));
  }
}
