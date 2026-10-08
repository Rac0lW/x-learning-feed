import { defineConfig } from 'wxt';
const icons = { 16:'icon/16.png', 32:'icon/32.png', 48:'icon/48.png', 128:'icon/128.png' };
export default defineConfig({
  manifest: {
    name: 'X Learning Feed', description: '在 X 首页穿插本地学习笔记',
    permissions: ['storage','alarms'],
    host_permissions: ['http://127.0.0.1/*'],
    icons,
    action: { default_title: 'X Learning Feed', default_icon: icons },
    web_accessible_resources: [{ resources: ['panel.html'], matches: ['https://x.com/*'] }],
  },
});
