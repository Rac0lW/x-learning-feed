import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { indexedDB } from 'fake-indexeddb';

test('真实 MCP stdio 工具与令牌保护的扩展同步接口',async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'xlf-mcp-')); t.after(() => rm(dir,{recursive:true,force:true}));
  const root = path.join(dir,'notes'); await mkdir(root); await writeFile(path.join(root,'one.md'),'# 联调\n\n正文');
  const socket = createServer(); await new Promise(resolve => socket.listen(0,'127.0.0.1',resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const transport = new StdioClientTransport({command:process.execPath,args:['dist/server.js','--notes-dir',root,'--data-dir',path.join(dir,'data'),'--port',String(port)],stderr:'pipe'});
  const client = new Client({name:'test',version:'1.0'});
  await client.connect(transport); t.after(() => client.close());
  const tools = await client.listTools(); assert.equal(tools.tools.length,6);
  const call = async (name,args={}) => { const r = await client.callTool({name,arguments:args}); assert.ok(!r.isError,JSON.stringify(r)); return JSON.parse(r.content[0].text); };
  const imported = await call('import_note',{path:'one.md'});
  assert.equal((await call('list_notes')).total,1);
  assert.equal((await call('get_note',{id:imported.id})).title,'联调');
  assert.equal((await call('next_note')).id,imported.id);
  assert.equal(await call('next_note',{excludeIds:[imported.id]}),null);
  assert.ok((await client.callTool({name:'set_settings',arguments:{every:0}})).isError);
  assert.ok((await client.callTool({name:'import_note',arguments:{path:'../missing.md'}})).isError);
  await call('set_settings',{every:5,enabled:false});
  assert.equal(await call('next_note'),null);
  assert.equal((await call('get_settings')).every,5);
  const token = await readFile(path.join(dir,'data','bridge-token'),'utf8');
  const url = `http://127.0.0.1:${port}/feed`;
  assert.equal((await fetch(url)).status,403);
  assert.equal((await fetch(url,{headers:{Authorization:`Bearer ${token}`,Origin:'https://evil.example'}})).status,403);
  const feed = await (await fetch(url,{headers:{Authorization:`Bearer ${token}`}})).json();
  assert.equal(feed.notes[0].id,imported.id); assert.equal(feed.settings.every,5);
  // Run the built service worker against the real bridge, then read its IndexedDB via its message handler.
  let handler;
  const storage = {token,port};
  const chrome = {
    runtime:{id:'integration',getURL:p => `chrome-extension://integration${p}`,onMessage:{addListener:fn => {handler=fn;}}},
    action:{onClicked:{addListener:() => {}}}, alarms:{create:() => {},onAlarm:{addListener:() => {}}},
    storage:{local:{get:async keys => Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k => [k,storage[k]])),set:async data => Object.assign(storage,data)}},
  };
  runInNewContext(await readFile('.output/chrome-mv3/background.js','utf8'),{chrome,indexedDB,fetch,AbortSignal,console,crypto:webcrypto});
  const sender = {id:'integration',url:'chrome-extension://integration/options.html'};
  assert.ok((await handler({type:'sync'},sender)).ok);
  const mirrored = await handler({type:'feed'},{id:'integration',url:'https://x.com/home'});
  assert.equal(mirrored.notes[0].id,imported.id); assert.equal(mirrored.settings.every,5);
  assert.ok((await handler({type:'feed',version:mirrored.version},{id:'integration',url:'https://x.com/home'})).unchanged);
  assert.ok((await handler({type:'settings',settings:{every:1,enabled:true}},{id:'integration',url:'https://x.com/home'})).error);
  assert.ok((await handler({type:'settings',settings:{every:0,enabled:true}},sender)).error);
});
