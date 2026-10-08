export type Metadata = { reviewCount: number; lastReviewed: string | null; remarks: string; version: string };
export type Note = { id: string; title: string; html: string; source?: string; path?: string; metadata?: Metadata; roam?:boolean };
export type Operation = {
  id: string; noteId: string; source: string; type: 'review' | 'metadata' | 'archive';
  reviewedAt?: string; expectedVersion?: string;
  metadata?: Omit<Metadata,'version'>;
  roam?:boolean;
};
export type Pending = Operation & { status: 'pending' | 'conflict' | 'failed'; error?: string; sequence?:number };
export type Settings = { every: number; enabled: boolean; roam?:boolean };
export type Feed = { notes: Note[]; settings: Settings; pending?: Pending[] };
