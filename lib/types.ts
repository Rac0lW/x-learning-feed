import type { Locale } from './i18n.js';
export type Rating = 1 | 2 | 3 | 4;
// learn: recall first, then grade; browse: read and move on.
export type Mode = 'learn' | 'browse';
export type Metadata = { reviewCount: number; lastReviewed: string | null; remarks: string; version: string; rating?:Rating|null; intervalDays?:number; nextReview?:string|null; mode?:Mode };
export type Note = { id: string; title: string; html: string; source?: string; path?: string; metadata?: Metadata; roam?:boolean; feedback?: -1 | 0 | 1; tags?:string[] };
export type Operation = {
  id: string; noteId: string; source: string; type: 'review' | 'metadata' | 'archive' | 'edit' | 'mode';
  reviewedAt?: string; expectedVersion?: string; markdown?:string;
  rating?:Rating; mode?:Mode;
  metadata?: Omit<Metadata,'version'>;
  roam?:boolean;
};
export type Pending = Operation & { status: 'pending' | 'conflict' | 'failed'; error?: string; sequence?:number };
export type Settings = { every: number; enabled: boolean; tags?:string[]; timeWeight?:boolean; mode?:Mode };
// shown: IDs of notes already pushed on X today, so a page refresh doesn't push them again.
export type Feed = { notes: Note[]; settings: Settings; pending?: Pending[]; locale?: Locale; shown?: string[] };
