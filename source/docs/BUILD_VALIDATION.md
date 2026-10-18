# 0.1.0 验证记录

日期：2026-10-17。构建环境：Linux x64、Node.js 24.19.0；目标：Windows x64。参考 WeFlow 提交：`ad075f7983fcf5c217b0e305065a7298c005541a`。

## 已通过

- `npm run build`：TypeScript 类型检查、Electron 主进程/预加载/Worker 编译、Vite 渲染页面构建。
- `npm test`：13 项测试通过，覆盖通知 ID 竞争、同会话合并、64 位 ID、同秒增量、历史抑制、自发/免打扰过滤、暂停中的异步结果、失败重试、长期静默后的去重、分页及资源释放。
- Windows 应用目录交叉打包。检查 ASAR 与解包文件，确认包含 Windows x64 Koffi 和 electron-liquid-glass 原生模块、组件许可文件。

交叉打包命令：

```sh
npx electron-builder --win dir --x64 -c.win.signAndEditExecutable=false -c.npmRebuild=false -c.directories.output=release-final
```

此环境额外从官方 npm 包 `@koromix/koffi-win32-x64@3.3.3` 放入目标平台预构建模块；正常 Windows x64 环境中 `npm ci` 会安装对应平台依赖。`package-lock.json` 固定了实际依赖版本。

## 未通过或尚未验证

- NSIS 安装器生成失败：缺少 Wine，不交付中间产生的安装器文件。
- 桌面 UI 启动检查受环境 Unix socket 权限限制，未完成界面视觉/交互验收。
- 没有兼容数据库读取 DLL、有效账号密钥和真实 Windows 微信运行环境，尚未验证真实消息到通知的完整链路。
- 未进行代码签名；交叉打包禁用了 Windows 可执行资源编辑，使用默认 Electron 图标。
- 未进行多屏/DPI、原生玻璃 GPU 效果、休眠/重连与长时间运行验收。

构建日志还有 Vite 配置加载模式的未来兼容提醒，以及 lucide-react 的 `use client` 指令提示；未阻止编译。此版本是待实机验收的开发验证版，不应描述为稳定发行版。
