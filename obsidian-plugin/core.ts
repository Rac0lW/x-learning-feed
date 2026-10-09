import { getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';
import { createHash } from 'node:crypto';
import { marked } from 'marked';
import { z } from 'zod';
import type { Metadata, Operation } from '../lib/types';
import { reviewMetadata } from '../lib/review';
import { t, type Key, type Locale } from '../lib/i18n';

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({offset:true});
const rating=z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]);
const metadata = z.object({ reviewCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), lastReviewed: timestamp.nullable(), remarks:z.string().max(4000),rating:rating.nullable().optional(),intervalDays:z.number().min(0).max(36500).optional(),nextReview:timestamp.nullable().optional() }).strict();
export const openSchema=z.object({source:hex,noteId:hex,roam:z.boolean().optional()}).strict();
export const bodyVersion=(body:string)=>createHash('sha256').update(body).digest('hex');
export const operationSchema = z.discriminatedUnion('type',[
  z.object({id:z.string().uuid(),source:hex,noteId:hex,type:z.literal('review'),reviewedAt:timestamp,rating:rating.optional(),roam:z.boolean().optional()}).strict(),
  z.object({id:z.string().uuid(),source:hex,noteId:hex,type:z.literal('metadata'),expectedVersion:hex,metadata,roam:z.boolean().optional()}).strict(),
  z.object({id:z.string().uuid(),source:hex,noteId:hex,type:z.literal('edit'),expectedVersion:hex,markdown:z.string().max(2*1024*1024),roam:z.boolean().optional()}).strict(),
  z.object({id:z.string().uuid(),source:hex,noteId:hex,type:z.literal('archive'),roam:z.boolean().optional()}).strict(),
]);
// Errors carry a message key so each response can use the language the browser asked for.
export class BridgeError extends Error {
  constructor(public status:number,public key:Key,public params:Record<string,string|number>={}) {super(t(key,params));}
  translate(locale:Locale) {return t(this.key,this.params,locale);}
}
export function splitNote(content:string) {
  const info = getFrontMatterInfo(content);
  const frontmatter = info.exists ? parseYaml(info.frontmatter) ?? {} : {};
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) throw new BridgeError(422,'ob.badProperties');
  return {frontmatter:frontmatter as Record<string,unknown>,body:content.slice(info.contentStart)};
}
export function hasTag(content:string,tag:string) {
  const {frontmatter,body} = splitNote(content);
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : typeof frontmatter.tags === 'string' ? frontmatter.tags.split(/[\s,]+/) : [];
  if (tags.some(value => String(value).replace(/^#/,'') === tag)) return true;
  if(!body.includes(`#${tag}`))return false;
  let found = false;
  const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  marked.walkTokens(marked.lexer(body), token => {
    if (token.type === 'text' && new RegExp(`(^|[\\s(])#${escaped}(?![\\p{L}\\p{N}_/\\-])`,'u').test(token.text)) found = true;
  });
  return found;
}
export function readTags(content:string,candidates:string[]) {
  if(candidates.length)return [...new Set(candidates.map(tag=>tag.replace(/^#/,'')))].filter(tag=>hasTag(content,tag));
  const {frontmatter,body}=splitNote(content);
  const properties=Array.isArray(frontmatter.tags)?frontmatter.tags:typeof frontmatter.tags==='string'?frontmatter.tags.split(/[\s,]+/):[];
  const tags=new Set([...candidates,...properties.map(String)].map(tag=>tag.replace(/^#/,'')));
  let fenced=false;
  for(const line of body.split(/\r?\n/u)){
    if(/^\s*(```|~~~)/u.test(line)){fenced=!fenced;continue;}
    if(fenced)continue;
    for(const match of line.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)(?![\p{L}\p{N}_\/-])/gu))tags.add(match[1]);
  }
  return [...tags];
}
export function excluded(content:string){return content.includes('no-x-feed') && hasTag(content,'no-x-feed');}
export function eligible(content:string){return !excluded(content) && hasTag(content,'x-feed');}
export function readMetadata(fm:Record<string,unknown>):Metadata {
  const last = fm.xfeed_last_reviewed instanceof Date ? fm.xfeed_last_reviewed.toISOString() : fm.xfeed_last_reviewed ?? null;
  const due=fm.xfeed_next_review instanceof Date?fm.xfeed_next_review.toISOString():fm.xfeed_next_review;
  const parsed = metadata.safeParse({reviewCount:fm.xfeed_review_count ?? 0,lastReviewed:last,remarks:fm.xfeed_remarks ?? '',...(fm.xfeed_rating!==undefined?{rating:fm.xfeed_rating}:{}),...(fm.xfeed_interval_days!==undefined?{intervalDays:fm.xfeed_interval_days}:{}),...(due!==undefined?{nextReview:due}:{})});
  if(!parsed.success)throw new BridgeError(422,'ob.badMetadata');
  const value=parsed.data;
  return {...value,version:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
function withProperties(frontmatter:Record<string,unknown>,body:string) {
  return `---\n${stringifyYaml(frontmatter)}---\n${body}`;
}
export function ensureIdentity(content:string,id:string,roam=false) {
  if (!roam && !eligible(content)) return content;
  const {frontmatter,body} = splitNote(content);
  if (frontmatter.xfeed_id !== undefined) {
    if (!hex.safeParse(frontmatter.xfeed_id).success) throw new BridgeError(422,'ob.badId');
    return content;
  }
  frontmatter.xfeed_id = hex.parse(id);
  return withProperties(frontmatter,body);
}
export function applyOperation(content:string,operation:Operation) {
  const op = operationSchema.parse(operation);
  const {frontmatter,body} = splitNote(content);
  if (frontmatter.xfeed_id !== op.noteId) throw new BridgeError(409,'ob.identityChanged');
  const applied = frontmatter.xfeed_applied_ops ?? [];
  if (!Array.isArray(applied) || !applied.every(id => typeof id === 'string')) throw new BridgeError(422,'ob.badApplied');
  if (applied.includes(op.id)) return content;
  if(op.type==='archive'){
    const tags=Array.isArray(frontmatter.tags)?frontmatter.tags:typeof frontmatter.tags==='string'?frontmatter.tags.split(/[\s,]+/).filter(Boolean):frontmatter.tags==null?[]:null;
    if(!tags || !tags.every(tag=>typeof tag==='string'))throw new BridgeError(422,'ob.badTagsProp');
    frontmatter.tags=tags.some(tag=>tag.replace(/^#/,'')==='no-x-feed')?tags:[...tags,'no-x-feed'];
    frontmatter.xfeed_applied_ops=[...applied,op.id];
    return withProperties(frontmatter,body);
  }
  if(excluded(content))throw new BridgeError(409,'ob.archived');
  if (!op.roam && !eligible(content)) throw new BridgeError(409,'ob.noFeedTag');
  if(op.type==='edit'){
    if(body===op.markdown)return content;
    if(bodyVersion(body)!==op.expectedVersion)throw new BridgeError(409,'ob.bodyChanged');
    const next=content.slice(0,content.length-body.length)+op.markdown;
    if(Buffer.byteLength(next)>2*1024*1024)throw new BridgeError(413,'ob.noteTooLarge');
    return next;
  }
  const current = readMetadata(frontmatter);
  if (op.type === 'metadata' && op.expectedVersion !== current.version) throw new BridgeError(409,'ob.metadataChanged');
  let next;
  if (op.type === 'review') {
    if (current.reviewCount === Number.MAX_SAFE_INTEGER) throw new BridgeError(422,'review.overflow');
    if (Date.parse(op.reviewedAt) > Date.now()+60000) throw new BridgeError(422,'ob.futureReview');
    next = reviewMetadata(current,op.reviewedAt,op.rating);
  } else { next = {...current,...op.metadata}; }
  frontmatter.xfeed_review_count = next.reviewCount;
  frontmatter.xfeed_last_reviewed = next.lastReviewed;
  frontmatter.xfeed_remarks = next.remarks;
  if(next.rating!==undefined)frontmatter.xfeed_rating=next.rating;
  if(next.intervalDays!==undefined)frontmatter.xfeed_interval_days=next.intervalDays;
  if(next.nextReview!==undefined)frontmatter.xfeed_next_review=next.nextReview;
  // ponytail: 操作 ID 保存在属性区保证重试不重复；单篇超过 1000 次操作时迁移到独立日志。
  frontmatter.xfeed_applied_ops = [...applied,op.id];
  return withProperties(frontmatter,body);
}
