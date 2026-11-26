# Release documentation — Markdown studio 2.0.1

**English** · [中文](./README.zh-CN.md)

This folder versions everything that ships next to the installer binaries: installation guides in
English and Chinese, the SHA256 checksums, and the notes below. It is the canonical copy — the
`release/` folder in the repository root is a git-ignored build output directory.

The installer files themselves are **not committed to Git** (each is 107–128 MiB, and a copy in
history would be permanent). Build them locally with `npm run desktop:package` /
`npm run dist:win`, or attach them to a GitHub Release using the checksums below.

## What's new in 2.0.1

- Text selected inside a code block is now clearly highlighted in both the editor and the preview,
  using a VS Code-style blue selection color instead of the near-invisible default tint.

## Packages

| File | Platform | Size |
| --- | --- | --- |
| `Markdown-studio-2.0.1-arm64.dmg` | macOS 11+, Apple Silicon (arm64) | 134,195,942 B (128 MiB) |
| `Markdown-studio-2.0.1-arm64.zip` | macOS 11+, Apple Silicon (arm64) | 122,579,498 B (117 MiB) |
| `Markdown-studio-2.0.0-x64-setup.exe` | Windows 10 / 11 x64 (NSIS installer) | 123,826,544 B (118 MiB) |
| `Markdown-studio-2.0.0-x64-portable.exe` | Windows 10 / 11 x64 (portable) | 112,592,839 B (107 MiB) |

The Windows installers are still the 2.0.0 build; only the macOS packages were rebuilt for 2.0.1.

SHA256 checksums, as stored in [SHA256SUMS.txt](./SHA256SUMS.txt):

```text
fd71cf5f38297a81d16d5b0816669d2fc81d718879a86ec5a0f30fc00f6a5b77  Markdown-studio-2.0.1-arm64.dmg
33f6f2552e03a7658b0fe64405d6061cbad98ebcb7aca9fd069c2afcc531f501  Markdown-studio-2.0.1-arm64.zip
fef194d4a23968d66f87b1ae7405f09efe7a7f5247a179598946c9f5fb1de7ba  Markdown-studio-2.0.0-x64-setup.exe
ad236adf8736498a3131dea85f05dc724d9038cb7e392d446d57c4ce1ce33fc9  Markdown-studio-2.0.0-x64-portable.exe
```

## Guides

| Guide | Contents |
| --- | --- |
| [Installation-Guide-macOS.txt](./Installation-Guide-macOS.txt) · [安装说明.txt](./安装说明.txt) | Gatekeeper, drag-to-Applications install, DMG vs ZIP, verification |
| [Windows-Installation-Guide.txt](./Windows-Installation-Guide.txt) · [Windows-安装说明.txt](./Windows-安装说明.txt) | SmartScreen, installer vs portable, `%APPDATA%` data location, verification |

## Verification

macOS / Linux, from the folder that contains the downloaded packages and `SHA256SUMS.txt`:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

Windows (compare the printed value with `SHA256SUMS.txt`):

```bat
certutil -hashfile Markdown-studio-2.0.0-x64-setup.exe SHA256
certutil -hashfile Markdown-studio-2.0.0-x64-portable.exe SHA256
```

## Signing and distribution status

- **macOS**: ad-hoc signed, **not** notarized with an Apple Developer ID. Gatekeeper can block the
  first launch; right-click the app in Finder and choose **Open**. Public distribution requires a
  Developer ID signature plus notarization.
- **Windows**: not code-signed. SmartScreen may warn about an unknown publisher; choose
  **More info → Run anyway**.
- **Windows validation**: the installers were cross-built on macOS. The PE/NSIS structure, the
  embedded `app.asar`, and the installer integrity were verified, but the app has not been launched
  on a real Windows machine. Run an install-and-launch regression on Windows 11 before a public
  release.
- **macOS validation**: the 2.0.0 DMG was mounted and the app launched to verify workspace read/write,
  image paste, search, and last-workspace restore. 2.0.1 only changes selection colors and was rebuilt
  with the same pipeline.

## Reproducing the build

```bash
npm run desktop:package   # macOS: .app + .zip + .dmg into release/
npm run dist:win          # Windows x64: NSIS setup + portable into release/
```

See [the main README](../../README.md#developing-and-packaging-the-desktop-app) for the packaging
pipeline, timeouts, and troubleshooting notes.
