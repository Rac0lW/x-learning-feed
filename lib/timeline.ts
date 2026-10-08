import { clean } from './render.js';
import type { Feed, Note, Metadata } from './types.js';

export class Timeline {
  seen = new Set<string>();
  used = new Set<string>();
  assignments = new Map<string,string>();
  skipped = new Set<string>();
  expanded = new Set<string>();
  private versions=new WeakMap<HTMLElement,string>();
  private drafts=new Map<string,Metadata>();
  feed: Feed = { notes:[], settings:{every:10,enabled:true} };
  constructor(private document: Document, private change?:(type:'review'|'metadata',noteId:string,metadata?:Metadata)=>Promise<{error?:string}>) {}
  clear() { this.document.querySelectorAll('x-learning-card').forEach(n => n.remove()); }
  update(feed: Feed) {
    const modeChanged=!!feed.settings.roam!==!!this.feed.settings.roam;
    if(modeChanged){this.used.clear();this.skipped.clear();this.expanded.clear();}
    if (feed.settings.every !== this.feed.settings.every || modeChanged || !this.feed.notes.length && feed.notes.length>0) {
      this.clear(); this.seen.clear(); this.assignments.clear();
    }
    this.feed = feed;
  }
  reconcile() {
    if (this.document.location.pathname !== '/home' || !this.feed.settings.enabled) { this.clear(); return; }
    const primary = this.document.querySelector('[data-testid="primaryColumn"]');
    if (!primary) { this.clear(); return; }
    const cells = Array.from(primary.querySelectorAll('[data-testid="cellInnerDiv"]'));
    const visible = new Map<Element,string>();
    for (const cell of cells) {
      const tweet = cell.querySelector('article[data-testid="tweet"]');
      const time = tweet?.querySelector('time');
      const link = time?.closest('a');
      const id = link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
      if (!id) continue;
      visible.set(cell,id);
      if (!this.seen.has(id)) {
        this.seen.add(id);
        if (this.seen.size % this.feed.settings.every === 0) {
          const unused=this.feed.notes.filter(n => !this.used.has(n.id));
          const note = this.feed.settings.roam ? unused[Math.floor(Math.random()*unused.length)] : unused[0];
          if (note) { this.used.add(note.id); this.assignments.set(id,note.id); }
        }
      }
    }
    const mounted = new Set<string>();
    for (const card of this.document.querySelectorAll<HTMLElement>('x-learning-card')) {
      const cell = card.closest('[data-testid="cellInnerDiv"]');
      const id = card.dataset.anchor!;
      const noteId = this.assignments.get(id);
      const note=this.feed.notes.find(n=>n.id===noteId);
      if (!cell || visible.get(cell) !== id || this.skipped.has(id) || !noteId || !note || this.versions.get(card)!==JSON.stringify([note,this.feed.pending?.filter(op=>op.noteId===noteId)]) || mounted.has(noteId)) card.remove();
      else mounted.add(noteId);
    }
    for (const [cell,id] of visible) {
      if (this.skipped.has(id)) continue;
      const note = this.feed.notes.find(n => n.id === this.assignments.get(id));
      if (!note || mounted.has(note.id)) continue;
      cell.append(this.card(id,note)); mounted.add(note.id);
    }
  }
  private card(anchor: string, note: Note) {
    const host = this.document.createElement('x-learning-card');
    host.dataset.anchor = anchor;
    this.versions.set(host,JSON.stringify([note,this.feed.pending?.filter(op=>op.noteId===note.id)]));
    host.style.display = 'block';
    const shadow = host.attachShadow({mode:'closed'});
    const style = this.document.createElement('style');
    style.textContent = `:host{display:block;color:inherit;color-scheme:light dark}*{box-sizing:border-box}section{font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:20px 16px;border-top:1px solid #8883;overflow-wrap:anywhere}small{font-size:11px;font-weight:600;letter-spacing:.3px;color:#9674dc}h2{font-size:18px;line-height:1.4;letter-spacing:-.25px;margin:8px 0 12px}button{font:500 12px/1.4 system-ui;border:1px solid #8883;border-radius:6px;background:transparent;color:inherit;padding:7px 11px;cursor:pointer}button:hover{background:#8881}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #9674dc;outline-offset:3px}.body{max-height:180px;overflow:hidden}.body.open{max-height:none}.body>:first-child{margin-top:0}.body h1,.body h2{font-size:17px}.body h3{font-size:15px}img{max-width:100%;height:auto;border-radius:6px}pre{font:12px/1.6 ui-monospace,monospace;overflow:auto;background:#8881;padding:12px;border:1px solid #8882;border-radius:6px}code{font-family:ui-monospace,monospace}table{display:block;overflow:auto}td,th{padding:5px;border:1px solid #8883}blockquote{border-left:3px solid #9674dc66;padding-left:12px;margin-left:0}a{color:#9270da}footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #8882}.review{background:#7452ce;color:#fff;border-color:#7452ce}.review:hover{background:#6745bd}.summary,.progress{font-size:12px;opacity:.75;margin:12px 0 0}.progress:empty{display:none}form{margin-top:12px;padding:12px;background:#8881;border:1px solid #8882;border-radius:8px}`;
    const section = this.document.createElement('section');
    section.setAttribute('aria-label','学习笔记');
    const label = this.document.createElement('small'); label.textContent = note.roam ? '笔记漫游 · Obsidian' : note.source ? '学习笔记 · Obsidian' : '学习笔记 · 导入副本';
    const title = this.document.createElement('h2'); title.textContent = note.title;
    const body = this.document.createElement('div'); body.className = 'body'; body.innerHTML = clean(note.html);
    const footer = this.document.createElement('footer');
    const toggle = this.document.createElement('button'); toggle.type = 'button';
    const applyExpanded = () => { const open = this.expanded.has(anchor); body.classList.toggle('open',open); toggle.textContent = open ? '收起' : '展开'; toggle.setAttribute('aria-expanded',String(open)); };
    applyExpanded();
    toggle.addEventListener('click', () => { this.expanded.has(anchor) ? this.expanded.delete(anchor) : this.expanded.add(anchor); applyExpanded(); });
    const skip = this.document.createElement('button'); skip.type = 'button'; skip.textContent = '跳过';
    skip.addEventListener('click', () => { this.skipped.add(anchor); host.remove(); });
    host.addEventListener('click',e => e.stopPropagation());
    host.addEventListener('keydown',e => e.stopPropagation());
    footer.append(toggle,skip);
    if(note.metadata && this.change){
      const metadata=note.metadata;
      const editing=this.drafts.get(note.id)??metadata;
      const summary=this.document.createElement('p');summary.className='summary';summary.textContent=`已复习 ${metadata.reviewCount} 次${metadata.lastReviewed ? ` · ${new Date(metadata.lastReviewed).toLocaleString()}` : ''}`;
      const progress=this.document.createElement('p');progress.className='progress';progress.setAttribute('role','status');
      const waiting=this.feed.pending?.filter(op=>op.noteId===note.id)??[];
      progress.textContent=waiting.length ? waiting.some(op=>op.status!=='pending')?'Obsidian 中的数据已变化，点扩展图标查看这次修改。':'已记在本地，将自动保存到 Obsidian。' : '';
      const review=this.document.createElement('button');review.type='button';review.className='review';review.textContent='已复习 +1';
      const edit=this.document.createElement('button');edit.type='button';edit.textContent='修改复习信息';
      const form=this.document.createElement('form');form.hidden=!this.drafts.has(note.id);
      const input=this.document.createElement('input');input.type='number';input.min='0';input.max=String(Number.MAX_SAFE_INTEGER);input.required=true;input.value=String(editing.reviewCount);
      const countLabel=this.document.createElement('label');countLabel.textContent='复习次数 ';countLabel.append(input);
      const time=this.document.createElement('input');time.type='datetime-local';
      if(editing.lastReviewed){const date=new Date(editing.lastReviewed);time.value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
      const initialTime=time.value;
      const timeLabel=this.document.createElement('label');timeLabel.textContent='最近复习时间（可清空） ';timeLabel.append(time);
      const remarks=this.document.createElement('textarea');remarks.maxLength=4000;remarks.value=editing.remarks;
      const remarksLabel=this.document.createElement('label');remarksLabel.textContent='复习备注 ';remarksLabel.append(remarks);
      const save=this.document.createElement('button');save.type='submit';save.textContent='保存';
      form.append(countLabel,timeLabel,remarksLabel,save);
      const submit=async(type:'review'|'metadata',value?:Metadata)=>{
        review.disabled=true;save.disabled=true;
        try{const response=await this.change!(type,note.id,value);progress.textContent=response.error??'已记录，正在自动保存…';if(!response.error){form.hidden=true;if(type==='metadata')this.drafts.delete(note.id);}}
        catch(error){progress.textContent=(error as Error).message;}
        finally{review.disabled=false;save.disabled=false;}
      };
      review.addEventListener('click',()=>{void submit('review');});
      edit.addEventListener('click',()=>{form.hidden=!form.hidden;});
      const draft=()=>({...editing,reviewCount:Number(input.value),lastReviewed:time.value===initialTime?editing.lastReviewed:time.value?new Date(time.value).toISOString():null,remarks:remarks.value});
      form.addEventListener('input',()=>{this.drafts.set(note.id,draft());});
      form.addEventListener('submit',event=>{event.preventDefault();void submit('metadata',draft());});
      footer.append(review,edit);section.append(summary,progress,form);
      style.textContent+='label{display:block;font-size:12px;margin:10px 0}input,textarea{display:block;width:100%;margin-top:5px;font:inherit;color:inherit;background:transparent;border:1px solid #8884;padding:7px;border-radius:5px}textarea{min-height:70px;resize:vertical}form[hidden]{display:none}';
    }
    section.prepend(label,title,body);section.append(footer);shadow.append(style,section);
    return host;
  }
}
