# 参考项目研究记录

记录日期：2026-10-08。范围为仓库说明、公开目录和与实现相关的局部源码；没有进行全仓库代码审计，也没有复制其实现。下面的许可证名称依据仓库公开声明；未来需要复用代码时，应针对所复用文件及依赖重新核对。

| 项目 | 查看与借鉴的内容 | 仓库声明的许可证 | 本项目处理 |
| --- | --- | --- | --- |
| [Control Panel for Twitter](https://github.com/insin/control-panel-for-twitter) | `script.js` 的 `observeElement` 管理观察器生命周期，重新绑定前断开旧观察器；页面动态变化需重复发现节点 | MIT | 自行实现观察器合并、断开、恢复与卡片 ID 记账 |
| [Rekapu](https://github.com/powermodeon/rekapu) | README 的 IndexedDB、统一 Markdown 展示和隔离 CSS；其遮罩流程与本项目内联展示目标不同 | GPL-3.0 | 采用本地持久化与统一展示的思路，独立实现内联卡片 |
| [Carden](https://github.com/alyssaxuu/carden) | README 的上下文卡片管理、卡组与 SM2；自托管版有 MySQL 服务 | MIT | MVP 仅保存一文件一笔记，暂不采用学习评分或服务端账户 |
| [XClipper](https://github.com/zendegani/XClipper) | README 的 Markdown / HTML 导出、内联入口与本地图片归档 | PolyForm Noncommercial 1.0.0 | 仅参考内容与资源需分别处理的思路，没有使用代码 |
| [Decks](https://github.com/dscherdi/decks) | README 的结构化 Markdown 卡片、FSRS 与 Obsidian 壳层和核心引擎分离 | AGPL-3.0-or-later | 为存储与展示保留模块边界，暂不引入其核心或 FSRS |

XClipper 的仓库将自己描述为 source-available，并非 OSI 认可的开源许可证。它和 GPL / AGPL 项目的实现都没有成为本项目的代码依赖。

协议与平台实现依据 [MCP 文档](https://modelcontextprotocol.io/docs/develop/build-server)、已安装的 TypeScript SDK 1.x API、[WXT Content Scripts 文档](https://wxt.dev/guide/essentials/content-scripts.html) 与 [DOMPurify 文档](https://github.com/cure53/DOMPurify)。使用 npm 锁文件固定本次安装依赖。


## 弹窗视觉参考

参考 [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) 的紧凑弹窗、细分隔线、收起设置、浅色与深色主题，以及紫色主操作。阅读 `src/styles/popup.scss` 与 `_variables.scss` 后独立编写样式，没有复制项目图标、商标或代码。
