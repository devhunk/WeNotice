# 0.2.0 验证记录

Windows x64 本机验证；测试消息和配置均为合成数据，使用隔离用户目录，未修改现用账号配置。

- `npm test`：43 项通过；`npm run build`：类型检查与生产构建通过。
- `npm run check:ui -- ../releases/WeNotice-0.2.0-customization/win-unpacked`：13 项通过，直接加载包内页面和通知预加载脚本，确认包内主进程与当前构建字节一致。
- Electron 检查覆盖配置迁移备份、加密字段保留、无效保存不覆盖、明暗/系统主题、预览保存、规则增删复制与撤销、导航折叠、850×640 布局、前台门控、队列清除且不补弹、手动测试例外、悬停计时、点击关闭、极端尺寸。
- 本机 Win32 API 成功查询活动进程；前台切换场景使用注入状态。界面验证使用本机 150% 缩放。
- 便携包 ASAR 的 4,792 个文件及负载长度校验通过；运行目录文件的 SHA256 清单位于独立包根目录。
- 独立输出：`releases/WeNotice-0.2.0-customization/`。`verification/checks.json`、`release-summary.json` 和 PNG 保存具体结果；临时测试目录已清理。

未完成真实微信新消息、真实微信前台切换、多屏物理拔插、其他 DPI、原生玻璃 GPU 效果与长时间运行验收。未生成本轮安装器。原发布目录保持原状。

以下保留旧版记录。

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
