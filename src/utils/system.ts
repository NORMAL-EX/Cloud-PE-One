import { invoke } from '@tauri-apps/api/core';

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
 * 检查网络连接状态。
 * 通过向特定 URL 发送 GET 请求来判断网络是否连接。
 * 如果请求成功且返回内容不为空，则认为网络已连接。
 * @returns {Promise<boolean>} 如果网络已连接返回 true，否则返回 false。
 */
export const checkNetworkConnection = async (): Promise<boolean> => {
  try {
    const response = await window.fetch('https://api.ce-ramos.cn/Hub/connecttest/');
    if (response.ok) {
      const text = await response.text();
      // 如果返回内容不为空，则视为已连接网络
      return text !== '';
    }
    return false;
  } catch (error) {
    console.error('网络连接检查失败:', error);
    return false;
  }
};