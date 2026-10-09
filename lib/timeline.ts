import { clean, render } from './render.js';
import type { Feed, Note, Rating, Metadata } from './types.js';
import { ratings, reviewMetadata, noteWeight } from './review.js';
import { t, setLocale, getLocale, formatDate } from './i18n.js';

export class Timeline {
  seen = new Set<string>();
  used = new Set<string>();
  assignments = new Map<string,string>();
  expanded = new Set<string>();
  private drafts=new Map<string,{markdown:string;version:string}>();
  private editing=new Set<string>();
  private lengths=new WeakMap<Note,number>();
  private weight(note:Note,timeWeight:boolean){
    let characters=this.lengths.get(note);
    if(characters===undefined){
      const template=this.document.createElement('template');template.innerHTML=note.html;
      characters=Array.from((template.content.textContent??'').replace(/\s/gu,'')).length;
      this.lengths.set(note,characters);
    }
    return noteWeight(note,timeWeight,Date.now(),characters);
  }
  private versions=new WeakMap<HTMLElement,string>();
  private shownToday=new Set<string>();
  feed: Feed = { notes:[], settings:{every:10,enabled:true} };
  constructor(private document: Document, private change?:(type:'review'|'archive'|'like'|'dislike'|'open'|'document'|'edit',noteId:string,rating?:Rating,edit?:{markdown:string;expectedVersion:string})=>Promise<{error?:string;feedback?:-1|0|1;metadata?:Metadata;markdown?:string;version?:string}>,private shown?:(noteId:string)=>void) {}
  clear() { this.document.querySelectorAll('x-learning-card').forEach(n => n.remove()); }
  update(feed: Feed) {
    const modeChanged=!!feed.settings.roam!==!!this.feed.settings.roam || JSON.stringify(feed.settings.tags)!==JSON.stringify(this.feed.settings.tags);
    if(modeChanged){this.used.clear();this.expanded.clear();}
    if(feed.locale)setLocale(feed.locale);
    if (feed.settings.every !== this.feed.settings.every || modeChanged || !this.feed.notes.length && feed.notes.length>0) {
      this.clear(); this.seen.clear(); this.assignments.clear();
    }
    this.feed = feed;
    this.shownToday=new Set(feed.shown);
  }
  reconcile() {
    if (this.document.location.pathname !== '/home' || !this.feed.settings.enabled) { this.clear(); return; }
    const primary = this.document.querySelector('[data-testid="primaryColumn"]');
    if (!primary) { this.clear(); return; }
    for(const [anchor,noteId] of this.assignments){
      const due=this.feed.notes.find(n=>n.id===noteId)?.metadata?.nextReview;
      if(due && Date.parse(due)>Date.now() && !this.editing.has(noteId)){this.assignments.delete(anchor);this.used.delete(noteId);}
    }
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
          const unused=this.feed.notes.filter(n => !this.used.has(n.id) && !this.shownToday.has(n.id) && (!n.metadata?.nextReview || Date.parse(n.metadata.nextReview)<=Date.now()));
          let note:Note|undefined;
          const timeWeight=this.feed.settings.timeWeight!==false;
          if(this.feed.settings.roam){
            let draw=Math.random()*unused.reduce((sum,n)=>sum+this.weight(n,timeWeight),0);
            note=unused.find(n=>{draw-=this.weight(n,timeWeight);return draw<0;});
          }else note=unused.sort((a,b)=>this.weight(b,timeWeight)-this.weight(a,timeWeight))[0];
          if (note) { this.used.add(note.id); this.assignments.set(id,note.id); this.shownToday.add(note.id); this.shown?.(note.id); }
        }
      }
    }
    const mounted = new Set<string>();
    for (const card of this.document.querySelectorAll<HTMLElement>('x-learning-card')) {
      const cell = card.closest('[data-testid="cellInnerDiv"]');
      const id = card.dataset.anchor!;
      const noteId = this.assignments.get(id);
      const note=this.feed.notes.find(n=>n.id===noteId);
      if (!cell || visible.get(cell) !== id || !noteId || !note || !this.editing.has(noteId) && this.versions.get(card)!==JSON.stringify([note,this.feed.pending?.filter(op=>op.noteId===noteId),getLocale()]) || mounted.has(noteId)) card.remove();
      else mounted.add(noteId);
    }
    for (const [cell,id] of visible) {
      const note = this.feed.notes.find(n => n.id === this.assignments.get(id));
      if (!note || mounted.has(note.id)) continue;
      cell.append(this.card(id,note)); mounted.add(note.id);
    }
  }
  private card(anchor: string, note: Note) {
    const host = this.document.createElement('x-learning-card');
    host.dataset.anchor = anchor;
    this.versions.set(host,JSON.stringify([note,this.feed.pending?.filter(op=>op.noteId===note.id),getLocale()]));
    host.style.display = 'block';
    const shadow = host.attachShadow({mode:'closed'});
    const style = this.document.createElement('style');
    style.textContent = `:host{display:block;color:inherit;color-scheme:light dark}*{box-sizing:border-box}section{font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:20px 16px;border-top:1px solid #8883;overflow-wrap:anywhere}small{font-size:11px;font-weight:600;letter-spacing:.3px;color:#9674dc}h2{font-size:18px;line-height:1.4;letter-spacing:-.25px;margin:8px 0 12px}button{font:500 12px/1.4 system-ui;border:1px solid #8883;border-radius:6px;background:transparent;color:inherit;padding:7px 11px;cursor:pointer}button:hover{background:#8881}button[aria-pressed=true]{background:#9674dc22;border-color:#9674dc;color:#9270da}button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:2px solid #9674dc;outline-offset:3px}.source{font-size:12px;line-height:1.6;opacity:.75;margin:8px 0 12px}.source ul{list-style:none;margin:0;padding:0}.source li>ul{margin-left:7px;padding-left:16px;border-left:1px solid #8883}.source li{padding:2px 0}.body{max-height:180px;overflow:hidden}.body.open{max-height:none}.body>:first-child{margin-top:0}.body h1,.body h2{font-size:17px}.body h3{font-size:15px}img{max-width:100%;height:auto;border-radius:6px}pre{font:12px/1.6 ui-monospace,monospace;overflow:auto;background:#8881;padding:12px;border:1px solid #8882;border-radius:6px}code{font-family:ui-monospace,monospace}table{display:block;overflow:auto}td,th{padding:5px;border:1px solid #8883}blockquote{border-left:3px solid #9674dc66;padding-left:12px;margin-left:0}a{color:#9270da}footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #8882}.familiarity{width:100%;display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.familiarity p{width:100%;margin:0 0 4px}.summary,.progress{font-size:12px;opacity:.75;margin:12px 0 0}.progress:empty{display:none}textarea{display:block;width:100%;min-height:260px;resize:vertical;padding:12px;font:13px/1.65 ui-monospace,monospace;color:inherit;background:transparent;border:1px solid #8886;border-radius:6px}textarea:focus-visible{outline:2px solid #9674dc}.editor-actions{display:flex;gap:8px;margin-top:8px}[hidden]{display:none!important}`;
    const section = this.document.createElement('section');
    section.setAttribute('aria-label',t('card.aria'));
    const label = this.document.createElement('small'); label.textContent = t(this.feed.settings.tags ? 'card.label.tags' : this.feed.settings.roam ? 'card.label.roam' : note.source ? 'card.label.note' : 'card.label.imported');
    const source=this.document.createElement('div');source.className='source';source.setAttribute('aria-label',t('card.source'));
    const parts=note.path?.split('/').filter(Boolean)??[];
    if(parts.length){
      source.title=note.path!;
      let parent:HTMLElement=source;
      for(const [index,part] of parts.entries()){
        const list=this.document.createElement('ul');const item=this.document.createElement('li');
        const name=this.document.createElement('span');name.textContent=part;
        const icon=this.document.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent=index===parts.length-1?'📄 ':'📁 ';
        item.append(icon,name);list.append(item);parent.append(list);parent=item;
      }
    }else source.textContent=t(note.source?'card.noPath':'card.importedNoPath');
    const title = this.document.createElement('h2'); title.textContent = note.title;
    const body = this.document.createElement('div'); body.className = 'body';
    const queued=this.feed.pending?.find(op=>op.noteId===note.id && op.type==='edit' && op.status==='pending');
    body.innerHTML = queued?.markdown!==undefined?render(queued.markdown,true):clean(note.html);
    const footer = this.document.createElement('footer');
    const toggle = this.document.createElement('button'); toggle.type = 'button';
    const applyExpanded = () => { const open = this.expanded.has(anchor); body.classList.toggle('open',open); toggle.textContent = t(open ? 'card.collapse' : 'card.expand'); toggle.setAttribute('aria-expanded',String(open)); };
    applyExpanded();
    toggle.addEventListener('click', () => { this.expanded.has(anchor) ? this.expanded.delete(anchor) : this.expanded.add(anchor); applyExpanded(); });
    host.addEventListener('click',e => e.stopPropagation());
    host.addEventListener('keydown',e => e.stopPropagation());
    footer.append(toggle);
    if(note.source && this.change){
      const open=this.document.createElement('button');open.type='button';open.textContent=t('card.open');open.title=t('card.open.title');
      const status=this.document.createElement('p');status.className='progress';status.setAttribute('role','status');
      open.addEventListener('click',async()=>{
        open.disabled=true;
        try{const response=await this.change!('open',note.id);status.textContent=response.error??t('card.opened');}
        catch(error){status.textContent=(error as Error).message;}
        finally{open.disabled=false;}
      });footer.append(open);section.append(status);
      const edit=this.document.createElement('button');edit.type='button';edit.textContent=t('card.edit');
      const editor=this.document.createElement('div');editor.hidden=true;
      const caption=this.document.createElement('p');caption.textContent=t('card.edit.caption');
      const input=this.document.createElement('textarea');input.setAttribute('aria-label',t('card.edit.aria'));
      const actions=this.document.createElement('div');actions.className='editor-actions';
      const save=this.document.createElement('button');save.type='button';save.textContent=t('card.edit.save');
      const cancel=this.document.createElement('button');cancel.type='button';cancel.textContent=t('card.edit.cancel');
      actions.append(save,cancel);editor.append(caption,input,actions);section.append(editor);footer.append(edit);
      const displayEditor=()=>{input.value=this.drafts.get(note.id)!.markdown;editor.hidden=false;body.hidden=true;footer.querySelectorAll('button').forEach(button=>button.disabled=true);this.editing.add(note.id);};
      input.addEventListener('input',()=>{this.drafts.get(note.id)!.markdown=input.value;});
      const closeEditor=()=>{this.editing.delete(note.id);this.drafts.delete(note.id);editor.hidden=true;body.hidden=false;footer.querySelectorAll('button').forEach(button=>button.disabled=false);this.reconcile();};
      edit.addEventListener('click',async()=>{
        edit.disabled=true;
        try{
          if(!this.drafts.has(note.id)){
            const response=await this.change!('document',note.id);
            if(response.error)throw new Error(response.error);
            if(typeof response.markdown!=='string' || !response.version)throw new Error(t('card.edit.unreadable'));
            this.drafts.set(note.id,{markdown:response.markdown,version:response.version});
          }
          displayEditor();input.focus();status.textContent='';
        }catch(error){status.textContent=(error as Error).message;edit.disabled=false;}
      });
      cancel.addEventListener('click',closeEditor);
      save.addEventListener('click',async()=>{
        save.disabled=true;cancel.disabled=true;
        try{
          const draft=this.drafts.get(note.id)!;
          const response=await this.change!('edit',note.id,undefined,{markdown:draft.markdown,expectedVersion:draft.version});
          if(response.error)throw new Error(response.error);
          body.innerHTML=render(draft.markdown,true);closeEditor();status.textContent=t('card.edit.saved');
        }catch(error){status.textContent=(error as Error).message;}
        finally{save.disabled=false;cancel.disabled=false;}
      });
      if(this.editing.has(note.id) && this.drafts.has(note.id))displayEditor();
    }
    if(this.change){
      const like=this.document.createElement('button');like.type='button';like.textContent=t('card.like');like.title=t('card.like.title');
      const dislike=this.document.createElement('button');dislike.type='button';dislike.textContent=t('card.dislike');dislike.title=t('card.dislike.title');
      const status=this.document.createElement('p');status.className='progress';status.setAttribute('role','status');
      const selected=()=>{like.setAttribute('aria-pressed',String(note.feedback===1));dislike.setAttribute('aria-pressed',String(note.feedback===-1));};
      selected();
      const vote=async(type:'like'|'dislike')=>{
        like.disabled=true;dislike.disabled=true;
        try{
          const response=await this.change!(type,note.id);
          if(response.error){status.textContent=response.error;return;}
          const value=type==='like'?1:-1;
          note.feedback=response.feedback??(note.feedback===value?0:value);selected();
          status.textContent=t(note.feedback===1?'card.liked':note.feedback===-1?'card.disliked':'card.unvoted');
        }catch(error){status.textContent=(error as Error).message;}
        finally{like.disabled=false;dislike.disabled=false;}
      };
      like.addEventListener('click',()=>{void vote('like');});dislike.addEventListener('click',()=>{void vote('dislike');});
      footer.append(like,dislike);section.append(status);
    }
    if(note.metadata && this.change){
      const metadata=note.metadata;
      const summary=this.document.createElement('p');summary.className='summary';summary.textContent=`${t('card.reviewed',{count:metadata.reviewCount})}${metadata.rating?` · ${ratings.find(r=>r.value===metadata.rating)?.label}`:''}${metadata.nextReview?` · ${t('card.next',{date:formatDate(metadata.nextReview)})}`:metadata.lastReviewed ? ` · ${formatDate(metadata.lastReviewed)}` : ''}`;
      const progress=this.document.createElement('p');progress.className='progress';progress.setAttribute('role','status');
      const waiting=this.feed.pending?.filter(op=>op.noteId===note.id)??[];
      progress.textContent=waiting.length ? t(waiting.some(op=>op.status!=='pending')?'card.conflict':'card.queued') : '';
      const archive=this.document.createElement('button');archive.type='button';archive.textContent=t('card.archive');archive.title=t('card.archive.title');
      const familiarity=this.document.createElement('div');familiarity.className='familiarity';familiarity.setAttribute('role','group');familiarity.setAttribute('aria-label',t('card.familiarity'));
      const caption=this.document.createElement('p');caption.className='summary';caption.textContent=t('card.familiarity.caption');familiarity.append(caption);
      const ratingButtons:HTMLButtonElement[]=[];
      const submit=async(type:'review'|'archive',rating?:Rating)=>{
        archive.disabled=true;ratingButtons.forEach(b=>b.disabled=true);
        try{
          const response=await this.change!(type,note.id,rating);progress.textContent=response.error??t('card.saving');
          if(type==='archive' && !response.error){this.assignments.delete(anchor);host.remove();}
          if(rating!==undefined && !response.error){
            note.metadata=response.metadata??reviewMetadata(note.metadata!,new Date().toISOString(),rating);
            this.used.delete(note.id);this.assignments.delete(anchor);host.remove();
          }
        }
        catch(error){progress.textContent=(error as Error).message;}
        finally{archive.disabled=false;ratingButtons.forEach(b=>b.disabled=false);}
      };
      for(const rating of ratings){
        const button=this.document.createElement('button');button.type='button';button.textContent=rating.label;
        button.title=t('card.nextReview',{date:formatDate(reviewMetadata(metadata,new Date().toISOString(),rating.value).nextReview!)});
        button.addEventListener('click',()=>{void submit('review',rating.value);});ratingButtons.push(button);familiarity.append(button);
      }
      archive.addEventListener('click',()=>{void submit('archive');});
      footer.append(archive,familiarity);section.append(summary,progress);
    }
    section.prepend(label,source,title,body);section.append(footer);shadow.append(style,section);
    return host;
  }
}
