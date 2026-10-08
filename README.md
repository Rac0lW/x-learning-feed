# X Learning Feed

<p><img src="public/icon/128.png" width="64" height="64" alt="X Learning Feed 图标"></p>

**当前推荐：Obsidian 插件 + Chrome / Edge 扩展。** 插件随 Obsidian 启动，按 `#x-feed` 标签同步文章，接收 Chrome 中的复习次数、时间和备注。安装与使用见 [Obsidian 插件说明](docs/obsidian-plugin.md)。下面的 Node MCP 是保留的独立运行方式；插件启用时无需另行启动它。

一个本地学习笔记服务，以及一个 TypeScript / WXT / Manifest V3 扩展。MCP 导入和查询 Markdown / HTML，扩展把笔记缓存到 IndexedDB，在 x.com 首页每隔 10 条推文穿插一张学习卡片。可以设置间隔、展开、收起、复习和关闭。

无需 X API、真实发推、AI API Key 或云端账号。Obsidian 插件提供带令牌的 `127.0.0.1` 本机接口，支持读取文章和写回复习元数据；独立 MCP 使用 stdio 和本地 SQLite，扩展使用 IndexedDB。

## 构建与加载

需要 Node.js 22.13 或更新版本，建议使用当前维护的 Node LTS。

```sh
npm ci
npm run build
npm run check:extension
npm run build:extension
npm test
```

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
2. 启用开发者模式，选择“加载已解压的扩展程序”。
3. 加载本项目的 `.output/chrome-mv3` 文件夹。
4. 按 [插件说明](docs/obsidian-plugin.md) 安装并启用 Obsidian 插件，给文章加 `#x-feed`，或开启笔记漫游。
5. 打开或刷新 `https://x.com/home`，点击扩展图标，在当前页下拉面板的“连接设置”中填写令牌，向下浏览推文。

浏览器界面以 Obsidian 为文章来源，已移除手动文件导入。独立 MCP 仍可导入文件：每个文件作为一条笔记；按清理后的内容计算 ID，相同内容自动去重。单文件最多 2 MiB。支持标题、段落、列表、链接、表格、代码块和内嵌图片。代码块保留排版，未加入语法高亮。

图片仅接受 `data:image/png|jpeg|gif|webp;base64,...`。远程图片、相对路径图片、SVG、CSS 和其他外部资源会移除。需要图片时，请先将图片内嵌进 Markdown / HTML。这避免阅读卡片时向第三方发出请求。

## 接入 MCP 客户端

构建后，在支持 `mcpServers` 配置格式的本地 MCP 客户端中加入以下条目。其他客户端使用相同的命令和参数；将 `node` 换为本机 Node 的绝对路径，可以避免客户端找不到 Node。

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

启动后会生成 `.data/bridge-token`，权限为仅当前用户读写。将文件内的令牌填入扩展设置，点击“连接 Obsidian”。令牌只用于本机服务，不能填到 X 网站。扩展随后每 30 秒同步，设置开关在约 2 秒内反映到当前页面。

也可以在终端启动服务进行连接测试：

```sh
npm start -- --notes-dir ./notes --data-dir ./.data
```

stdio 模式需要保持标准输入打开。服务日志输出到 stderr，stdout 只传输 MCP 消息。同一个端口只能运行一个实例；若端口占用，停止旧实例或换端口，并同步修改扩展设置。

| 工具 | 用途 | 例子 |
| --- | --- | --- |
| `import_note` | 导入指定目录内的本地文件 | `{"path":"example.md"}` |
| `list_notes` | 搜索、分页列出标题和 ID | `{"query":"学习","limit":20}` |
| `get_note` | 读取一条清理后的笔记 | `{"id":"64 位内容 ID"}` |
| `next_note` | 取一条未读笔记；用尽或关闭后返回 null | `{"excludeIds":["已读或已跳过的 ID"]}` |
| `get_settings` | 查询开关与间隔 | `{}` |
| `set_settings` | 保存开关与间隔（1–100） | `{"every":10,"enabled":true}` |

可对 AI 说：“导入 example.md，并将学习间隔设为 10 条推文。”导入路径必须位于 `--notes-dir` 中；越界路径与指向目录外的符号链接会拒绝。

## 时间线行为

只处理 `/home` 的主栏推文。根据推文时间链接中的 status ID 去重，累计新遇到的推文，第 N 条后显示一张笔记。建议准备多条笔记：当前页面会话中每条只分配一次，用尽后停止；刷新页面开始新一轮。

卡片放在对应推文的 `cellInnerDiv` 末尾，使其跟随 X 的虚拟列表单元，并使用 Shadow DOM 隔离排版。MutationObserver 在下一帧合并处理变化，更新自身 DOM 时暂停观察。重绘后恢复原有分配，复用成另一条推文的节点会移除旧卡片。改变频率会重新计数，已经分配过的笔记仍保留为本轮已用。

扩展网页内面板和设置页可以修改开关和频率，修改后自动保存。点击“已复习 +1”后立即自动写回 Obsidian，无需手动同步；离线操作存入本地队列，恢复连接后自动重试。MCP 修改设置后，下一次同步覆盖为新的 MCP 设置；没有新的 MCP 设置时，本地修改保持生效。断开连接或停止 MCP 后，已同步笔记和本地设置继续可用。

脚本、事件属性、表单、嵌入页面、危险链接和自定义样式在导入与展示时过滤。读取到的笔记属于资料，MCP 工具说明要求 AI 不遵循资料中的操作指令。HTML 清理不能识别所有文字形式的提示词攻击，调用方仍须把笔记当作不可信数据。

## 验证与当前状态

`npm test` 同时构建 MCP 与扩展，检查本地持久化、导入限制、HTML 清理、真实 MCP stdio 调用、带令牌接口、构建后的后台同步、时间线去重、重绘、节点复用和构建后的 Content Script 交互。浏览器 DOM 检查使用 JSDOM，IndexedDB 检查使用 fake-indexeddb。

项目处于 MVP 阶段。自动化测试覆盖网页内面板交互与自动写回；真实 X 的页面结构和虚拟列表可能变化，需要按 [手动验收](docs/acceptance.md) 检查 Chrome / Edge 的视觉及滚动表现。

Obsidian 标签同步和元数据写回已实现；FSRS、Anki、语义推荐和跨设备同步暂不实现。笔记管理、清理、持久化与时间线处理分别在 `src/store.ts`、`lib/render.ts`、`lib/db.ts` 和 `lib/timeline.ts`，后续可在这些边界添加能力。

参考项目与许可证记录见 [研究记录](docs/references.md)。代码独立编写，没有复制参考项目实现。

## 笔记漫游

在 X 页内面板开启“笔记漫游”，从整个 Obsidian Markdown 笔记库随机选文，无需 `#x-feed` 标签。关闭后恢复标签模式。插入频率仍然生效，每轮不重复，刷新开始新一轮。浏览不会批量改写文章；点击复习时才写入必要的身份和复习属性。未记录复习的文章用路径生成临时身份，重命名后视为新文章。

开启漫游会把库内文章同步到浏览器本地缓存，仅通过本机接口传输。当前最多支持 10,000 篇笔记，单篇超过 2 MiB 会跳过，首次读取大型笔记库可能较慢。

## 开源与贡献

代码与原创图标采用 [MIT 许可证](LICENSE)，第三方依赖见 [许可证说明](THIRD_PARTY_NOTICES.md)。本项目与 X、Obsidian 没有官方关联。

提交修改前运行 `npm test`、`npm run check:extension` 和 `npm run check:plugin`。不要提交个人笔记、连接令牌、数据库或 `.env` 文件。本地数据和构建输出已排除。当前提供源码构建方式，未发布到浏览器商店或 Obsidian 插件市场。
