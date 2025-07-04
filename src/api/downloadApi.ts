// downloadApi.ts

import { invoke } from '@tauri-apps/api/core';
import { listen, Event } from '@tauri-apps/api/event'; // 导入Tauri事件模块
import React from 'react';

// 下载信息接口 (保持不变)
export interface DownloadInfo {
  progress: string;
  speed: string;
  downloading: boolean;
}

// 定义一个模块级变量来存储最新的下载状态
let latestDownloadInfo: DownloadInfo = {
  progress: "0%",
  speed: "0.00MB/s",
  downloading: false,
};

// 在模块加载时立即启动事件监听器
// 使用IIFE（立即调用函数表达式）来处理异步监听
(async () => {
  try {
    await listen<DownloadInfo>('download://progress', (event: Event<DownloadInfo>) => {
      // 当从后端接收到事件时，更新本地状态
      latestDownloadInfo = event.payload;
    });
    console.log("Successfully listening for 'download://progress' events.");
  } catch (e) {
    console.error("Failed to set up download progress listener:", e);
  }
})();


// 下载文件到指定路径 (保持不变)
export const downloadFileToPath = async (
  url: string,
  savePath: string,
  thread?: number
): Promise<string> => {
  try {
    // 前端调用签名不变，Tauri会自动处理AppHandle的注入
    return await invoke<string>("download_file_to_path", {
      url,
      savePath,
      thread: thread || 8,
    });
  } catch (error) {
    console.error("下载文件失败:", error);
    throw error;
  }
};

// 获取下载进度信息 - 这是实现兼容性的关键
export const getDownloadInfo = async (): Promise<DownloadInfo> => {
  // 不再使用fetch，而是直接返回由事件监听器更新的最新状态
  // 使用Promise.resolve来保持函数签名为异步，从而与旧版本完全兼容
  return Promise.resolve(latestDownloadInfo);
};


// 监听下载进度的钩子类 (保持不变)
// 它会通过调用新的 getDownloadInfo 来工作，因此无需修改
export class DownloadProgressListener {
  private intervalId: number | null = null;
  private callback: (info: DownloadInfo) => void;

  constructor(callback: (info: DownloadInfo) => void) {
    this.callback = callback;
  }

  start(): void {
    if (this.intervalId) {
      this.stop();
    }

    this.intervalId = window.setInterval(async () => {
      try {
        const info = await getDownloadInfo();
        this.callback(info);
      } catch (error) {
        console.error("监听下载进度失败:", error);
      }
    }, 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// React Hook 用于监听下载进度 (保持不变)
// 它依赖 DownloadProgressListener，因此也无需修改
export const useDownloadProgress = () => {
  const [downloadInfo, setDownloadInfo] = React.useState<DownloadInfo>({
    progress: "0%",
    speed: "0.00MB/s",
    downloading: false,
  });

  React.useEffect(() => {
    const listener = new DownloadProgressListener((info) => {
      setDownloadInfo(info);
    });

    listener.start();

    return () => {
      listener.stop();
    };
  }, []);

  return downloadInfo;
};