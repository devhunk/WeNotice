# Third-party notices

## WeFlow

Source: https://github.com/hicccc77/WeFlow

Reference commit: ad075f7983fcf5c217b0e305065a7298c005541a

Original authors: hicccc77 and WeFlow contributors. The upstream repository declares CC BY-NC-SA 4.0; the full upstream license is preserved in `LICENSE`.

Derived portions include notification SCSS, LiquidGlass components and their WebGL helpers, native adaptive brightness logic, and emoji text rendering. The database adapter follows the upstream custom ABI but does not contain the unavailable native database implementation. Changes include an independent application shell, background monitor, queue, narrow IPC bridges, settings, lifecycle and compatibility diagnostics. This project is not an official WeChat/Tencent application and is not an official WeFlow release.

## Runtime dependencies

The LiquidGlass implementation also derives from liquid-glass-react v1.1.1 by MAX ROVENSKY (MIT), https://github.com/rdev/liquid-glass-react. Its copyright and permission notice is included in `licenses/liquid-glass-react-LICENSE`.

| Package | Declared license | Source / credits |
| --- | --- | --- |
| Electron | MIT; Chromium and embedded components have separate notices | https://github.com/electron/electron |
| React / React DOM | MIT | Meta Platforms, Inc. and affiliates; https://github.com/facebook/react |
| Koffi / platform binary packages | MIT | Koromix; https://github.com/Koromix/koffi |
| @hicccc77/electron-liquid-glass | MIT | hicccc77; https://github.com/hicccc77/electron-liquid-glass |
| fzstd | MIT | Arjun Barrett; https://github.com/101arrowz/fzstd |
| lucide-react | ISC | Lucide contributors; https://github.com/lucide-icons/lucide |
| wechat-emojis | MIT (package declaration) | xxk8; https://github.com/xxk8/wechat-emojis |

Package notices are retained in installed dependency folders where supplied. Additional bundled license texts are in `licenses/`. Electron distributes its own LICENSE and LICENSES.chromium.html with the application. Package license declarations do not grant rights in third-party trademarks or imagery beyond what the rights holders allow.

The supplied source archive excludes proprietary database libraries, credentials and user data. Obtain external components separately from a trusted, authorized source. Review all relevant licenses before redistribution, especially commercial use.

## Local 0.1.1 repair bundle

The local repair package additionally contains the user-installed WeFlow 6.3.2 native reader and its runtime dependencies, copied only for this local repair. The `wcdb_api.dll` expiry patch is documented in the workspace's `archive/WeFlow/WeFlow-repair` directory. The temporary loopback initialization grant follows the installed WeFlow initialization protocol. Native-reader source and redistribution rights are not supplied by this project; the repository license does not establish a license for these additional binaries.

## Local 0.1.2 automatic connection bundle

The local-only runtime additionally includes `wx_key.dll` copied without modification from the user's installed WeFlow 6.3.2, plus the existing Visual C++ runtime dependencies. SHA-256: `9cd7e29d3739e7f2d0b242cefe7ed3937cda7e6174f2874cc3b323dc023bd226`. The application follows the installed `RecoverDbKey` ABI and temporary `win_dll_db_scan` loopback grant protocol in a separate child process. No native key-recovery source or redistribution grant is supplied. This component is separate from the current public WeFlow repository's external key-provider executable protocol.
