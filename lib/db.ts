import type { Note, Pending } from './types.js';
import { t } from './i18n.js';
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open('x-learning-feed',3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('notes')) request.result.createObjectStore('notes',{keyPath:'id'});
      if (!request.result.objectStoreNames.contains('feedback')) request.result.createObjectStore('feedback',{keyPath:'noteId'});
      if (!request.result.objectStoreNames.contains('outbox')) request.result.createObjectStore('outbox',{keyPath:'sequence',autoIncrement:true}).createIndex('id','id',{unique:true});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
export async function readFeedback(): Promise<{noteId:string; value:-1|0|1}[]> {
  const database=await db();
  return new Promise((resolve,reject)=>{const request=database.transaction('feedback').objectStore('feedback').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function saveFeedback(noteId:string,value:-1|0|1) {
  const database=await db();
  return new Promise<void>((resolve,reject)=>{const tx=database.transaction('feedback','readwrite');const store=tx.objectStore('feedback');if(value===0)store.delete(noteId);else store.put({noteId,value});tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});
}
export async function saveNotes(notes: Note[]) {
  const database = await db();
  return new Promise<void>((resolve,reject) => {
    const tx = database.transaction('notes','readwrite');
    notes.forEach(note => tx.objectStore('notes').put(note));
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export async function readNotes(): Promise<Note[]> {
  const database = await db();
  return new Promise((resolve,reject) => {
    const request = database.transaction('notes').objectStore('notes').getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function readState():Promise<{notes:Note[];pending:Pending[]}> {
  const database=await db();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(['notes','outbox']);
    const notes=tx.objectStore('notes').getAll();const outbox=tx.objectStore('outbox').getAll();
    tx.oncomplete=()=>resolve({notes:notes.result,pending:outbox.result});tx.onerror=tx.onabort=()=>reject(tx.error);
  });
}
export async function replaceSource(source:string,notes:Note[]) {
  const database=await db();
  return new Promise<boolean>((resolve,reject)=>{
    const tx=database.transaction('notes','readwrite');const store=tx.objectStore('notes');
    const request=store.getAll();let changed=false;
    request.onsuccess=()=>{
      const existing:Note[]=request.result;const ids=new Set(notes.map(n=>n.id));
      for(const note of existing)if(note.source===source && !ids.has(note.id)){store.delete(note.id);changed=true;}
      for(const note of notes){
        const old=existing.find(n=>n.id===note.id);
        if(old && old.source!==source){tx.abort();return;}
        if(JSON.stringify(old)!==JSON.stringify(note)){store.put(note);changed=true;}
      }
    };
    tx.oncomplete=()=>resolve(changed);tx.onerror=tx.onabort=()=>reject(tx.error??new Error(t('bg.idConflict')));
  });
}
export async function pending():Promise<Pending[]> {
  const database=await db();
  return new Promise((resolve,reject)=>{const req=database.transaction('outbox').objectStore('outbox').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function savePending(operation:Pending) {
  const database=await db();
  return new Promise<void>((resolve,reject)=>{const tx=database.transaction('outbox','readwrite');tx.objectStore('outbox').put(operation);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});
}
export async function acknowledge(id:string,note?:Note,removeNoteId?:string) {
  const database=await db();
  return new Promise<void>((resolve,reject)=>{const tx=database.transaction(['outbox','notes'],'readwrite');const store=tx.objectStore('outbox');const lookup=store.index('id').getKey(id);lookup.onsuccess=()=>{if(lookup.result!==undefined)store.delete(lookup.result);};if(removeNoteId)tx.objectStore('notes').delete(removeNoteId);if(note)tx.objectStore('notes').put(note);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});
}
