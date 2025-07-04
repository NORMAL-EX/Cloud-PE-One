# Cloud-PE-One

> [!CAUTION]
> 由于Cloud-PE项目还处于开发期且Cloud-PE.CN尚未完成备案，所以该软件暂时使用的是CE-RAMOS API，数据信息也全部都为CE-RAMOS，我们将会在2025.9.1前修复这些问题并发布Cloud-PE One正式版

# 介绍
Cloud-PE 的全新客户端（软件整体已完成开发）

![Tauri](https://img.shields.io/badge/Tauri-191970?style=for-the-badge&logo=Tauri&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-%23323330.svg?style=for-the-badge&logo=TypeScript&logoColor=%23F7DF1E)
![Vite](https://img.shields.io/badge/Vite-%2335495e.svg?style=for-the-badge&logo=Vite&logoColor=%916CFE)
![React](https://img.shields.io/badge/React-%2335495e.svg?style=for-the-badge&logo=React&logoColor=%234FC08D)
![Semi Design](https://img.shields.io/badge/-SemiDesign-%230170FE?style=for-the-badge&logo=Semi-Design&logoColor=white)

![App](https://p1.ce-ramos.cn/cloud-pe-one.png)
# 使用
包管理器：npm

# 开发服务器
```batch
rem 启动渲染进程调试
npm run dev 

rem 启动主进程调试
npm run tauri:dev

rem 一键启动
cmd /c "start npm run tauri:dev"
```

## 构建
直接输出二进制可执行文件
```batch
npm run tauri build
```

## 许可证
Cloud-PE One 的自编代码基于 Apache 2.0 许可证开源。
