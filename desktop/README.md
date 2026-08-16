# 一人公司 AI-Agent 桌面端

个人自用桌面端，不做代码签名。

## 开发运行

```bash
npm run desktop
npm run desktop:smoke
```

## 打包

Windows 下在 `desktop/` 目录执行：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist
```

产物在 `desktop/release/`：NSIS 安装版与便携版 `.exe`。签名策略：
`forceCodeSigning=false`，不配置证书，构建不要求签名。
