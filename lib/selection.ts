import type { Note, Settings } from './types.js';
// Tag choice and folder choice both read the whole vault; a note matches if it fits any chosen tag or lies inside any chosen folder.
export const selecting = (s?: Pick<Settings, 'tags' | 'folders'>) => s?.tags !== undefined || s?.folders !== undefined;
export const inFolder = (path: string | undefined, folder: string) => path !== undefined && (path.startsWith(folder + '/'));
export const matchesSelection = (note: Pick<Note, 'path' | 'tags'>, s?: Pick<Settings, 'tags' | 'folders'>) =>
  !!s?.tags?.some(tag => note.tags?.includes(tag)) || !!s?.folders?.some(folder => inFolder(note.path, folder));
export const validFolder = (folder: unknown) => typeof folder === 'string' && folder.length > 0 && folder.length <= 4096 && folder.split('/').every(part => part !== '' && part !== '.' && part !== '..');
