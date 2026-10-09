import { clean, render } from './render.js';
import type { Feed, Note, Rating, Metadata, Mode } from './types.js';
import { ratings, reviewMetadata, noteWeight } from './review.js';
import { t, setLocale, getLocale, formatDate } from './i18n.js';
import { siteFor } from './sites.js';

export class Timeline {
  seen = new Set<string>();
  used = new Set<string>();
  assignments = new Map<string,string>();
  expanded = new Set<string>();
  private drafts=new Map<string,{markdown:string;version:string}>();
  private editing=new Set<string>();
  // Notes switched to learning on this page stay until graded, even if an older schedule says they aren't due.
  private switched=new Set<string>();
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
  // A card is redrawn when its note, its queued writes, the language or the default mode changes.
  private key(note:Note){return JSON.stringify([note,this.feed.pending?.filter(op=>op.noteId===note.id),getLocale(),this.feed.settings.mode]);}
  // A note's own xfeed_mode wins over the panel default. Only notes that can write back to Obsidian have a mode.
  private mode(note:Note):Mode|undefined{return note.metadata && this.change ? note.metadata.mode ?? this.feed.settings.mode ?? 'browse' : undefined;}
  // Browsing has no schedule, so only learning notes wait for their review date.
  private waiting(note:Note){const due=note.metadata?.nextReview;return this.mode(note)!=='browse' && !!due && Date.parse(due)>Date.now();}
  private shownToday=new Set<string>();
  feed: Feed = { notes:[], settings:{every:10,enabled:true} };
  constructor(private document: Document, private change?:(type:'review'|'archive'|'like'|'dislike'|'open'|'document'|'edit'|'mode',noteId:string,rating?:Rating,extra?:{markdown:string;expectedVersion:string}|{mode:Mode})=>Promise<{error?:string;feedback?:-1|0|1;metadata?:Metadata;markdown?:string;version?:string}>,private shown?:(noteId:string)=>void) {}
  clear() { this.document.querySelectorAll('x-learning-card').forEach(n => n.remove()); }
  update(feed: Feed) {
    const modeChanged=JSON.stringify(feed.settings.tags)!==JSON.stringify(this.feed.settings.tags);
    if(modeChanged){this.used.clear();this.expanded.clear();}
    if(feed.locale)setLocale(feed.locale);
    if (feed.settings.every !== this.feed.settings.every || modeChanged || !this.feed.notes.length && feed.notes.length>0) {
      this.clear(); this.seen.clear(); this.assignments.clear();
    }
    this.feed = feed;
    this.shownToday=new Set(feed.shown);
  }
  reconcile() {
    const site=siteFor(this.document.location.href);
    if (!site?.active(this.document.location) || !this.feed.settings.enabled) { this.clear(); return; }
    const visible = site.items(this.document);
    if (!visible) { this.clear(); return; }
    for(const [anchor,noteId] of this.assignments){
      const note=this.feed.notes.find(n=>n.id===noteId);
      if(note && this.waiting(note) && !this.editing.has(noteId) && !this.switched.has(noteId)){this.assignments.delete(anchor);this.used.delete(noteId);}
    }
    for (const id of visible.values()) {
      if (!this.seen.has(id)) {
        this.seen.add(id);
        if (this.seen.size % this.feed.settings.every === 0) {
          const unused=this.feed.notes.filter(n => !this.used.has(n.id) && !this.shownToday.has(n.id) && !this.waiting(n));
          const timeWeight=this.feed.settings.timeWeight!==false;
          const note=unused.sort((a,b)=>this.weight(b,timeWeight)-this.weight(a,timeWeight))[0];
          if (note) { this.used.add(note.id); this.assignments.set(id,note.id); this.shownToday.add(note.id); this.shown?.(note.id); }
        }
      }
    }
    const mounted = new Set<string>();
    for (const card of this.document.querySelectorAll<HTMLElement>('x-learning-card')) {
      const cell = site.itemOf(card);
      const id = card.dataset.anchor!;
      const noteId = this.assignments.get(id);
      const note=this.feed.notes.find(n=>n.id===noteId);
      if (!cell || visible.get(cell) !== id || !noteId || !note || !this.editing.has(noteId) && this.versions.get(card)!==this.key(note) || mounted.has(noteId)) card.remove();
      else mounted.add(noteId);
    }
    for (const [cell,id] of visible) {
      const note = this.feed.notes.find(n => n.id === this.assignments.get(id));
      if (!note || mounted.has(note.id)) continue;
      site.mount(cell,this.card(id,note)); mounted.add(note.id);
    }
  }
  private card(anchor: string, note: Note) {
    const host = this.document.createElement('x-learning-card');
    host.dataset.anchor = anchor;
    this.versions.set(host,this.key(note));
    host.style.display = 'block';
    const shadow = host.attachShadow({mode:'closed'});
    const style = this.document.createElement('style');
    style.textContent = `:host{display:block;color:inherit;color-scheme:light dark;--accent:#8b5cf6;--accent-text:light-dark(#6d3fd8,#b9a1fb);--line:#8883;--soft:#8881}*{box-sizing:border-box}
section{font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:12px 16px;padding:16px 18px 14px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 8%,transparent),transparent 55%);overflow-wrap:anywhere;position:relative}
small{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.3px;color:var(--accent-text);background:color-mix(in srgb,var(--accent) 10%,transparent);padding:3px 9px 3px 8px;border-radius:999px}small:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 20%,transparent)}
section[data-mode=browse]{--accent:#14b8a6;--accent-text:light-dark(#0f766e,#5eead4)}
h2{font-size:19px;line-height:1.35;letter-spacing:-.3px;margin:6px 0 12px;font-weight:700}
.source{font-size:12px;line-height:1.6;opacity:.7;margin:10px 0 2px}.source ul,.source li{display:inline;margin:0;padding:0;list-style:none}.source li>ul:before{content:"›";margin:0 6px;opacity:.6}
.body{max-height:200px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent)}.body.open{max-height:none;-webkit-mask-image:none;mask-image:none}.body>:first-child{margin-top:0}.body h1,.body h2{font-size:17px}.body h3{font-size:15px}
img{max-width:100%;height:auto;border-radius:10px}pre{font:12px/1.6 ui-monospace,monospace;overflow:auto;background:var(--soft);padding:12px;border:1px solid #8882;border-radius:10px}code{font-family:ui-monospace,monospace;font-size:.9em}:not(pre)>code{background:var(--soft);padding:1px 5px;border-radius:5px}
table{display:block;overflow:auto;border-collapse:collapse}td,th{padding:6px 8px;border:1px solid var(--line)}blockquote{border-left:3px solid #8b5cf680;padding:2px 0 2px 12px;margin-left:0;opacity:.85}a{color:var(--accent-text);text-decoration:none}a:hover{text-decoration:underline}hr{border:0;border-top:1px solid var(--line)}
button{font:500 12.5px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;border:1px solid var(--line);border-radius:999px;background:transparent;color:inherit;padding:6px 13px;cursor:pointer;transition:background .15s,border-color .15s,color .15s}button:hover{background:var(--soft);border-color:#8885}button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button[aria-pressed=true]{background:color-mix(in srgb,var(--accent) 14%,transparent);border-color:var(--accent);color:var(--accent-text)}button[aria-expanded]{border-color:transparent;background:var(--soft)}button.archive{margin-left:auto}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}button.primary:hover{background:var(--accent);filter:brightness(1.08)}button.to-learn{color:light-dark(#6d3fd8,#b9a1fb);border-color:#8b5cf666}button.to-learn:hover{background:#8b5cf61a;border-color:#8b5cf6}
.recall{display:grid;justify-items:center;gap:10px;padding:22px 16px;border:1px dashed color-mix(in srgb,var(--accent) 40%,transparent);border-radius:12px;background:color-mix(in srgb,var(--accent) 5%,transparent);text-align:center}.recall p{margin:0;opacity:.75}.recall button{padding:7px 18px}
footer{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid #8882}
.familiarity{order:-1;width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}.familiarity p{grid-column:1/-1;margin:0 0 2px}
.familiarity button{--tone:#8b5cf6;border-radius:10px;padding:7px 6px 6px;font-weight:600;line-height:1.3;color:var(--tone);border-color:color-mix(in srgb,var(--tone) 35%,transparent);background:color-mix(in srgb,var(--tone) 8%,transparent)}.familiarity button:hover{background:color-mix(in srgb,var(--tone) 18%,transparent);border-color:var(--tone)}
.familiarity button[data-when]:after{content:attr(data-when);display:block;font-size:11px;font-weight:500;opacity:.75}.familiarity [data-rating="1"]{--tone:light-dark(#d13b3b,#f27a7a)}.familiarity [data-rating="2"]{--tone:light-dark(#c26a00,#f2a64a)}.familiarity [data-rating="3"]{--tone:light-dark(#1f8a4c,#5fd08e)}.familiarity [data-rating="4"]{--tone:light-dark(#2563eb,#7aa7ff)}
.summary,.progress{font-size:12px;opacity:.7;margin:10px 0 0}.progress{color:var(--accent-text);opacity:1}.progress:empty{display:none}
textarea{display:block;width:100%;min-height:260px;resize:vertical;padding:12px;font:13px/1.65 ui-monospace,monospace;color:inherit;background:var(--soft);border:1px solid var(--line);border-radius:10px}textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}.editor-actions{display:flex;gap:8px;margin-top:8px}.editor-actions button:first-child{background:var(--accent);border-color:var(--accent);color:#fff}
@media(max-width:500px){section{margin:10px 12px;padding:14px}.familiarity{grid-template-columns:repeat(2,1fr)}}
[hidden]{display:none!important}`;
    const section = this.document.createElement('section');
    section.setAttribute('aria-label',t('card.aria'));
    const label = this.document.createElement('small'); label.textContent = t(this.feed.settings.tags ? 'card.label.tags' : note.source ? 'card.label.note' : 'card.label.imported');
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
    const mode=this.mode(note);
    if(mode){
      section.dataset.mode=mode;
      const tag=this.feed.settings.tags?.find(tag=>note.tags?.includes(tag));
      label.textContent=`${t(`card.mode.${mode}`)} · ${tag?`#${tag}`:'Obsidian'}`;
    }
    const footer = this.document.createElement('footer');
    // Secondary actions are collected here and follow each mode's main buttons.
    const more=this.document.createElement('div');
    const toggle = this.document.createElement('button'); toggle.type = 'button';
    // Learning cards hide the body until you choose to see it, so you try to recall it first.
    const recall=this.document.createElement('div');recall.className='recall';
    const recallText=this.document.createElement('p');recallText.textContent=t('card.recall');
    const reveal=this.document.createElement('button');reveal.type='button';reveal.className='primary';reveal.textContent=t('card.reveal');
    recall.append(recallText,reveal);
    const familiarity=this.document.createElement('div');familiarity.className='familiarity';
    const applyExpanded = () => {
      const open = this.expanded.has(anchor);
      body.classList.toggle('open',open); toggle.textContent = t(open ? 'card.collapse' : 'card.expand'); toggle.setAttribute('aria-expanded',String(open));
      if(mode==='learn'){recall.hidden=open || this.editing.has(note.id);body.hidden=!open || this.editing.has(note.id);familiarity.hidden=!open;}
    };
    toggle.addEventListener('click', () => { this.expanded.has(anchor) ? this.expanded.delete(anchor) : this.expanded.add(anchor); applyExpanded(); });
    reveal.addEventListener('click',()=>{this.expanded.add(anchor);applyExpanded();});
    host.addEventListener('click',e => e.stopPropagation());
    host.addEventListener('keydown',e => e.stopPropagation());
    if(mode!=='learn')footer.append(toggle);
    if(note.source && this.change){
      const open=this.document.createElement('button');open.type='button';open.textContent=t('card.open');open.title=t('card.open.title');
      const status=this.document.createElement('p');status.className='progress';status.setAttribute('role','status');
      open.addEventListener('click',async()=>{
        open.disabled=true;
        try{const response=await this.change!('open',note.id);status.textContent=response.error??t('card.opened');}
        catch(error){status.textContent=(error as Error).message;}
        finally{open.disabled=false;}
      });more.append(open);section.append(status);
      const edit=this.document.createElement('button');edit.type='button';edit.textContent=t('card.edit');
      const editor=this.document.createElement('div');editor.hidden=true;
      const caption=this.document.createElement('p');caption.textContent=t('card.edit.caption');
      const input=this.document.createElement('textarea');input.setAttribute('aria-label',t('card.edit.aria'));
      const actions=this.document.createElement('div');actions.className='editor-actions';
      const save=this.document.createElement('button');save.type='button';save.textContent=t('card.edit.save');
      const cancel=this.document.createElement('button');cancel.type='button';cancel.textContent=t('card.edit.cancel');
      actions.append(save,cancel);editor.append(caption,input,actions);section.append(editor);more.append(edit);
      const displayEditor=()=>{input.value=this.drafts.get(note.id)!.markdown;editor.hidden=false;body.hidden=true;recall.hidden=true;footer.querySelectorAll('button').forEach(button=>button.disabled=true);this.editing.add(note.id);};
      input.addEventListener('input',()=>{this.drafts.get(note.id)!.markdown=input.value;});
      const closeEditor=()=>{this.editing.delete(note.id);this.drafts.delete(note.id);editor.hidden=true;body.hidden=false;applyExpanded();footer.querySelectorAll('button').forEach(button=>button.disabled=false);this.reconcile();};
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
    if(note.metadata && this.change){
      const metadata=note.metadata;
      const summary=this.document.createElement('p');summary.className='summary';summary.textContent=`${t('card.reviewed',{count:metadata.reviewCount})}${mode==='learn' && metadata.rating?` · ${ratings.find(r=>r.value===metadata.rating)?.label}`:''}${mode==='learn' && metadata.nextReview?` · ${t('card.next',{date:formatDate(metadata.nextReview)})}`:metadata.lastReviewed ? ` · ${formatDate(metadata.lastReviewed)}` : ''}`;
      const progress=this.document.createElement('p');progress.className='progress';progress.setAttribute('role','status');
      const waiting=this.feed.pending?.filter(op=>op.noteId===note.id)??[];
      progress.textContent=waiting.length ? t(waiting.some(op=>op.status!=='pending')?'card.conflict':'card.queued') : '';
      const archive=this.document.createElement('button');archive.type='button';archive.className='archive';archive.textContent=t('card.archive');archive.title=t('card.archive.title');
      familiarity.setAttribute('role','group');familiarity.setAttribute('aria-label',t('card.familiarity'));
      const caption=this.document.createElement('p');caption.className='summary';caption.textContent=t('card.familiarity.caption');familiarity.append(caption);
      const actions:HTMLButtonElement[]=[archive];
      const submit=async(type:'review'|'archive'|'mode',rating?:Rating,target?:Mode)=>{
        actions.forEach(b=>b.disabled=true);
        try{
          const response=await this.change!(type,note.id,rating,target?{mode:target}:undefined);progress.textContent=response.error??t('card.saving');
          if(response.error)return;
          if(type==='archive'){this.assignments.delete(anchor);host.remove();}
          else if(type==='mode'){
            note.metadata={...note.metadata!,...response.metadata,mode:target};
            // You were already reading it, so a note switched to learning opens ready to grade.
            if(target==='learn'){this.expanded.add(anchor);this.switched.add(note.id);}
            host.replaceWith(this.card(anchor,note));
          }
          else{
            note.metadata=response.metadata??reviewMetadata(note.metadata!,new Date().toISOString(),rating);
            this.used.delete(note.id);this.assignments.delete(anchor);host.remove();
          }
        }
        catch(error){progress.textContent=(error as Error).message;}
        finally{actions.forEach(b=>b.disabled=false);}
      };
      if(mode==='learn'){
        for(const rating of ratings){
          const button=this.document.createElement('button');button.type='button';button.textContent=rating.label;button.dataset.rating=String(rating.value);
          const next=reviewMetadata(metadata,new Date().toISOString(),rating.value);
          button.dataset.when=next.intervalDays!<1?t('card.in.minutes',{count:Math.round(next.intervalDays!*1440)}):t('card.in.days',{count:next.intervalDays!});
          button.title=t('card.nextReview',{date:formatDate(next.nextReview!)});
          button.addEventListener('click',()=>{void submit('review',rating.value);});actions.push(button);familiarity.append(button);
        }
        const toBrowse=this.document.createElement('button');toBrowse.type='button';toBrowse.className='to-browse';toBrowse.textContent=t('card.toBrowse');toBrowse.title=t('card.toBrowse.title');
        toBrowse.addEventListener('click',()=>{void submit('mode',undefined,'browse');});actions.push(toBrowse);
        footer.append(familiarity);more.append(toBrowse);
      }else{
        const seen=this.document.createElement('button');seen.type='button';seen.className='primary';seen.textContent=t('card.seen');seen.title=t('card.seen.title');
        const learn=this.document.createElement('button');learn.type='button';learn.className='to-learn';learn.textContent=t('card.learn');learn.title=t('card.learn.title');
        seen.addEventListener('click',()=>{void submit('review');});learn.addEventListener('click',()=>{void submit('mode',undefined,'learn');});
        actions.push(seen,learn);footer.append(seen,learn);
      }
      archive.addEventListener('click',()=>{void submit('archive');});
      more.append(archive);section.append(summary,progress);
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
      // Likes steer how often a browsed note returns, so browsing shows them next to Seen.
      const before=more.querySelector('.to-browse');
      if(!mode || mode==='browse')footer.append(like,dislike);else if(before)before.before(like,dislike);else more.append(like,dislike);
      section.append(status);
    }
    footer.append(...more.children);
    applyExpanded();
    section.prepend(label,source,title,...(mode==='learn'?[recall]:[]),body);section.append(footer);shadow.append(style,section);
    return host;
  }
}
