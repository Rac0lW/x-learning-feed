import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewMetadata, noteWeight } from '../.test-dist/review.js';

const metadata={reviewCount:0,lastReviewed:null,remarks:'保留备注',version:'a'.repeat(64)};
const now='2026-10-09T12:00:00.000Z';
test('四档熟悉度安排下次复习，后续间隔增长且有上限',()=>{
  for(const [rating,minutes] of [[1,10],[2,1440],[3,4320],[4,10080]]){
    const next=reviewMetadata(metadata,now,rating);
    assert.equal(Date.parse(next.nextReview)-Date.parse(now),minutes*60000);
    assert.equal(next.reviewCount,1);assert.equal(next.rating,rating);assert.equal(next.remarks,'保留备注');
  }
  const good=reviewMetadata({...metadata,intervalDays:10},now,3);assert.equal(good.intervalDays,20);
  assert.equal(reviewMetadata({...metadata,intervalDays:10},now,2).intervalDays,12);
  assert.equal(reviewMetadata({...metadata,intervalDays:36500},now,4).intervalDays,36500);
});
test('旧复习不覆盖新排程，普通复习保留熟悉度，次数溢出被拒绝',()=>{
  const current=reviewMetadata(metadata,now,4);
  const older=reviewMetadata(current,'2026-10-08T12:00:00.000Z',1);
  assert.equal(older.reviewCount,2);assert.equal(older.rating,4);assert.equal(older.nextReview,current.nextReview);assert.equal(older.lastReviewed,now);
  assert.equal(reviewMetadata(current,now).nextReview,current.nextReview);
  assert.throws(()=>reviewMetadata({...metadata,reviewCount:Number.MAX_SAFE_INTEGER},now,1),/超出范围/);
});
test('时间权重默认开启，久未复习更优先，设有上限并与点赞叠加',()=>{
  const time=Date.parse(now);const note={id:'a',title:'文章',html:'',metadata:{...metadata,lastReviewed:now}};
  assert.equal(noteWeight(note,undefined,time),1);
  const old={...note,metadata:{...metadata,lastReviewed:new Date(time-14*86400000).toISOString()}};
  assert.equal(noteWeight(old,undefined,time),3);assert.equal(noteWeight({...old,feedback:1},true,time),6);assert.equal(noteWeight({...old,feedback:-1},true,time),1.5);
  assert.equal(noteWeight({...note,metadata:{...metadata,lastReviewed:'2000-01-01T00:00:00.000Z'}},true,time),5);
  assert.equal(noteWeight({...note,metadata},true,time),3);
  assert.equal(noteWeight(old,false,time),1);assert.equal(noteWeight({...old,feedback:1},false,time),2);
  assert.equal(noteWeight({...note,metadata:{...metadata,lastReviewed:new Date(time+86400000).toISOString()}},true,time),1);
});


test('字数越多降权越重，与反馈和时间权重叠加，长文权重保持大于零',()=>{
  const time=Date.parse(now);const note={id:'a',title:'文章',html:'',metadata:{...metadata,lastReviewed:now}};
  assert.equal(noteWeight(note,false,time,0),1);
  assert.equal(noteWeight(note,false,time,1000),0.5);
  assert.equal(noteWeight(note,false,time,3000),0.25);
  assert.equal(noteWeight(note,false,time,9000),0.1);
  assert.equal(noteWeight({...note,feedback:1},false,time,1000),1);
  assert.equal(noteWeight({...note,feedback:-1},false,time,1000),0.25);
  assert.equal(noteWeight({...note,metadata},true,time,1000),1.5);
  assert.ok(noteWeight(note,false,time,2000000)>0);
});
