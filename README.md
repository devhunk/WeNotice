# WeNotice

<p align="center">
  <strong>专为 Windows 打造的轻量、原生质感微信桌面通知应用</strong>
</p>

<p align="center">
  <img src="source/docs/ui/toast-adaptive-0.1.5.png" alt="WeNotice 通知预览" width="460" />
</p>

---

## 🌟 核心特性

- **一键自动连接**：自动检测本机微信账号数据目录，支持多账号选择与密钥自动校验，配置通过系统 `safeStorage` 安全加密保存。
- **独立后台读取**：基于独立后台进程与命名管道/定时扫描监控新消息，不注入、不写入微信数据库，安全稳定。
- **精准消息过滤**：自动过滤自己发送的消息、应用启动前的历史消息，支持私聊、群聊、免打扰设置以及联系人白名单/黑名单。
- **智能通知合并**：支持同会话连续消息合并，通知窗口尺寸根据文本长短智能自适应，阅读体验极佳。
- **点击直达聊天**：点击通知弹窗一键唤起微信并准确定位至对应好友/群聊会话窗口。
- **现代化视觉质感**：原生毛玻璃（LiquidGlass）背景效果与自适应环境亮度主题，自然融入 Windows 11/10 桌面。
- **便捷系统托盘**：常驻托盘监听、支持开机自启、通知暂停免打扰模式及最近通知历史。

---

## 📸 界面预览

| 设置与账号连接 | 通知偏好与黑白名单 |
| :---: | :---: |
| <img src="source/docs/ui/auto-connect-0.1.2-panel.png" width="380" /> | <img src="source/docs/ui/notifications.png" width="380" /> |

| 自动检测与验证 | 通知气泡样式 |
| :---: | :---: |
| <img src="source/docs/ui/auto-connect-0.1.2.png" width="380" /> | <img src="source/docs/ui/toast-body-primary-0.1.4.png" width="380" /> |

---

## 📁 目录结构

```text
WeNotice/
├── source/                  # 项目完整源码工程（Electron + React + TypeScript + Vite）
│   ├── electron/            # Electron 主进程、后台读取组件与核心逻辑
│   ├── src/                 # React 前端界面（通知弹窗、设置页、毛玻璃效果）
│   ├── resources/           # 本机微信底层适配 DLL 与辅助工具
│   ├── tests/               # 自动化单元测试
│   └── package.json
├── 启动WeNotice.cmd          # 快速启动已构建应用的批处理脚本
├── 打包WeNotice.cmd          # 快速执行构建打包的批处理脚本
├── .gitignore               # Git 忽略配置（已排除本地构建产物与归档）
└── README.md                # 项目主文档
```

> **说明**：打包生成的二进制安装包和免安装程序输出至 `releases/` 目录（已在 `.gitignore` 中排除，建议通过 [GitHub Releases](https://github.com/devhunk/WeNotice/releases) 页面发布）。

---

## 🚀 快速上手与日常使用

### 日常运行与打包（本地）

- **启动程序**：双击根目录下的 `启动WeNotice.cmd`（需先完成一次构建）。
- **执行打包**：先从右下角托盘完全退出 WeNotice，再双击根目录下的 `打包WeNotice.cmd`。

---

## 🛠 开发与构建指南

### 环境准备

- **操作系统**：Windows 10 / 11 (x64)
- **Node.js**：>= 20.x
- **微信桌面端**：已安装并登录

### 开发步骤

进入 `source` 目录执行命令：

```powershell
cd source

# 1. 安装项目依赖
npm install

# 2. 启动开发模式（支持热重载）
npm run dev

# 3. 运行自动化测试
npm test

# 4. 构建生产代码并打包为免安装便携版
npm run dist:portable

# 5. 构建生成 Windows NSIS 安装包 (.exe)
npm run dist:win
```

构建生成的安装包与 `win-unpacked` 便携目录将统一输出至项目根目录下的 `releases/`。

---

## 🔒 隐私与安全性

1. **零写入安全设计**：应用仅以只读方式查询本地微信数据库，绝不修改、删除或篡改任何数据。
2. **密钥本地加密**：数据库访问密钥通过 Electron 原生提供的 Windows DPAPI (`safeStorage`) 加密保存在用户本地的 `%APPDATA%\WeNotice\settings.json`，不会明文暴露。
3. **纯本地离线运行**：所有消息处理与弹窗逻辑均在本地完成，无任何云端上传行为。

---

## 📄 来源与开源协议

- 本项目基于 [hicccc77/WeFlow](https://github.com/hicccc77/WeFlow) 的通知实现与读取接口设计进行了深度重构与优化（重新实现了应用外壳、增量监控、防抖合并队列及安全配置流程）。
- 沿用上游项目的 **CC-BY-NC-SA-4.0** 开源许可证，遵循非商业性使用、署名及相同方式共享原则。
- 详细第三方依赖许可与原生组件说明请参见 [source/THIRD_PARTY_NOTICES.md](source/THIRD_PARTY_NOTICES.md) 与 [source/LICENSE](source/LICENSE)。
