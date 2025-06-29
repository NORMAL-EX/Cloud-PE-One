import { invoke } from '@tauri-apps/api/core';
import React from 'react';

// 下载信息接口
export interface DownloadInfo {
  progress: string;
  speed: string;
  downloading: boolean;
}

// 下载文件到指定路径
export const downloadFileToPath = async (
  url: string,
  savePath: string,
  thread?: number
): Promise<string> => {
  try {
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

// 获取下载进度信息
export const getDownloadInfo = async (): Promise<DownloadInfo> => {
  try {
    const response = await fetch('http://127.0.0.1:3458/getDownloaderInfo');
    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("获取下载信息失败:", error);
    // 返回默认值
    return {
      progress: "0%",
      speed: "0.00MB/s",
      downloading: false,
    };
  }
};

// 监听下载进度的钩子类
export class DownloadProgressListener {
  private intervalId: number | null = null;
  private callback: (info: DownloadInfo) => void;

  constructor(callback: (info: DownloadInfo) => void) {
    this.callback = callback;
  }

  // 开始监听
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

  // 停止监听
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// React Hook 用于监听下载进度
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