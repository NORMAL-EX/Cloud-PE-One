// src/api/pluginsApi.ts
import axios from 'axios';
import { invoke } from '@tauri-apps/api/core';

// 插件信息接口
export interface Plugin {
  name: string;
  size: string;
  version: string;
  author: string;
  describe: string;
  file: string;
  link: string;
}

// 插件分类接口
export interface PluginCategory {
  class: string;
  list: Plugin[];
}

// 插件API响应接口
export interface PluginsResponse {
  code: number;
  message: string;
  data: PluginCategory[];
}

// 获取插件列表
export const getPlugins = async (): Promise<PluginCategory[]> => {
  try {
    const response = await axios.get<PluginsResponse>('https://api.ce-ramos.cn/GetPlugins/');
    return response.data.data;
  } catch (error) {
    console.error('获取插件列表失败:', error);
    throw new Error('获取插件列表失败');
  }
};

// 下载插件
export const downloadPlugin = async (
  url: string,
  fileName: string,
  bootDriveLetter: string | null, // 新增启动盘盘符参数
  threads: number = 8
): Promise<string> => {
  try {
    // 构建下载路径 - 使用启动盘盘符 + \ce-apps
    const downloadPath = `${bootDriveLetter}\\ce-apps`; // 后备路径
    
    console.log('下载路径:', downloadPath);
    console.log('开始下载插件:', { url, fileName, downloadPath, threads });

    // 开始下载，传递线程数
    const filePath = await invoke('download_plugin', {
      url,
      path: downloadPath,
      fileName,
      threads
    });
    
    return filePath as string;
  } catch (error) {
    console.error('下载插件失败:', error);
    throw new Error(`下载插件失败: ${error}`);
  }
};

// 获取插件文件列表
export const getPluginFiles = async (driveLetter: string): Promise<{enabled: Plugin[], disabled: Plugin[]}> => {
  try {
    const result = await invoke('get_plugin_files', {
      driveLetter
    }) as {
      enabled: Plugin[],
      disabled: Plugin[]
    };
    
    return result;
  } catch (error) {
    console.error('获取插件文件列表失败:', error);
    throw new Error('获取插件文件列表失败');
  }
};

// 启用插件
export const enablePlugin = async (driveLetter: string, fileName: string): Promise<boolean> => {
  try {
    const result = await invoke('enable_plugin', {
      driveLetter,
      fileName
    }) as boolean;
    
    return result;
  } catch (error) {
    console.error('启用插件失败:', error);
    throw new Error('启用插件失败');
  }
};

// 禁用插件
export const disablePlugin = async (driveLetter: string, fileName: string): Promise<boolean> => {
  try {
    const result = await invoke('disable_plugin', {
      driveLetter,
      fileName
    }) as boolean;
    
    return result;
  } catch (error) {
    console.error('禁用插件失败:', error);
    throw new Error('禁用插件失败');
  }
};