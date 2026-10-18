# 外部读取组件契约

本应用只绑定 WeFlow 在 `electron/services/wcdbCore.ts` 中使用的一小部分自定义 C ABI。完整签名以本项目 `electron/data/nativeAdapter.ts` 的 `signatures` 为准。这里只读取数据库，不绑定写消息或发送消息接口。

## 0.1.1 初始化兼容

本机修复运行包附带 WeFlow 6.3.2 的期限修复组件和运行依赖，默认选择包内 `resources/wcdb/win32/x64/wcdb_api.dll`，无需运行 WeFlow。原有指向 WeFlow 安装目录的设置会优先迁移到包内组件；自定义读取组件仍可手动选择。

加载后先检查可选 `wcdb_runtime_policy_version()`，再执行可选 `wcdb_authenticate(const char* token, int32 port, int64 issuedAtMs)`，最后调用 `wcdb_init()`。认证临时服务位于主线程的 IPv4 回环随机端口，FFI 调用位于 Worker；初始化请求结束即关闭服务，不持久化令牌，不连接 WeFlow 或外网。不含这些可选导出的旧组件保留原初始化流程。

支持 `wcdb_set_my_wxid` 作为账号识别导出的兼容别名，关闭时释放账号、组件和依赖。原件与二进制修复记录见工作目录 `archive/WeFlow/WeFlow-repair/`；该组件仅适配本机原件构建。

## 必须导出

| 导出 | 作用 |
| --- | --- |
| `wcdb_init` / `wcdb_shutdown` | 初始化与释放组件 |
| `wcdb_open_account` | 用 `session.db` 路径和 64 位十六进制密钥打开账号，输出 64 位句柄 |
| `wcdb_free_string` | 释放组件返回的字符串；必须与分配方式配套 |
| `wcdb_get_sessions` | 输出会话数组 JSON |
| `wcdb_open_message_cursor` | 指定会话、每批 200 条、升序、起始时间，输出游标 |
| `wcdb_fetch_message_batch` | 输出消息数组 JSON 和是否还有下一批 |
| `wcdb_close_message_cursor` | 释放游标 |

所有 `int32` 状态返回以 0 表示成功。JSON 为 UTF-8；应用会在解码后调用组件释放函数。每次扫描分页读取，连续空批次或超出 500 页时报错，不推进消息基准。必须与 Electron/Windows x64 架构一致，并随 DLL 提供其合法依赖。

## 可选导出

- `wcdb_set_my_account_id`：提供当前账号，辅助识别自发消息。
- `wcdb_get_contact`、`wcdb_get_display_names`、`wcdb_get_avatar_urls`：联系人名称和头像。
- `wcdb_get_contact_status`：按用户名返回 `{ isMuted, isFolded }`。默认开启的“遵循免打扰”需要此能力。
- `wcdb_start_monitor_pipe`、`wcdb_stop_monitor_pipe`、`wcdb_get_monitor_pipe_name`：Windows 命名管道监控。缺少时退回轮询。管道内容仅作为重新查询提示，不直接当成消息。

## JSON 形状

会话数组元素主要字段为 `username` / `user_name`、`last_timestamp` / `lastTimestamp`、`unread_count` / `unreadCount`、`summary`。消息主要字段为 `server_id`、`local_id`、`create_time`、`sort_seq`、`sender_username`、`computed_is_send` / `is_send`、`message_content` / `compress_content`、`local_type`。实际字段别名以 `electron/data/normalize.ts` 为准。

`server_id` 建议直接用字符串输出，避免 JavaScript 64 位整数精度损失。消息必须具备稳定 ID、秒级时间戳、可判断方向的字段；无法可靠判定方向时应用跳过通知。群聊发送者前缀和 zstd 内容由适配层处理。

不能仅靠同名 DLL 文件证明兼容：需要验证导出、调用约定、字段、内存释放以及当前微信数据库版本。应用检测导出缺失只能发现部分问题，无法证明二进制安全或语义正确。请仅加载可信且有权使用的组件。
