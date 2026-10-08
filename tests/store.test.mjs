import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, render, MAX_BYTES } from '../dist/store.js';

test('导入、去重、范围限制与重启持久化',async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'xlf-store-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const root = path.join(dir,'notes'); await mkdir(root);
  await writeFile(path.join(root,'one.md'),'# 标题\n\n正文\n\n```ts\nconst x = 1;\n```');
  await writeFile(path.join(dir,'secret.md'),'秘密');
  await symlink(path.join(dir,'secret.md'),path.join(root,'link.md'));
  await writeFile(path.join(root,'big.md'),'x'.repeat(MAX_BYTES+1));
  const store = new Store(root,path.join(dir,'data'));
  try {
    const note = await store.importFile('one.md');
    assert.equal(note.title,'标题'); assert.match(note.html,/<pre><code/);
    await store.importFile('one.md'); assert.equal(store.notes().length,1);
    await assert.rejects(store.importFile('../secret.md'),/notes-dir/);
    await assert.rejects(store.importFile('link.md'),/notes-dir/);
    await assert.rejects(store.importFile('big.md'),/2 MiB/);
    store.update(7,false);
  } finally { store.db.close(); }
  const reopened = new Store(root,path.join(dir,'data'));
  try { assert.equal(reopened.notes().length,1); assert.deepEqual(reopened.settings(),{every:7,enabled:false,revision:1}); }
  finally { reopened.db.close(); }
});

test('HTML 清理阻止脚本、事件、CSS、嵌入页、危险链接和外部图片',() => {
  const html = render('<script>alert(1)</script><p onclick="alert(2)" style="background:url(https://evil)">安全</p><iframe src="https://evil"></iframe><a href="javascript:alert(3)">链接</a><img src="https://evil/track"><svg onload="alert(4)"></svg><img src="data:image/svg+xml;base64,AAAA"><img src="data:image/png;base64,AAAA">','html');
  assert.doesNotMatch(html,/script|onclick|style=|iframe|javascript:|https:\/\/evil|<svg|image\/svg/);
  assert.match(html,/安全/); assert.match(html,/data:image\/png;base64,AAAA/);
});
