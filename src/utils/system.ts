import { invoke } from '@tauri-apps/api/core';

// 简单的内存缓存
const apiCache: Map<string, any> = new Map();

// 检查启动盘
export interface DriveInfo {
  letter: string;
  isBootDrive: boolean;
}

export const checkBootDrive = async (): Promise<DriveInfo | null> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await invoke('check_boot_drive') as any;
    if (result) {
      // 转换字段名称以匹配前端接口
      return {
        letter: result.letter,
        isBootDrive: result.is_boot_drive
      };
    }
    return null;
  } catch (error) {
    console.error('启动盘检查失败:', error);
    return null;
  }
};

// 获取所有驱动器
export const getAllDrives = async (): Promise<string[]> => {
  try {
    return await invoke('get_all_drives') as string[];
  } catch (error) {
    console.error('获取驱动器列表失败:', error);
    return [];
  }
};

// 退出应用
export const exitApp = async (): Promise<void> => {
  try {
    await invoke('exit_app');
  } catch (error) {
    console.error('退出应用失败:', error);
  }
};

// 打开开发者工具
export const openDevTools = async (): Promise<void> => {
  try {
    await invoke('open_devtools');
  } catch (error) {
    console.error('打开开发者工具失败:', error);
  }
};

/**
 * 检查网络连接状态
 * 通过向可靠的网络检测端点发送请求来判断网络连接状态
 * @param timeout - 请求超时时间（毫秒），默认 5000ms
 * @returns 如果网络已连接返回 true，否则返回 false
 */
export const checkNetworkConnection = async (timeout: number = 5000): Promise<boolean> => {
  const cacheKey = 'network_connection';
  
  // 检查缓存，如果已经检测成功过，直接返回true
  if (apiCache.has(cacheKey)) {
    return true;
  }
  
  const testUrl = 'https://api.ce-ramos.cn/Hub/connecttest/';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await window.fetch(testUrl, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // 检查响应状态和内容
    if (response.ok) {
      const text = await response.text();
      if (text.trim() !== '') {
        // 网络检测成功，缓存结果为true
        apiCache.set(cacheKey, true);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('网络检测超时');
    } else {
      console.warn('网络检测失败:', error);
    }
    return false;
  }
};