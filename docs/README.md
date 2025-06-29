# Cloud-PE One 开发与构建指南

本文档提供了 Cloud-PE One 应用程序的环境配置、开发调试和构建发布的详细说明。

## 目录

1. [环境配置说明](#环境配置说明)
2. [开发调试指南](#开发调试指南)
3. [构建发布指南](#构建发布指南)




## 环境配置说明

### 系统要求

Cloud-PE One 是一个基于 Tauri 框架的桌面应用程序，可以在 Windows、macOS 和 Linux 上运行。但由于项目的特定功能（如启动盘检测），主要针对 Windows 平台进行了优化。开发环境推荐配置如下：

- **操作系统**：Windows 11 x64（推荐）或 Windows 10 x64
- **处理器**：现代多核处理器（Intel Core i5/i7 或 AMD Ryzen 5/7 及以上）
- **内存**：至少 8GB RAM，推荐 16GB 或更多
- **存储**：至少 10GB 可用空间（用于开发环境和依赖项）
- **显示器**：分辨率 1920x1080 或更高

### 必要软件

在开始开发之前，您需要安装以下软件：

1. **Node.js**：版本 18.x 或更高
2. **Rust**：最新稳定版
3. **Visual Studio Code**：推荐的代码编辑器（或您喜欢的其他编辑器）
4. **Git**：版本控制系统
5. **Windows 开发工具**：
   - Visual Studio 2022 或 Visual Studio Build Tools 2022，包含 C++ 桌面开发工作负载
   - Windows 10/11 SDK

### 安装步骤

#### 1. 安装 Node.js

1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载并安装 LTS 版本（推荐）
3. 安装完成后，打开命令提示符或 PowerShell，验证安装：

```bash
node --version
npm --version
```

#### 2. 安装 Rust

1. 访问 [Rust 官网](https://www.rust-lang.org/tools/install)
2. 下载并运行 rustup-init.exe
3. 按照安装向导完成安装
4. 安装完成后，打开新的命令提示符或 PowerShell，验证安装：

```bash
rustc --version
cargo --version
```

#### 3. 安装 Visual Studio 和 Windows SDK

1. 访问 [Visual Studio 下载页面](https://visualstudio.microsoft.com/downloads/)
2. 下载 Visual Studio 2022 Community（免费版）或 Visual Studio Build Tools 2022
3. 在安装过程中，选择"使用 C++ 的桌面开发"工作负载
4. 确保在单个组件中选择了"Windows 10/11 SDK"

#### 4. 安装 Git

1. 访问 [Git 官网](https://git-scm.com/downloads)
2. 下载并安装适合您系统的版本
3. 安装完成后，验证安装：

```bash
git --version
```

#### 5. 安装 Tauri CLI

安装完 Node.js 和 Rust 后，您可以全局安装 Tauri CLI：

```bash
npm install -g @tauri-apps/cli
```

验证安装：

```bash
tauri --version
```

### 克隆项目

设置好开发环境后，您可以克隆项目仓库：

```bash
git clone https://github.com/your-username/cloud-pe-one.git
cd cloud-pe-one
```

### 安装项目依赖

在项目根目录中，运行以下命令安装所有依赖项：

```bash
npm install
```

这将安装前端依赖项。Rust 依赖项将在首次构建时自动安装。

### 环境变量配置

项目不需要特殊的环境变量配置，但如果您需要在开发过程中使用特定的设置，可以在项目根目录创建 `.env` 文件。

### 常见问题解决

#### Rust 工具链安装失败

如果 Rust 工具链安装失败，可能是网络问题。您可以尝试设置国内镜像：

```bash
# 设置 RUSTUP_DIST_SERVER 环境变量（中国用户）
set RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
set RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup

# 或者在 ~/.cargo/config 文件中添加
[source.crates-io]
registry = "https://github.com/rust-lang/crates.io-index"
replace-with = 'ustc'

[source.ustc]
registry = "https://mirrors.ustc.edu.cn/crates.io-index"
```

#### Node.js 依赖安装失败

如果 npm 安装依赖失败，可以尝试使用国内镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

或者使用 yarn：

```bash
npm install -g yarn
yarn config set registry https://registry.npmmirror.com
yarn install
```

#### Windows SDK 找不到

如果构建时报错找不到 Windows SDK，请确保您已安装正确版本的 Windows SDK，并且环境变量已正确设置。您可能需要重新运行 Visual Studio Installer 并修复安装。


## 开发调试指南

### 项目结构

Cloud-PE One 项目采用 Tauri + Vite + React + TypeScript + Semi Design 技术栈，项目结构如下：

```
cloud-pe-one/
├── dist/                  # 构建输出目录
├── docs/                  # 文档目录
├── node_modules/          # Node.js 依赖
├── public/                # 静态资源
├── src/                   # 前端源代码
│   ├── assets/            # 资源文件（图片、字体等）
│   ├── components/        # React 组件
│   ├── pages/             # 页面组件
│   ├── utils/             # 工具函数
│   ├── hooks/             # React Hooks
│   ├── api/               # API 调用
│   ├── App.tsx            # 应用入口组件
│   ├── App.css            # 应用样式
│   ├── main.tsx           # 主入口文件
│   └── index.css          # 全局样式
├── src-tauri/             # Tauri/Rust 后端代码
│   ├── src/               # Rust 源代码
│   │   ├── main.rs        # 主入口文件
│   │   └── lib.rs         # 库文件
│   ├── Cargo.toml         # Rust 依赖配置
│   ├── Cargo.lock         # Rust 依赖锁定文件
│   ├── tauri.conf.json    # Tauri 配置
│   └── icons/             # 应用图标
├── .gitignore             # Git 忽略文件
├── package.json           # Node.js 依赖配置
├── package-lock.json      # Node.js 依赖锁定文件
├── tsconfig.json          # TypeScript 配置
├── tsconfig.node.json     # Node TypeScript 配置
└── vite.config.ts         # Vite 配置
```

### 开发模式

#### 启动开发服务器

在项目根目录中，运行以下命令启动开发服务器：

```bash
npm run dev
```

这将启动 Vite 开发服务器和 Tauri 开发窗口。您可以在开发窗口中实时查看您的更改。

#### 前端开发

前端代码位于 `src` 目录中。主要文件和目录包括：

- `src/components/`: 包含可重用的 React 组件
- `src/pages/`: 包含应用的各个页面
- `src/utils/`: 包含工具函数和辅助方法
- `src/App.tsx`: 应用的主组件
- `src/main.tsx`: 应用的入口点

##### 组件开发

项目使用 Semi Design 组件库。您可以参考 [Semi Design 官方文档](https://semi.design/zh-CN/) 了解如何使用各种组件。

示例：创建一个新的页面组件

```tsx
// src/pages/NewPage.tsx
import React from 'react';
import { Typography, Card } from '@douyinfe/semi-ui';

const { Title, Paragraph } = Typography;

const NewPage: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Title>新页面</Title>
        <Paragraph>这是一个新页面的内容。</Paragraph>
      </Card>
    </div>
  );
};

export default NewPage;
```

然后在 `src/components/Layout.tsx` 中添加路由：

```tsx
// 在 routes 数组中添加
{
  path: '/new-page',
  element: <NewPage />,
},
```

并在侧边栏菜单中添加链接：

```tsx
// 在 menuItems 数组中添加
{
  itemKey: 'new-page',
  text: '新页面',
  icon: <IconStar />,
},
```

##### 主题开发

项目支持深色模式和浅色模式。主题相关代码位于 `src/utils/theme.ts` 中。您可以根据需要修改主题配置。

#### 后端开发

后端代码位于 `src-tauri/src` 目录中。主要文件包括：

- `src-tauri/src/main.rs`: 应用的入口点
- `src-tauri/src/lib.rs`: 包含所有 Tauri 命令和功能实现

##### 添加新的 Tauri 命令

要添加新的 Tauri 命令，请按照以下步骤操作：

1. 在 `src-tauri/src/lib.rs` 中定义新的函数并添加 `#[tauri::command]` 属性：

```rust
#[tauri::command]
fn my_new_command(param: &str) -> Result<String, String> {
    // 实现您的功能
    Ok(format!("处理结果: {}", param))
}
```

2. 在 `run()` 函数的 `invoke_handler` 中注册该命令：

```rust
.invoke_handler(tauri::generate_handler![
    // 其他命令...
    my_new_command,
])
```

3. 在前端代码中调用该命令：

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// 调用命令
const result = await invoke('my_new_command', { param: 'test' });
console.log(result); // 输出: 处理结果: test
```

### 调试技巧

#### 前端调试

1. **使用 React DevTools**：安装 React DevTools 浏览器扩展，可以在开发过程中检查组件层次结构和状态。

2. **使用 console.log**：在代码中添加 `console.log` 语句来输出调试信息。在开发模式下，这些信息将显示在浏览器控制台中。

3. **使用 Tauri 开发者工具**：在应用运行时，按下 `F12` 或点击设置页面中的"打开开发工具"按钮打开开发者工具。

#### 后端调试

1. **使用 println! 宏**：在 Rust 代码中添加 `println!` 语句来输出调试信息。这些信息将显示在终端中。

```rust
println!("调试信息: {:?}", some_variable);
```

2. **使用 log 宏**：项目已配置 `tauri-plugin-log`，您可以使用 `log` 宏来输出不同级别的日志：

```rust
log::info!("信息日志");
log::warn!("警告日志");
log::error!("错误日志");
```

3. **使用 Rust 调试器**：如果您使用 Visual Studio Code，可以安装 "CodeLLDB" 扩展并设置断点进行调试。

### 测试

#### 前端测试

项目目前没有配置自动化测试。如果您想添加测试，可以考虑使用以下工具：

- **Jest**：JavaScript 测试框架
- **React Testing Library**：React 组件测试库

安装测试依赖：

```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
```

创建测试文件（例如 `src/components/MyComponent.test.tsx`）：

```tsx
import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

test('renders component correctly', () => {
  render(<MyComponent />);
  const element = screen.getByText(/expected text/i);
  expect(element).toBeInTheDocument();
});
```

#### 后端测试

对于 Rust 代码，您可以使用 Rust 的内置测试框架。在 `src-tauri/src/lib.rs` 中添加测试模块：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        let result = my_function();
        assert_eq!(result, expected_value);
    }
}
```

运行测试：

```bash
cd src-tauri
cargo test
```

### 常见问题和解决方案

#### 前端构建错误

如果遇到前端构建错误，请检查：

1. TypeScript 类型错误
2. 导入路径是否正确
3. 依赖版本是否兼容

解决方案：

```bash
# 清除缓存并重新安装依赖
npm cache clean --force
rm -rf node_modules
npm install
```

#### Tauri 构建错误

如果遇到 Tauri 构建错误，请检查：

1. Rust 工具链是否正确安装
2. `tauri.conf.json` 配置是否正确
3. Rust 代码中是否有编译错误

解决方案：

```bash
# 检查 Rust 工具链
rustup update
rustup default stable

# 清理 Rust 构建缓存
cd src-tauri
cargo clean
```

#### 应用崩溃

如果应用在运行时崩溃，可能的原因包括：

1. 未处理的异常
2. 内存泄漏
3. 资源访问权限问题

解决方案：

- 检查日志文件（通常位于 `%APPDATA%\cloud-pe-one\logs` 目录）
- 添加更多的错误处理代码
- 使用 `try-catch` 块包装可能失败的操作


## 构建发布指南

### 构建流程

Cloud-PE One 应用程序的构建过程包括前端构建和 Tauri 应用程序打包两个主要步骤。

#### 前端构建

前端构建将 React 应用程序编译为静态文件，这些文件将被嵌入到 Tauri 应用程序中。

```bash
npm run build
```

这个命令会执行以下操作：

1. 运行 TypeScript 类型检查
2. 使用 Vite 构建前端代码
3. 将构建结果输出到 `dist` 目录

#### Tauri 应用程序打包

Tauri 应用程序打包将前端构建结果和 Rust 后端代码打包为可执行文件。

```bash
npm run tauri build
```

这个命令会执行以下操作：

1. 构建前端代码（如果尚未构建）
2. 编译 Rust 代码
3. 将前端和后端打包为可执行文件
4. 创建安装程序（如果配置了）

构建结果将位于 `src-tauri/target/release` 目录（可执行文件）和 `src-tauri/target/release/bundle` 目录（安装程序和其他打包格式）。

### 构建配置

#### 前端构建配置

前端构建配置位于 `vite.config.ts` 文件中。您可以根据需要修改此文件以自定义构建过程。

主要配置选项包括：

- `build.outDir`：构建输出目录
- `build.sourcemap`：是否生成源映射
- `build.rollupOptions`：Rollup 打包选项

示例配置：

```typescript
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: [
        '@tauri-apps/api',
        '@tauri-apps/api/tauri',
        '@tauri-apps/api/window',
        '@tauri-apps/api/shell',
        '@tauri-apps/api/path',
        '@tauri-apps/api/fs'
      ]
    }
  },
  // 其他配置...
});
```

#### Tauri 构建配置

Tauri 构建配置位于 `src-tauri/tauri.conf.json` 文件中。您可以根据需要修改此文件以自定义应用程序打包过程。

主要配置选项包括：

- `productName`：应用程序名称
- `version`：应用程序版本
- `identifier`：应用程序标识符
- `build`：构建相关配置
- `app`：应用程序窗口和安全配置
- `bundle`：打包相关配置

示例配置：

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "Cloud-PE One",
  "version": "0.1.0",
  "identifier": "cn.cloud-pe.one",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Cloud-PE One",
        "width": 1024,
        "height": 768,
        "resizable": true,
        "fullscreen": false,
        "decorations": false,
        "transparent": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

### 版本管理

#### 更新版本号

在发布新版本之前，您需要更新应用程序的版本号。版本号应遵循[语义化版本规范](https://semver.org/)。

1. 更新 `package.json` 中的版本号：

```json
{
  "name": "cloud-pe-one",
  "version": "0.1.0",
  // 其他配置...
}
```

2. 更新 `src-tauri/tauri.conf.json` 中的版本号：

```json
{
  "productName": "Cloud-PE One",
  "version": "0.1.0",
  // 其他配置...
}
```

3. 更新 `src-tauri/Cargo.toml` 中的版本号：

```toml
[package]
name = "cloud-pe-one"
version = "0.1.0"
# 其他配置...
```

#### 创建 Git 标签

为了跟踪版本历史，建议为每个发布版本创建 Git 标签：

```bash
git tag -a v0.1.0 -m "版本 0.1.0"
git push origin v0.1.0
```

### 打包和发布

#### Windows 打包

在 Windows 上，Tauri 可以创建以下格式的安装程序：

- MSI 安装程序
- NSIS 安装程序
- 可执行文件（不需要安装）

要自定义 Windows 打包选项，可以在 `src-tauri/tauri.conf.json` 中添加 `windows` 配置：

```json
"bundle": {
  "active": true,
  "targets": "all",
  "windows": {
    "certificateThumbprint": null,
    "digestAlgorithm": "sha256",
    "timestampUrl": "",
    "wix": {
      "language": "zh-CN",
      "template": "wix/main.wxs"
    },
    "nsis": {
      "displayLanguageSelector": true,
      "languages": ["SimpChinese"],
      "installMode": "currentUser"
    }
  }
}
```

#### 代码签名

为了提高用户信任度和避免安全警告，建议对应用程序进行代码签名。

##### Windows 代码签名

1. 获取代码签名证书（可以从证书颁发机构购买）
2. 在 `src-tauri/tauri.conf.json` 中配置签名选项：

```json
"bundle": {
  "windows": {
    "certificateThumbprint": "您的证书指纹",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

3. 设置环境变量（如果使用证书文件而不是证书存储）：

```bash
set TAURI_PRIVATE_KEY=path/to/private.key
set TAURI_KEY_PASSWORD=your-password
```

#### 自动更新

Tauri 支持自动更新功能。要启用自动更新，您需要：

1. 在 `src-tauri/tauri.conf.json` 中启用更新器：

```json
"updater": {
  "active": true,
  "endpoints": [
    "https://your-update-server.com/api/updates"
  ],
  "dialog": true,
  "pubkey": "您的公钥"
}
```

2. 设置更新服务器，提供更新元数据 JSON 文件：

```json
{
  "version": "0.2.0",
  "notes": "新版本更新说明",
  "pub_date": "2025-06-10T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "签名",
      "url": "https://your-update-server.com/downloads/cloud-pe-one-0.2.0-setup.exe"
    }
  }
}
```

3. 生成签名密钥对：

```bash
tauri signer generate -w ~/.tauri/cloud-pe-one.key
```

### 发布渠道

#### GitHub Releases

您可以使用 GitHub Releases 发布应用程序：

1. 创建新的 GitHub Release
2. 上传构建的安装程序和可执行文件
3. 编写发布说明

#### 自定义发布服务器

您也可以设置自己的发布服务器：

1. 创建一个 Web 服务器
2. 上传构建的安装程序和可执行文件
3. 提供下载页面
4. 如果启用了自动更新，提供更新元数据 API

### 持续集成/持续部署 (CI/CD)

#### GitHub Actions

您可以使用 GitHub Actions 自动构建和发布应用程序。创建 `.github/workflows/release.yml` 文件：

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest]
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Install dependencies
        run: npm install
      - name: Build Tauri App
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Cloud-PE One ${{ github.ref_name }}'
          releaseBody: '请查看 [CHANGELOG.md](https://github.com/your-username/cloud-pe-one/blob/main/CHANGELOG.md) 了解更新内容。'
          releaseDraft: true
          prerelease: false
```

### 发布后检查清单

在正式发布应用程序之前，请确保完成以下检查：

1. **功能测试**：确保所有功能正常工作
2. **性能测试**：确保应用程序在目标设备上运行流畅
3. **安全检查**：确保没有安全漏洞
4. **安装测试**：测试安装和卸载过程
5. **更新测试**：如果启用了自动更新，测试更新过程
6. **文档更新**：更新用户文档和发布说明
7. **版本号检查**：确保所有文件中的版本号一致
8. **许可证检查**：确保所有依赖项的许可证合规

完成这些检查后，您就可以自信地发布应用程序了！

### 故障排除

#### 构建失败

如果构建失败，请检查：

1. 前端构建日志（通常显示在终端中）
2. Rust 构建日志（位于 `src-tauri/target/log` 目录）

常见问题和解决方案：

- **前端构建错误**：检查 TypeScript 类型错误和导入路径
- **Rust 构建错误**：检查 Rust 代码中的语法错误和依赖问题
- **资源文件错误**：确保所有引用的资源文件存在

#### 打包失败

如果打包失败，请检查：

1. Tauri 配置文件是否正确
2. 是否有足够的磁盘空间
3. 是否有必要的权限

#### 安装失败

如果安装失败，请检查：

1. 安装程序是否被杀毒软件阻止
2. 用户是否有足够的权限
3. 是否有足够的磁盘空间

### 结论

通过本指南，您应该能够成功构建和发布 Cloud-PE One 应用程序。如果您遇到任何问题，请参考 [Tauri 官方文档](https://tauri.app/docs/) 或向项目维护者寻求帮助。

祝您构建顺利！

