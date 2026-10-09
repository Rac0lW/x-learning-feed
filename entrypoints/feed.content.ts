import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { Timeline } from '../lib/timeline';
import { t } from '../lib/i18n';
import { matches } from '../lib/sites';
export default defineContentScript({
  matches,
  main(ctx) {
    const timeline = new Timeline(document,(type,noteId,rating,extra)=>browser.runtime.sendMessage({type,noteId,...extra,...(rating!==undefined?{rating}:{})}),noteId=>{void browser.runtime.sendMessage({type:'shown',noteId}).catch(()=>{});});
    let scheduled = false;
    let version: unknown;
    let panel: HTMLElement | undefined;
    let frame: HTMLIFrameElement | undefined;
    function closePanel(){panel?.remove();panel=undefined;frame=undefined;}
    function togglePanel(){
      if(panel){closePanel();return;}
      panel=document.createElement('x-learning-panel');
      panel.style.cssText='position:fixed;top:12px;right:12px;width:min(370px,calc(100vw - 24px));height:min(560px,calc(100dvh - 24px));z-index:2147483647;';
      const shadow=panel.attachShadow({mode:'closed'});
      const style=document.createElement('style');
      style.textContent=':host{color-scheme:light dark}iframe{display:block;width:100%;height:100%;border:1px solid light-dark(#0000001a,#ffffff1f);border-radius:16px;background:light-dark(#fff,#222126);box-sizing:border-box;box-shadow:0 2px 6px #0000001a,0 16px 48px #0000003d}button{position:absolute;right:12px;top:12px;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:light-dark(#746f7e,#aaa4b6);font:20px/1 system-ui;cursor:pointer}button:hover{background:#8882}button:focus-visible{outline:2px solid #7452ce}@media(prefers-reduced-motion:no-preference){iframe{animation:slide-in .18s cubic-bezier(.2,.8,.2,1)}@keyframes slide-in{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}}';
      frame=document.createElement('iframe');frame.src=browser.runtime.getURL('/panel.html');frame.title=t('panel.frame');
      const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',t('panel.close'));close.addEventListener('click',closePanel);
      shadow.append(style,frame,close);document.body.append(panel);
    }
    const onMessage=(message:{type?:string},sender:{id?:string})=>{
      if(sender.id!==browser.runtime.id || ctx.isInvalid)return;
      if(message.type==='toggle-panel')togglePanel();
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.addEventListener(document,'pointerdown',event=>{if(panel && !event.composedPath().includes(panel))closePanel();});
    ctx.addEventListener(document,'keydown',event=>{if(event.key==='Escape')closePanel();});
    ctx.addEventListener(window,'message',event=>{if(frame && event.source===frame.contentWindow && event.data==='x-learning-feed:close')closePanel();});
    const observer = new MutationObserver(schedule);
    function schedule() {
      if (scheduled || ctx.isInvalid) return;
      scheduled = true;
      ctx.requestAnimationFrame(() => {
        scheduled = false;
        observer.disconnect();
        try { timeline.reconcile(); }
        catch (error) { console.error('X Learning Feed:',error); }
        finally { if (ctx.isValid) observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href']}); }
      });
    }
    async function refresh() {
      try {
        const feed = await browser.runtime.sendMessage({type:'feed',version});
        if (ctx.isValid && !feed.error && !feed.unchanged) { version = feed.version; timeline.update(feed); schedule(); }
      } catch {
        // The extension can be disabled while this content script is still alive.
        observer.disconnect(); timeline.clear();closePanel();
      }
    }
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
    ctx.addEventListener(window,'wxt:locationchange',schedule);
    ctx.setInterval(refresh,2000);
    ctx.onInvalidated(() => { observer.disconnect(); timeline.clear();closePanel();browser.runtime.onMessage.removeListener(onMessage); });
    void refresh();
  },
});
