import type { Metadata, Note, Rating } from './types.js';

export const ratings: {value:Rating;label:string}[] = [{value:1,label:'重来'},{value:2,label:'困难'},{value:3,label:'良好'},{value:4,label:'简单'}];
export function noteWeight(note:Note,timeWeight=true,now=Date.now(),characters=0):number {
  const feedback=2**(note.feedback??0)/(1+characters/1000);
  if(!timeWeight)return feedback;
  const last=note.metadata?.lastReviewed;
  const days=last?Math.max(0,(now-Date.parse(last))/86400000):14;
  return feedback*Math.min(5,1+days/7);
}
export function reviewMetadata(current:Metadata,reviewedAt:string,rating?:Rating):Metadata {
  if(current.reviewCount===Number.MAX_SAFE_INTEGER)throw new Error('复习次数超出范围');
  const older=!!current.lastReviewed && Date.parse(reviewedAt)<Date.parse(current.lastReviewed);
  const next={...current,reviewCount:current.reviewCount+1,lastReviewed:older?current.lastReviewed:reviewedAt};
  if(rating!==undefined && !older){
    const interval=current.intervalDays??0;
    // ponytail: 使用固定间隔与倍率；需要基于记忆模型的个性化排程时再接入 FSRS。
    const days=rating===1?10/1440:Math.min(36500,rating===2?Math.max(1,Math.round(interval*1.2)):rating===3?Math.max(3,Math.round(interval*2)):Math.max(7,Math.round(interval*3)));
    return {...next,rating,intervalDays:days,nextReview:new Date(Date.parse(reviewedAt)+days*86400000).toISOString()};
  }
  return next;
}
