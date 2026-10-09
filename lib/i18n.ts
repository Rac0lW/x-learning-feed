export type Locale = 'zh' | 'en';
export type LocalePreference = Locale | 'auto';

const zh = {
  // Card on X
  'card.aria':'学习笔记','card.label.tags':'标签自选 · Obsidian','card.label.roam':'笔记漫游 · Obsidian','card.label.note':'学习笔记 · Obsidian','card.label.imported':'学习笔记 · 导入副本',
  'card.source':'文章来源','card.noPath':'未提供文件路径','card.importedNoPath':'导入副本 · 未提供原始路径',
  'card.expand':'展开','card.collapse':'收起','card.open':'在 Obsidian 中打开','card.open.title':'打开原文编辑，修改后自动同步到浏览器','card.opened':'已在 Obsidian 中打开，编辑后会自动同步。',
  'card.edit':'现场编辑','card.edit.caption':'编辑 Markdown 正文 · 保存后自动同步到 Obsidian','card.edit.aria':'编辑 Markdown 正文','card.edit.save':'保存并同步','card.edit.cancel':'取消',
  'card.edit.unreadable':'无法读取原始正文，请更新 Obsidian 插件','card.edit.saved':'草稿已保存在本地，将自动同步到 Obsidian。',
  'card.like':'点赞','card.like.title':'提高展示优先级；再次点击取消','card.dislike':'点踩','card.dislike.title':'降低展示优先级；再次点击取消',
  'card.liked':'已点赞，会更优先出现。','card.disliked':'已点踩，会降低展示优先级。','card.unvoted':'已取消反馈，恢复默认权重。',
  'card.reviewed':'已复习 {count} 次','card.next':'下次 {date}','card.conflict':'Obsidian 中的数据已变化，点扩展图标查看这次修改。','card.queued':'已记在本地，将自动保存到 Obsidian。',
  'card.archive':'归档','card.archive.title':'添加 #no-x-feed，在所有模式中排除这篇文章','card.familiarity':'熟悉度','card.familiarity.caption':'熟悉度 · 选择后自动复习，并安排下次推送',
  'card.saving':'已记录，正在自动保存…','card.nextReview':'下次复习：{date}',
  'rating.1':'重来','rating.2':'困难','rating.3':'良好','rating.4':'简单',
  // Panel
  'panel.frame':'X Learning Feed 学习设置','panel.close':'收起学习设置','panel.tagline':'把浏览时间，留一点给学习。','panel.language':'语言','panel.language.auto':'跟随浏览器',
  'panel.enabled':'在 X 首页显示笔记','panel.every':'插入频率','panel.every.before':'每','panel.every.after':'条推文','panel.every.aria':'每隔多少条推文插入笔记',
  'panel.timeWeight':'时间权重','panel.timeWeight.hint':'默认开启，越久没复习的文章越优先，与点赞权重叠加。未到复习时间的文章暂不推送。',
  'panel.roam':'笔记漫游','panel.roam.hint':'开启后随机浏览整个笔记库。','panel.tagMode':'标签自选','panel.tags':'推送标签','panel.tags.placeholder':'学习, 游戏开发',
  'panel.tags.hint':'多个标签用逗号或空格分隔，命中任意一个即可。支持中文和层级标签，如 学习/编程。关闭标签自选和漫游后，只读 #x-feed 文章；#no-x-feed 始终排除。',
  'panel.fromObsidian':'来自 Obsidian','panel.select.tags':'推送带 {tags} 中任意一个标签的文章。','panel.select.roam':'从整个笔记库随机选文。','panel.select.default':'给文章加 #x-feed，它就会出现在信息流中。','panel.tagSeparator':'、',
  'panel.count':'{count} 篇','panel.due':'待到期','panel.reviewCount':'复习 {count} 次','panel.empty.roam':'正在读取笔记库，暂时没有可漫游的文章。','panel.empty':'还没有文章。连接 Obsidian 后，给一篇笔记加上标签试试。',
  'panel.issues':'有修改尚未保存','panel.issues.hint':'Obsidian 中的数据有变化。你的修改保留在下面，可以查看后按最新数据重新编辑。','panel.removed':'已移除的文章','panel.unwritable':'这次修改无法写回',
  'panel.draft':'你的修改：{count} 次；时间 {time}；备注 {remarks}','panel.none':'无','panel.discardDraft':'放弃草稿，保留 Obsidian 当前数据','panel.keep':'保留 Obsidian 当前数据','panel.kept':'已保留 Obsidian 中的数据。需要调整时，请在 Obsidian 中修改属性。','panel.draftAria':'保留的正文草稿',
  'panel.notConnected':'尚未连接 Obsidian','panel.offline':'Obsidian 暂未连接','panel.offline.waiting':' · {count} 条记录已存本地','panel.offline.local':' · 使用本地笔记','panel.autosaving':'正在自动保存…','panel.connected':'已连接 · 修改自动保存','panel.connecting':'正在连接 Obsidian…',
  'panel.loading':'正在读取…','panel.saveHint':'选择熟悉度即自动保存。Obsidian 关闭时先记在本地，打开后自动写回。','panel.connection':'连接设置','panel.port':'端口','panel.token':'连接令牌','panel.token.hint':'在 Obsidian → 设置 → X Learning Feed 中复制令牌。',
  'panel.connect':'连接 Obsidian','panel.disconnect':'断开','panel.settingsSaved':'设置已保存。','panel.connectingShort':'正在连接…','panel.connectedDone':'已连接。以后会自动保存，无需手动同步。','panel.disconnected':'已断开，笔记与未保存的修改仍留在本地。',
  // Background
  'bg.connectFirst':'请先连接 Obsidian 插件','bg.syncFailed':'同步失败 ({status}) {reason}','bg.needTags':'标签自选需要新版 Obsidian 插件，请更新插件后重试','bg.needRoam':'笔记漫游需要新版 Obsidian 插件，请更新插件后重试','bg.needScheduling':'熟悉度排程需要新版 Obsidian 插件，请更新插件后重试',
  'bg.invalidNotes':'无效笔记数据','bg.invalidSource':'无效 Obsidian 来源','bg.vaultChanged':'笔记库已变化，请在扩展设置重新连接','bg.discardOld':'笔记库已变化，请放弃旧操作','bg.writeUnavailable':'Obsidian 暂时无法写回','bg.writeRejected':'写回被拒绝',
  'bg.badArchive':'归档响应格式错误','bg.badWrite':'写回响应格式错误','bg.invalidMcp':'无效 MCP 设置','bg.badOrigin':'无效操作来源','bg.noNote':'笔记不存在','bg.noWriteback':'这篇笔记不支持 Obsidian 元数据写回',
  'bg.needOpen':'打开原文需要新版 Obsidian 插件，请更新插件','bg.cannotOpen':'无法打开 Obsidian 原文','bg.badDocument':'正文响应格式错误','bg.badOpen':'打开原文响应格式错误','bg.badRating':'熟悉度必须是重来、困难、良好或简单',
  'bg.badEdit':'正文或版本格式错误，正文最多 2 MiB','bg.editPending':'上次正文修改尚未保存，请先在扩展设置中处理保留的草稿','bg.badMetadata':'复习次数、时间或备注格式错误','bg.metadataPending':'上次修改还未写回，请稍候；若 Obsidian 已关闭，打开后会自动保存',
  'bg.openX':'请打开或刷新 X 页面，再点此处展开学习设置','bg.settingsOnly':'只允许设置页面修改数据','bg.discardOnly':'只可放弃已冲突或失败的操作','bg.invalidSettings':'无效设置','bg.badTimeWeight':'时间权重开关格式错误',
  'bg.badTags':'请填写 1–20 个标签，使用文字、数字、下划线、短横线或斜杠；标签自选与漫游不能同时开启','bg.badLocale':'无效语言','bg.idConflict':'笔记 ID 与另一来源冲突','bg.unknown':'未知消息',
  // Shared
  'review.overflow':'复习次数超出范围',
  // Obsidian plugin
  'ob.badConfig':'X Learning Feed 插件设置格式错误','ob.notStarted':'未启动','ob.running':'运行中 · 127.0.0.1:{port}','ob.stopped':'已停止',
  'ob.tooLarge':'带标签文章超过 2 MiB：{name}','ob.duplicateId':'两篇笔记的 xfeed_id 相同：{name}','ob.duplicateIdFix':'两篇笔记的 xfeed_id 相同：{name}。请删除副本的 xfeed_id 后重试。','ob.badIdIn':'xfeed_id 格式错误：{name}',
  'ob.forbidden':'连接令牌或请求来源错误','ob.notFound':'接口不存在','ob.jsonOnly':'必须发送 JSON','ob.tooBig':'元数据请求过大','ob.badJson':'JSON 格式错误','ob.badOpen':'打开笔记请求格式错误','ob.vaultChanged':'连接的笔记库已变化',
  'ob.removed':'文章已移除或删除，请重新同步','ob.badWrite':'写回请求格式错误','ob.vaultChangedReconnect':'连接的笔记库已变化，请重新连接','ob.untagged':'文章已移除标签或删除，请放弃这条待同步操作','ob.failed':'同步失败，请检查 Obsidian 笔记属性或插件日志',
  'ob.status':'状态：{state}','ob.intro':'给笔记添加 #x-feed 后进入信息流，或在 Chrome 开启笔记漫游随机浏览整个库。Chrome 可记录复习次数、时间和备注。','ob.language':'语言','ob.language.desc':'设置页、提示和返回给浏览器的错误信息使用此语言。','ob.language.auto':'跟随 Obsidian',
  'ob.token':'连接令牌','ob.token.desc':'将令牌复制到 Chrome 扩展设置。仅用于本机连接。','ob.copyToken':'复制令牌','ob.copy':'复制','ob.copied':'连接令牌已复制','ob.port':'端口：{port}。若启动失败且端口占用，请停止旧版 Node 服务。','ob.retry':'重试启动','ob.start':'启动',
  'ob.badProperties':'笔记属性格式错误','ob.badMetadata':'复习次数、时间或备注格式错误，请在 Obsidian 属性区修正','ob.badId':'xfeed_id 格式错误','ob.identityChanged':'笔记身份已经变化，请重新同步','ob.badApplied':'复习操作记录格式错误',
  'ob.badTagsProp':'笔记 tags 属性格式错误，无法归档','ob.archived':'文章已归档，不再写入复习记录','ob.noFeedTag':'文章已移除 #x-feed，请放弃这条待同步操作','ob.bodyChanged':'正文已在 Obsidian 中修改，草稿已保留，请按最新正文重新编辑',
  'ob.noteTooLarge':'文章超过 2 MiB，无法保存','ob.metadataChanged':'元数据已在另一端修改，请重新读取后编辑','ob.futureReview':'复习时间超前，请检查电脑时间',
};
export type Key = keyof typeof zh;
const en: Record<Key,string> = {
  'card.aria':'Learning note','card.label.tags':'Selected tags · Obsidian','card.label.roam':'Note roaming · Obsidian','card.label.note':'Learning note · Obsidian','card.label.imported':'Learning note · Imported copy',
  'card.source':'Note source','card.noPath':'No file path','card.importedNoPath':'Imported copy · No original path',
  'card.expand':'Expand','card.collapse':'Collapse','card.open':'Open in Obsidian','card.open.title':'Edit the original note; changes sync back to the browser','card.opened':'Opened in Obsidian. Your edits will sync automatically.',
  'card.edit':'Edit here','card.edit.caption':'Edit the Markdown body · Saving syncs it to Obsidian','card.edit.aria':'Edit the Markdown body','card.edit.save':'Save and sync','card.edit.cancel':'Cancel',
  'card.edit.unreadable':'Cannot read the original body. Update the Obsidian plugin.','card.edit.saved':'Draft saved locally. It will sync to Obsidian automatically.',
  'card.like':'Like','card.like.title':'Show this note more often; click again to undo','card.dislike':'Dislike','card.dislike.title':'Show this note less often; click again to undo',
  'card.liked':'Liked. This note will appear more often.','card.disliked':'Disliked. This note will appear less often.','card.unvoted':'Feedback removed. Default weight restored.',
  'card.reviewed':'Reviewed {count} {count|time|times}','card.next':'next {date}','card.conflict':'The data in Obsidian changed. Click the extension icon to review this change.','card.queued':'Saved locally. It will be written to Obsidian automatically.',
  'card.archive':'Archive','card.archive.title':'Add #no-x-feed to exclude this note from every mode','card.familiarity':'Familiarity','card.familiarity.caption':'Familiarity · Choosing one records a review and schedules the next one',
  'card.saving':'Recorded. Saving automatically…','card.nextReview':'Next review: {date}',
  'rating.1':'Again','rating.2':'Hard','rating.3':'Good','rating.4':'Easy',
  'panel.frame':'X Learning Feed settings','panel.close':'Close settings','panel.tagline':'Spend a little of your scrolling time learning.','panel.language':'Language','panel.language.auto':'Match browser',
  'panel.enabled':'Show notes on X Home','panel.every':'Frequency','panel.every.before':'Every','panel.every.after':'posts','panel.every.aria':'Insert a note after this many posts',
  'panel.timeWeight':'Time weight','panel.timeWeight.hint':'On by default. Notes you haven’t reviewed for longer come first, combined with likes. Notes not yet due are held back.',
  'panel.roam':'Note roaming','panel.roam.hint':'Browse random notes from the whole vault.','panel.tagMode':'Choose tags','panel.tags':'Tags','panel.tags.placeholder':'learning, gamedev',
  'panel.tags.hint':'Separate tags with commas or spaces; a note matching any of them is shown. Nested tags such as learning/coding work. With tag choice and roaming off, only #x-feed notes are shown; #no-x-feed is always excluded.',
  'panel.fromObsidian':'From Obsidian','panel.select.tags':'Showing notes tagged with any of {tags}.','panel.select.roam':'Picking random notes from the whole vault.','panel.select.default':'Add #x-feed to a note to show it in your feed.','panel.tagSeparator':', ',
  'panel.count':'{count} {count|note|notes}','panel.due':'Not due','panel.reviewCount':'Reviewed {count}×','panel.empty.roam':'Reading the vault. No notes to roam yet.','panel.empty':'No notes yet. Connect Obsidian, then tag a note to try it.',
  'panel.issues':'Unsaved changes','panel.issues.hint':'The data in Obsidian changed. Your change is kept below so you can redo it against the latest data.','panel.removed':'Removed note','panel.unwritable':'This change could not be written back',
  'panel.draft':'Your change: {count} reviews; time {time}; remarks {remarks}','panel.none':'none','panel.discardDraft':'Discard draft and keep Obsidian’s data','panel.keep':'Keep Obsidian’s data','panel.kept':'Kept the data in Obsidian. To adjust it, edit the note properties in Obsidian.','panel.draftAria':'Kept body draft',
  'panel.notConnected':'Not connected to Obsidian','panel.offline':'Obsidian is offline','panel.offline.waiting':' · {count} {count|change|changes} saved locally','panel.offline.local':' · Using local notes','panel.autosaving':'Saving automatically…','panel.connected':'Connected · Changes save automatically','panel.connecting':'Connecting to Obsidian…',
  'panel.loading':'Loading…','panel.saveHint':'Choosing a familiarity saves automatically. If Obsidian is closed, changes are kept locally and written back when it opens.','panel.connection':'Connection','panel.port':'Port','panel.token':'Token','panel.token.hint':'Copy the token from Obsidian → Settings → X Learning Feed.',
  'panel.connect':'Connect Obsidian','panel.disconnect':'Disconnect','panel.settingsSaved':'Settings saved.','panel.connectingShort':'Connecting…','panel.connectedDone':'Connected. Changes now save automatically; no manual sync needed.','panel.disconnected':'Disconnected. Notes and unsaved changes stay in this browser.',
  'bg.connectFirst':'Connect the Obsidian plugin first','bg.syncFailed':'Sync failed ({status}) {reason}','bg.needTags':'Choosing tags needs a newer Obsidian plugin. Update it and try again.','bg.needRoam':'Note roaming needs a newer Obsidian plugin. Update it and try again.','bg.needScheduling':'Familiarity scheduling needs a newer Obsidian plugin. Update it and try again.',
  'bg.invalidNotes':'Invalid note data','bg.invalidSource':'Invalid Obsidian source','bg.vaultChanged':'The vault changed. Reconnect in the extension settings.','bg.discardOld':'The vault changed. Discard this old change.','bg.writeUnavailable':'Obsidian can’t write back right now','bg.writeRejected':'Write-back rejected',
  'bg.badArchive':'Invalid archive response','bg.badWrite':'Invalid write-back response','bg.invalidMcp':'Invalid MCP settings','bg.badOrigin':'Invalid request origin','bg.noNote':'Note not found','bg.noWriteback':'This note doesn’t support writing back to Obsidian',
  'bg.needOpen':'Opening notes needs a newer Obsidian plugin. Update it.','bg.cannotOpen':'Cannot open the note in Obsidian','bg.badDocument':'Invalid note body response','bg.badOpen':'Invalid open response','bg.badRating':'Familiarity must be Again, Hard, Good or Easy',
  'bg.badEdit':'Invalid body or version; the body is limited to 2 MiB','bg.editPending':'The previous body edit isn’t saved yet. Resolve the kept draft in the extension settings first.','bg.badMetadata':'Invalid review count, time or remarks','bg.metadataPending':'The previous change isn’t written back yet. Please wait; if Obsidian is closed, it saves when Obsidian opens.',
  'bg.openX':'Open or reload X, then click here to show the settings','bg.settingsOnly':'Only the settings page can change data','bg.discardOnly':'Only conflicted or failed changes can be discarded','bg.invalidSettings':'Invalid settings','bg.badTimeWeight':'Invalid time weight setting',
  'bg.badTags':'Enter 1–20 tags using letters, digits, underscores, hyphens or slashes; tag choice and roaming can’t both be on','bg.badLocale':'Invalid language','bg.idConflict':'Note ID conflicts with another source','bg.unknown':'Unknown message',
  'review.overflow':'Review count out of range',
  'ob.badConfig':'Invalid X Learning Feed plugin settings','ob.notStarted':'Not started','ob.running':'Running · 127.0.0.1:{port}','ob.stopped':'Stopped',
  'ob.tooLarge':'Tagged note is larger than 2 MiB: {name}','ob.duplicateId':'Two notes share the same xfeed_id: {name}','ob.duplicateIdFix':'Two notes share the same xfeed_id: {name}. Delete the xfeed_id from the copy and try again.','ob.badIdIn':'Invalid xfeed_id: {name}',
  'ob.forbidden':'Wrong token or request origin','ob.notFound':'Endpoint not found','ob.jsonOnly':'Requests must be JSON','ob.tooBig':'Request too large','ob.badJson':'Invalid JSON','ob.badOpen':'Invalid open request','ob.vaultChanged':'The connected vault changed',
  'ob.removed':'The note was removed or deleted. Sync again.','ob.badWrite':'Invalid write-back request','ob.vaultChangedReconnect':'The connected vault changed. Reconnect.','ob.untagged':'The note lost its tag or was deleted. Discard this pending change.','ob.failed':'Sync failed. Check the note properties or the plugin log in Obsidian.',
  'ob.status':'Status: {state}','ob.intro':'Tag a note with #x-feed to add it to your feed, or turn on note roaming in Chrome to browse the whole vault. Chrome records review counts, times and remarks.','ob.language':'Language','ob.language.desc':'Used for this page, notices and errors returned to the browser.','ob.language.auto':'Match Obsidian',
  'ob.token':'Token','ob.token.desc':'Copy this token into the Chrome extension settings. It is only used for local connections.','ob.copyToken':'Copy token','ob.copy':'Copy','ob.copied':'Token copied','ob.port':'Port: {port}. If startup fails because the port is in use, stop the old Node service.','ob.retry':'Retry startup','ob.start':'Start',
  'ob.badProperties':'Invalid note properties','ob.badMetadata':'Invalid review count, time or remarks. Fix them in the Obsidian properties.','ob.badId':'Invalid xfeed_id','ob.identityChanged':'The note identity changed. Sync again.','ob.badApplied':'Invalid review operation log',
  'ob.badTagsProp':'Invalid tags property; cannot archive','ob.archived':'The note is archived; reviews are no longer recorded','ob.noFeedTag':'The note no longer has #x-feed. Discard this pending change.','ob.bodyChanged':'The body changed in Obsidian. Your draft is kept; redo the edit against the latest body.',
  'ob.noteTooLarge':'The note exceeds 2 MiB and cannot be saved','ob.metadataChanged':'The metadata changed elsewhere. Reload it before editing.','ob.futureReview':'Review time is in the future. Check your computer clock.',
};
const messages:Record<Locale,Record<Key,string>> = {zh,en};

let current:Locale = 'zh';
export function detectLocale(language?:string|null):Locale { return !language || language.toLowerCase().startsWith('zh') ? 'zh' : 'en'; }
export function isPreference(value:unknown):value is LocalePreference { return value==='auto' || value==='zh' || value==='en'; }
export function resolveLocale(preference:unknown,language?:string|null):Locale {
  return preference==='zh' || preference==='en' ? preference : detectLocale(language);
}
export function setLocale(locale:Locale) { current=locale; }
export function getLocale() { return current; }
export function dateLocale(locale:Locale=current) { return locale==='zh' ? 'zh-CN' : 'en-US'; }
export function formatDate(value:string|number|Date,locale:Locale=current) { return new Date(value).toLocaleString(dateLocale(locale)); }
// `{name}` inserts a parameter; `{count|one|other}` picks a plural form by that parameter.
export function t(key:Key,params:Record<string,string|number>={},locale:Locale=current):string {
  return messages[locale][key].replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g,(_,name:string,one?:string,other?:string)=>
    one!==undefined ? (Number(params[name])===1 ? one : other!) : String(params[name] ?? ''));
}
