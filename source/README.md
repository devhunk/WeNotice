# WeNotice

Windows 微信桌面通知应用，当前版本 **0.1.5**。

工作目录入口和归档位置见 [项目目录说明](../README.md)。

## 运行

从项目根目录双击 `启动WeNotice.cmd`，或运行 `../releases/win-unpacked/WeNotice.exe`。保留整个 `win-unpacked` 文件夹，包括原版 `electron.exe`、读取组件和微信跳转组件。

先登录微信，再在设置中点击“一键连接微信”。自动连接会检测账号、获取并实际验证数据库密钥，再通过系统加密存储保存。读取组件随包提供，无需后台运行 WeFlow。

关闭设置窗口后仍会在托盘监听；完全退出请使用托盘菜单。

## 当前功能

- 自动检测本机微信账号目录，支持多账号选择、手动配置和密钥失效后重新获取。
- 独立后台读取，通过命名管道与定时补查发现新消息。
- 过滤自己发送的消息、首次启动前的历史消息及未知发送方向的消息。
- 支持私聊、群聊、免打扰、白名单、黑名单和同会话通知合并。
- 消息正文作为主要内容，联系人和时间作为辅助；通知尺寸随内容长度调整。
- 点击普通通知调用本机微信定位相应聊天，测试通知打开本应用。
- 支持托盘、开机启动、暂停、位置、显示时长和最近通知列表。

## 开发

环境：Windows x64、Node.js 和 npm。当前工作副本已包含开发依赖。

```powershell
npm ci                  # 新检出的源码首次安装依赖时运行
npm run dev             # 开发预览
npm test                # 自动化测试
npm run build           # 类型检查和生产编译
npm start               # 运行已编译源码
npm run dist:win        # 编译并打包 Windows 安装包
npm run dist:portable   # 编译并打包免安装目录，校验 ASAR 内容
```

安装包和免安装目录统一输出到 `../releases/`。打包前先从托盘退出正在运行的发布版，避免文件占用。主进程修改后需重启开发程序，渲染页面支持热更新。

## 源码位置

| 目录或文件 | 用途 |
| --- | --- |
| `src/components/NotificationToast.scss` | 头像、字号、间距和圆角 |
| `src/components/NotificationContent.tsx` | 设置预览和实际通知共用的内容组件 |
| `shared/notificationLayout.ts` | 通知宽度、正文行数和屏幕边界 |
| `src/pages/SettingsPage.tsx`、`SettingsPage.scss` | 设置页面 |
| `electron/core/` | 增量监控、过滤、通知队列和微信跳转 |
| `electron/data/` | 读取组件适配、账号发现、密钥恢复与独立子进程 |
| `electron/windows/` | 通知窗口和玻璃效果 |
| `native/wechat/` | 本机微信聊天定位组件源码 |
| `resources/` | 随包组件；构建和运行均需保留 |
| `scripts/` | 开发、构建和打包脚本 |
| `tests/` | 无真实微信依赖的自动化测试 |
| `docs/` | 组件约定、验收说明和界面截图 |
| `dist/`、`dist-electron/` | 自动生成的编译输出 |
| `node_modules/` | 开发依赖 |

## 配置与验证记录

配置保存于 `%APPDATA%\WeNotice\settings.json`，密钥通过 Electron `safeStorage` 加密。最近通知只保存在内存，退出清空。应用不写入微信数据库。

读取和密钥组件来自本机 WeFlow 6.3.2，构建时必须保留 `resources/wcdb/`、`resources/key/`，并随包提供原版 Electron 宿主。原生组件实现源码不在本项目中，接口约定见 [COMPONENT_CONTRACT.md](docs/COMPONENT_CONTRACT.md)。参考源码、修复工具及组件备份在 `../archive/WeFlow/`，本项目的历史验证报告和恢复备份在 `../archive/WeNotice-repair/`。

此前已验证本机读取、监听及微信聊天定位组件；另一账号的新消息触发实际弹窗并点击跳转的完整链路仍需实机验收。数据库兼容性依赖组件及微信版本，详见 [验收说明](docs/ACCEPTANCE.md)。界面截图使用模拟消息，保存在 `docs/ui/`。

## 来源与许可

基于 [hicccc77/WeFlow](https://github.com/hicccc77/WeFlow) 的通知实现与读取接口分析，固定参考提交 `ad075f7983fcf5c217b0e305065a7298c005541a`。通知样式、LiquidGlass 组件及自适应亮度实现经过修改，应用壳、后台监控、队列和配置流程重新实现。

沿用上游 CC-BY-NC-SA-4.0 声明，保留署名和修改说明。第三方依赖及本机原生组件说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [LICENSE](LICENSE)。
