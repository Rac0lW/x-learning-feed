import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import sanitize from 'sanitize-html';
import { render } from './render.js';
export { render } from './render.js';

export const MAX_BYTES = 2 * 1024 * 1024;
export type Note = { id: string; title: string; html: string };
export type Settings = { every: number; enabled: boolean; revision: number };

export class Store {
  db: DatabaseSync;
  constructor(public notesDir: string, dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(dataDir, 'notes.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, html TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), every INTEGER NOT NULL, enabled INTEGER NOT NULL, revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO settings VALUES (1,10,1,0);`);
  }
  async importFile(file: string): Promise<Note> {
    const root = await realpath(this.notesDir);
    const target = await realpath(path.resolve(root, file));
    const relative = path.relative(root, target);
    if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('文件必须位于 notes-dir 内');
    const ext = path.extname(target).toLowerCase();
    if (!['.md','.markdown','.html','.htm'].includes(ext)) throw new Error('只支持 Markdown / HTML');
    const handle = await open(target, 'r');
    let content: string;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('文件必须是普通文件，且不超过 2 MiB');
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length > MAX_BYTES) throw new Error('文件超过 2 MiB');
      content = buffer.subarray(0, length).toString('utf8');
    } finally { await handle.close(); }
    const html = render(content, ext === '.md' || ext === '.markdown' ? 'markdown' : 'html');
    if (!html.trim()) throw new Error('清理后没有可导入内容');
    const titleHtml = html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1];
    const note = { id: createHash('sha256').update(html).digest('hex'), title: titleHtml ? sanitize(titleHtml, { allowedTags: [], allowedAttributes: {} }).slice(0,200) : path.basename(target, ext), html };
    this.db.prepare('INSERT OR IGNORE INTO notes VALUES (?,?,?)').run(note.id, note.title, note.html);
    return note;
  }
  notes(): Note[] { return this.db.prepare('SELECT * FROM notes ORDER BY rowid').all() as Note[]; }
  settings(): Settings {
    const row = this.db.prepare('SELECT every,enabled,revision FROM settings WHERE id=1').get()!;
    return { every: Number(row.every), enabled: Boolean(row.enabled), revision: Number(row.revision) };
  }
  update(every?: number, enabled?: boolean): Settings {
    this.db.prepare('UPDATE settings SET every=COALESCE(?,every), enabled=COALESCE(?,enabled), revision=revision+1 WHERE id=1').run(every ?? null, enabled === undefined ? null : Number(enabled));
    return this.settings();
  }
}
