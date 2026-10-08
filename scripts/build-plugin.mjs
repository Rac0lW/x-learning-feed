import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('.output/obsidian-plugin',{recursive:true});
await build({entryPoints:['obsidian-plugin/main.ts'],outfile:'.output/obsidian-plugin/main.js',bundle:true,platform:'node',format:'cjs',target:'es2022',external:['obsidian'],logLevel:'warning'});
await copyFile('obsidian-plugin/manifest.json','.output/obsidian-plugin/manifest.json');
