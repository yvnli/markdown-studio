# 发布文档 — Markdown studio 2.0.0

[English](./README.md) · **中文**

本目录随安装包一起发布的全部文档：中英文安装说明、SHA256 校验清单以及下方说明。这里是**唯一
维护副本**；仓库根目录的 `release/` 是构建产物目录，已被 Git 忽略。

安装包本身**不入库**（单个 107–128 MiB，一旦进入历史就永久存在）。可在本地用
`npm run desktop:package` / `npm run dist:win` 重新构建，或按下方校验值把安装包挂到 GitHub Release。

## 安装包

| 文件 | 平台 | 大小 |
| --- | --- | --- |
| `Markdown-studio-2.0.0-arm64.dmg` | macOS 11+，Apple Silicon（arm64） | 134,197,506 B（128 MiB） |
| `Markdown-studio-2.0.0-arm64.zip` | macOS 11+，Apple Silicon（arm64） | 122,579,281 B（117 MiB） |
| `Markdown-studio-2.0.0-x64-setup.exe` | Windows 10 / 11 x64（NSIS 安装版） | 123,826,544 B（118 MiB） |
| `Markdown-studio-2.0.0-x64-portable.exe` | Windows 10 / 11 x64（便携版） | 112,592,839 B（107 MiB） |

SHA256 校验值（与 [SHA256SUMS.txt](./SHA256SUMS.txt) 一致）：

```text
270333a02889b416221b4f70b93f1e09d18b5bacf7df2e72798a5a9b8bf24073  Markdown-studio-2.0.0-arm64.dmg
574d888c89bf2a831c835b6133d5415cf3ba906e16426247415ffd6714846940  Markdown-studio-2.0.0-arm64.zip
fef194d4a23968d66f87b1ae7405f09efe7a7f5247a179598946c9f5fb1de7ba  Markdown-studio-2.0.0-x64-setup.exe
ad236adf8736498a3131dea85f05dc724d9038cb7e392d446d57c4ce1ce33fc9  Markdown-studio-2.0.0-x64-portable.exe
```

## 安装说明

| 文档 | 内容 |
| --- | --- |
| [安装说明.txt](./安装说明.txt) · [Installation-Guide-macOS.txt](./Installation-Guide-macOS.txt) | Gatekeeper 处理、拖入「应用程序」、DMG 与 ZIP 的区别、校验方法 |
| [Windows-安装说明.txt](./Windows-安装说明.txt) · [Windows-Installation-Guide.txt](./Windows-Installation-Guide.txt) | SmartScreen 处理、安装版与便携版、`%APPDATA%` 数据目录、校验方法 |

## 校验

macOS / Linux：在存放安装包和 `SHA256SUMS.txt` 的目录执行：

```bash
shasum -a 256 -c SHA256SUMS.txt
```

Windows：用下面的命令计算，并与 `SHA256SUMS.txt` 中的值比对：

```bat
certutil -hashfile Markdown-studio-2.0.0-x64-setup.exe SHA256
certutil -hashfile Markdown-studio-2.0.0-x64-portable.exe SHA256
```

## 签名与分发状态

- **macOS**：ad-hoc 签名，**未**使用 Apple Developer ID 公证。首次启动可能被 Gatekeeper 拦截，
  在 Finder 中右键应用 →「打开」即可。正式对外分发需要 Developer ID 签名并做 notarization。
- **Windows**：未使用代码签名证书。SmartScreen 可能提示未知发布者，点击「更多信息」→「仍要运行」。
- **Windows 验证情况**：安装包在 macOS 上交叉构建，已验证 PE/NSIS 结构、内嵌 `app.asar` 与安装器
  完整性，但尚未在 Windows 实机启动。对外发布前建议在 Windows 11 上完成一次安装与启动回归。
- **macOS 验证情况**：已挂载 DMG 并实际启动，验证了工作区读写、图片粘贴、搜索与上次工作区恢复。

## 重新构建

```bash
npm run desktop:package   # macOS：生成 .app + .zip + .dmg 到 release/
npm run dist:win          # Windows x64：生成 NSIS 安装版与便携版
```

打包流程、超时与排障说明见[主 README](../../README.zh-CN.md#开发与打包桌面应用)。
