import { Plugin, PluginSettingTab, Setting, Notice, TFile, getAllTags } from 'obsidian';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { render } from '../src/render';
import { BridgeError, operationSchema, splitNote, hasTag, excluded, ensureIdentity, readMetadata, applyOperation } from './core';
import type { Note } from '../lib/types';

type Config = {token:string;source:string;port:number};
export default class XLearningFeed extends Plugin {
  declare settings: Config;
  server?: Server;
  state = '未启动';
  private files = new Map<string,TFile>();
  private cache = new Map<string,{mtime:number;size:number;content:string;note:Note}>();
  private work:Promise<unknown> = Promise.resolve();
  async onload() {
    const saved = await this.loadData();
    this.settings = {token:randomBytes(32).toString('hex'),source:randomBytes(32).toString('hex'),port:43127,...saved};
    if (!/^[a-f0-9]{64}$/.test(this.settings.token) || !/^[a-f0-9]{64}$/.test(this.settings.source) || !Number.isInteger(this.settings.port) || this.settings.port<1 || this.settings.port>65535) throw new Error('X Learning Feed 插件设置格式错误');
    await this.saveData(this.settings);
    this.addSettingTab(new BridgeSettings(this.app,this));
    this.app.workspace.onLayoutReady(() => {void this.start().catch(error => {this.state=error.message;new Notice(`X Learning Feed：${error.message}`);});});
  }
  async start() {
    if (this.server) return;
    const server = createServer((req,res) => {void this.handle(req,res);});
    await new Promise<void>((resolve,reject) => {server.once('error',reject);server.listen(this.settings.port,'127.0.0.1',resolve);});
    this.server = server; this.state = `运行中 · 127.0.0.1:${this.settings.port}`;
    server.on('error',error => {this.state=error.message;new Notice(`X Learning Feed：${error.message}`);});
  }
  onunload() {this.server?.closeAllConnections();this.server?.close();this.server=undefined;this.state='已停止';}
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
      if (file.stat.size>2*1024*1024) {if(roam)continue;throw new BridgeError(422,`带标签文章超过 2 MiB：${file.basename}`);}
      const fresh=cached && cached.mtime===file.stat.mtime && cached.size===file.stat.size;
      if(fresh && !archiveId && excluded(cached.content))continue;
      if(fresh && (roam || hasTag(cached.content,'x-feed'))){
        if(files.has(cached.note.id))throw new BridgeError(409,`两篇笔记的 xfeed_id 相同：${file.basename}`);
        files.set(cached.note.id,file);notes.push({...cached.note,...(roam?{roam:true}:{})});continue;
      }
      let content=contents.get(file.path)??await this.app.vault.read(file);
      if (!archiveId && excluded(content) || !roam && !hasTag(content,'x-feed')) continue;
      if (!roam && !splitNote(content).frontmatter.xfeed_id) content=await this.app.vault.process(file,data => ensureIdentity(data,randomBytes(32).toString('hex')));
      if (!archiveId && excluded(content) || !roam && !hasTag(content,'x-feed')) continue;
      const {frontmatter,body}=splitNote(content);
      // Roaming is read-only until the user actually records a review.
      const id=frontmatter.xfeed_id??createHash('sha256').update(`${this.settings.source}:${file.path}`).digest('hex');
      if (typeof id!=='string' || !/^[a-f0-9]{64}$/.test(id)) throw new BridgeError(422,`xfeed_id 格式错误：${file.basename}`);
      if (files.has(id)) throw new BridgeError(409,`两篇笔记的 xfeed_id 相同：${file.basename}。请删除副本的 xfeed_id 后重试。`);
      files.set(id,file);
      const note={id,title:file.basename.slice(0,200),html:render(body,'markdown'),source:this.settings.source,path:file.path,metadata:readMetadata(frontmatter)};
      if(Number.isFinite(file.stat.mtime))this.cache.set(file.path,{mtime:file.stat.mtime,size:file.stat.size,content,note});
      notes.push({...note,...(roam?{roam:true}:{})});
    }
    this.files=files;
    return {source:this.settings.source,notes,roam};
  }
  private async handle(req:IncomingMessage,res:ServerResponse) {
    const send=(status:number,value:unknown) => {if(!res.destroyed)res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));};
    const supplied=Buffer.from(req.headers.authorization??'');const expected=Buffer.from(`Bearer ${this.settings.token}`);
    if (req.headers.host!==`127.0.0.1:${this.settings.port}` || (req.headers.origin && !/^chrome-extension:\/\//.test(req.headers.origin)) || supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) {send(403,{error:'连接令牌或请求来源错误'});return;}
    try {
      if (req.method==='GET' && (req.url==='/feed' || req.url==='/feed?roam=1')) {send(200,await this.serialized(()=>this.feed(req.url==='/feed?roam=1')));return;}
      if (req.method!=='POST' || req.url!=='/metadata') {send(404,{error:'接口不存在'});return;}
      if (!req.headers['content-type']?.startsWith('application/json')) throw new BridgeError(415,'必须发送 JSON');
      const chunks:Buffer[]=[];let bytes=0;
      for await (const chunk of req) {bytes+=chunk.length;if(bytes>32768)throw new BridgeError(413,'元数据请求过大');chunks.push(chunk);}
      let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new BridgeError(400,'JSON 格式错误');}
      const parsed=operationSchema.safeParse(input);if(!parsed.success)throw new BridgeError(400,'仅允许复习记录和归档；请求格式错误');
      const operation=parsed.data;
      if (operation.source!==this.settings.source) throw new BridgeError(409,'连接的笔记库已变化，请重新连接');
      const note=await this.serialized(async () => {
        await this.feed(operation.roam===true,operation.type==='archive'?operation.noteId:undefined);
        const file=this.files.get(operation.noteId);if(!file)throw new BridgeError(409,'文章已移除标签或删除，请放弃这条待同步操作');
        const content=await this.app.vault.process(file,data => applyOperation(ensureIdentity(data,operation.noteId,operation.roam===true),operation));
        if(operation.type!=='archive')this.cache.delete(file.path);
        if(operation.type==='archive')return undefined;
        return {id:operation.noteId,title:file.basename.slice(0,200),html:render(splitNote(content).body,'markdown'),source:this.settings.source,path:file.path,metadata:readMetadata(splitNote(content).frontmatter),...(operation.roam?{roam:true}:{})};
      });
      send(200,note?{note}:{archived:operation.noteId});
    } catch(error) {send(error instanceof BridgeError ? error.status : 500,{error:error instanceof BridgeError ? error.message : '同步失败，请检查 Obsidian 笔记属性或插件日志'});if(!(error instanceof BridgeError))console.error('X Learning Feed:',error);}
  }
}
class BridgeSettings extends PluginSettingTab {
  constructor(app:Plugin['app'],private plugin:XLearningFeed){super(app,plugin);}
  display() {
    const {containerEl}=this;containerEl.empty();containerEl.createEl('h2',{text:'X Learning Feed'});
    containerEl.createEl('p',{text:`状态：${this.plugin.state}`});
    containerEl.createEl('p',{text:'给笔记添加 #x-feed 后进入信息流，或在 Chrome 开启笔记漫游随机浏览整个库。Chrome 可记录复习次数、时间和备注。'});
    new Setting(containerEl).setName('连接令牌').setDesc('将令牌复制到 Chrome 扩展设置。仅用于本机连接。').addText(text=>{text.setValue(this.plugin.settings.token);text.inputEl.readOnly=true;});
    new Setting(containerEl).setName('复制令牌').addButton(button=>button.setButtonText('复制').onClick(async()=>{await navigator.clipboard.writeText(this.plugin.settings.token);new Notice('连接令牌已复制');}));
    containerEl.createEl('p',{text:`端口：${this.plugin.settings.port}。若启动失败且端口占用，请停止旧版 Node 服务。`});
    new Setting(containerEl).setName('重试启动').addButton(button=>button.setButtonText('启动').onClick(async()=>{try{await this.plugin.start();}catch(error){this.plugin.state=(error as Error).message;}this.display();}));
  }
}
