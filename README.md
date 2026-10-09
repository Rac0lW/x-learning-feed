# X Learning Feed

English | [简体中文](README.zh-CN.md)

<p><img src="public/icon/128.png" width="64" height="64" alt="X Learning Feed icon"></p>

Read and review your Obsidian notes while scrolling the X home timeline. A desktop Obsidian plugin serves notes through a local connection, and a Chrome / Edge extension inserts a learning card after every 10 tweets by default.

Cards show the source folder tree and support likes, dislikes, review counts, four familiarity grades, archiving, opening the original note in Obsidian, and editing Markdown directly in the timeline. Choose your own tags or browse the whole vault. Time and article length affect which notes appear next.

The Obsidian plugin and browser extension are the recommended setup. No X API, posting, AI API key, or cloud account is required. An optional standalone Node MCP service is also included.

## Installation

The current version is **0.9.1**. Build from source and install manually. You need desktop Obsidian, Chrome or Edge, and Node.js 22.13 or newer. The browser extension and the Obsidian plugin are available in English and Chinese. By default they follow the browser and Obsidian language; you can switch under Language in the extension panel and in the plugin settings. The steps below also give the Chinese labels.

### 1. Download and build

```sh
git clone https://github.com/Rac0lW/x-learning-feed.git
cd x-learning-feed
npm ci
npm run build:plugin
npm run build:extension
```

### 2. Install the Obsidian plugin

Create `.obsidian/plugins/x-learning-feed/` inside your vault, then copy these two files:

| Built file | Destination inside the vault |
| --- | --- |
| `.output/obsidian-plugin/main.js` | `.obsidian/plugins/x-learning-feed/main.js` |
| `.output/obsidian-plugin/manifest.json` | `.obsidian/plugins/x-learning-feed/manifest.json` |

Reload Obsidian and enable X Learning Feed under **Settings → Community plugins**. Open **Settings → X Learning Feed**, confirm the status is running (`运行中`), and copy the connection token. The plugin supports desktop Obsidian only.

### 3. Install the browser extension

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode** and choose **Load unpacked**.
3. Select the project's `.output/chrome-mv3` directory. Keep this directory in place because the browser loads the extension from it.

### 4. Connect and start reading

1. Add `#x-feed` to an Obsidian note, or add `x-feed` to its `tags` property.
2. Open or refresh `https://x.com/home` and click the X Learning Feed toolbar icon.
3. In the top-right panel, open Connection settings (`连接设置`), paste the token, keep port `43127`, and click Connect to Obsidian (`连接 Obsidian`).
4. Scroll through tweets. The panel lets you change the interval or select tags.

Run Obsidian and the browser on the same computer. The first sync of a large vault can take time. Cached notes remain available when Obsidian is closed; saved reviews and edits retry when the connection returns.

### Updating

```sh
git pull --ff-only
npm ci
npm run build:plugin
npm run build:extension
```

Back up the installed plugin's `main.js` and `manifest.json`, then replace them with the newly built files. Keep `data.json`, which contains connection settings. Reload the Obsidian plugin, click **Reload** on the browser's extension management page, and refresh existing X tabs. Uninstalling the extension or clearing its data can discard unsynced operations.

The [Obsidian plugin guide](docs/obsidian-plugin.md) contains additional setup and property details in Chinese.

## Language

The extension panel has a **Language** option (Match browser, 中文, English). It changes the panel, the cards on X, and the errors that the Obsidian plugin returns to the browser. The Obsidian plugin has its own **Language** setting (Match Obsidian, 中文, English) for its settings page and notices. Other languages fall back to English.

## Choosing notes

The default mode uses notes tagged `#x-feed`. Custom tag selection (`标签自选`) accepts tags separated by commas or spaces, such as `#learning, gamedev, learning/code`. Notes matching any selected tag are eligible. Both property tags and inline tags match exactly, including nested tags. Text inside code blocks does not count as a tag.

Custom tag selection reads the whole vault and filters locally in the browser, so it caches vault articles on this computer. The limit is 10,000 notes, and notes larger than 2 MiB are skipped. Vault roaming (`笔记漫游`) was removed in 0.10.0.

Browsing custom-tag notes does not add properties in bulk. A review, archive, or saved edit adds the identity needed for writeback. Until then, unmarked notes use an identity derived from their path, so renaming one gives it a new identity. Cards show folders and the filename in a source tree at the top.

`#no-x-feed` excludes a note in every mode. Archive (`归档`) adds `no-x-feed` to the original note's `tags` property and immediately removes the card. Existing tags, body text, and review counts are preserved. Offline archives are queued locally. Remove the exclusion tag in Obsidian to make the note eligible again.

## Reviews and weights

The familiarity buttons live in X cards. Their results are saved as Obsidian properties:

| Grade | Chinese button | First interval | Later intervals |
| --- | --- | --- | --- |
| Again | 重来 | 10 minutes | Reset to 10 minutes |
| Hard | 困难 | 1 day | Previous interval × 1.2, rounded, at least 1 day |
| Good | 良好 | 3 days | Previous interval × 2, rounded, at least 3 days |
| Easy | 简单 | 7 days | Previous interval × 3, rounded, at least 7 days |

Intervals are capped at 36,500 days. This is a simplified spaced repetition schedule, not Anki's full scheduler or FSRS. Choosing a grade records one review, removes the card, and postpones the note until it is due. Expanding a card does not count as a review. A note pushed into the X feed is not pushed again until the next day, even after a page refresh or a mode change; the browser keeps this record locally and resets it at local midnight. Offline grades affect local selection immediately and sync later.

Three weights multiply together:

| Factor | Weight |
| --- | --- |
| Feedback | Like: 2; neutral: 1; dislike: 0.5 |
| Time, enabled by default | `min(5, 1 + days since last review / 7)`; unreviewed notes: 3 |
| Length, always enabled | `1 / (1 + non-whitespace body characters / 1000)` |

Length counts Unicode characters in the displayed body, excluding whitespace, HTML markup, and image data. A 1,000-character article gets a length multiplier of ½; a 3,000-character article gets ¼. Longer articles retain a positive weight. Turning off Time weight (`时间权重`) keeps feedback and length weighting active.

Notes with higher combined weights are shown first. Feedback affects future assignments, while existing cards keep their positions. Click the same Like (`点赞`) or Dislike (`点踩`) button again to cancel. Feedback stays in this browser and is preserved across note syncs; it is not written to Obsidian or shared across browsers. Notes that are not yet due are excluded regardless of weight.

## Opening, editing, and syncing

Open in Obsidian (`在 Obsidian 中打开`) opens the original file in source mode and activates the desktop window. Inline edit (`现场编辑`) loads the original Markdown body. Use Save and sync (`保存并同步`) to queue the edit, or Cancel (`取消`) to leave it unsaved. Body edits preserve note properties. Unsaved drafts are not written to the vault.

Saved offline drafts persist in the browser and sync automatically. If the Obsidian body changed after it was loaded, the plugin rejects the stale edit and keeps the browser draft. Open the toolbar panel and copy the draft, then discard the conflicting operation. Reopen Inline edit to load the latest body and apply your changes. Reviews use operation IDs to avoid double counting after lost responses.

The extension receives Obsidian changes and retries saved operations about every 30 seconds. Opening the panel also checks the connection. Card state updates about every 2 seconds. Body edits and renames made in Obsidian arrive on the next sync.

## Timeline and local data

Only the main column of `/home` is processed. Tweet status IDs prevent duplicate counting. Each note is assigned once per page session; reload to start another session. Graded notes can appear again after their due time. Cards follow X's virtual list cells and use Shadow DOM to isolate layout.

The plugin listens on `127.0.0.1`, requires a token, and rejects ordinary website origins. Notes and queued operations are cached in IndexedDB. Custom tags can cache the eligible vault locally. Review metadata is saved in the original notes; connection settings stay in the plugin's `data.json`.

Cards support headings, paragraphs, lists, links, tables, code blocks, and embedded PNG / JPEG / GIF / WebP images. Only `data:image/...;base64,...` images are retained. Remote images, relative image paths, SVG, scripts, event handlers, embedded pages, and custom styles are removed. Code blocks retain formatting without syntax highlighting; math has no dedicated renderer.

## Optional standalone MCP service

The Node MCP service imports and queries Markdown / HTML using local SQLite. Each file becomes a note, with duplicate content deduplicated. The browser panel has no manual file import controls. Obsidian writeback actions require the plugin.

Build the service with `npm run build`, then add this entry to a local MCP client that supports `mcpServers`:

```json
{
  "mcpServers": {
    "x-learning-feed": {
      "command": "node",
      "args": [
        "/absolute/path/x-learning-feed/dist/server.js",
        "--notes-dir", "/absolute/path/x-learning-feed/notes",
        "--data-dir", "/absolute/path/x-learning-feed/.data",
        "--port", "43127"
      ]
    }
  }
}
```

Use absolute paths for your installation. The service creates `.data/bridge-token`; paste its contents into the extension's connection settings. Keep standard input open when running the stdio service. Logs go to stderr, and stdout carries MCP messages. Stop the Obsidian plugin before using the same port for the MCP service.

| Tool | Purpose |
| --- | --- |
| `import_note` | Import a file inside `--notes-dir`, for example `{"path":"example.md"}` |
| `list_notes` | Search and paginate note titles and IDs |
| `get_note` | Read a sanitized note by ID |
| `next_note` | Get a note not included in `excludeIds` |
| `get_settings` | Read the enabled state and tweet interval |
| `set_settings` | Set the enabled state and interval from 1 to 100 |

Imports reject paths and symlinks outside `--notes-dir`; files are limited to 2 MiB. MCP notes are untrusted data, including instructions inside their text. HTML sanitization does not detect every textual prompt injection.

## Development and verification

```sh
npm ci
npm run check:extension
npm run check:plugin
npm test
```

Tests build the service, plugin, and extension and exercise persistence, import boundaries, sanitization, MCP stdio, authenticated HTTP, sync queues, conflicts, review scheduling, weights, panel interactions, and timeline redraws. Browser DOM tests use JSDOM and fake-indexeddb. Real X layout and scrolling need manual checks because its page structure can change; see the [acceptance guide](docs/acceptance.md) in Chinese.

This project is an MVP. FSRS, semantic recommendations, and cross-device feedback sync are not included. Core modules are `src/store.ts`, `lib/render.ts`, `lib/db.ts`, and `lib/timeline.ts`. Research references are recorded in [docs/references.md](docs/references.md).

## License and contributions

Code and the original icon are [MIT licensed](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md). The project is not affiliated with X or Obsidian. Installation is currently from source; it is not listed in browser or Obsidian plugin stores.

Run the checks above before contributing. Keep personal notes, tokens, databases, `.env` files, and local build output out of commits.
