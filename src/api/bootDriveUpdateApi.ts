// 启动盘升级相关API
import axios from 'axios';

// 简单的内存缓存
const apiCache: Map<string, any> = new Map();

interface BootDriveUpdateInfo {
  cloudPeVersion: string;
  cloudPeUpdateList: string[];
}

// 获取启动盘升级信息
export const getBootDriveUpdateInfo = async (): Promise<BootDriveUpdateInfo> => {
  const url = 'https://api.ce-ramos.cn/GetInfo/';
  
  // 检查缓存
  if (apiCache.has(url)) {
    const cachedData = apiCache.get(url);
    return {
      cloudPeVersion: cachedData.data.cloud_pe,
      cloudPeUpdateList: cachedData.data.cloudpe_updata || []
    };
  }
  
  try {
    const response = await axios.get(url);
    
    if (response.data.code === 200) {
      // 缓存成功的响应
      apiCache.set(url, response.data);
      return {
        cloudPeVersion: response.data.data.cloud_pe,
        cloudPeUpdateList: response.data.data.cloudpe_updata || []
      };
    } else {
      throw new Error(`API返回错误: ${response.data.message || '未知错误'}`);
    }
  } catch (error) {
    console.error('获取启动盘升级信息失败:', error);
    throw error;
  }
};

// 比较版本号
export const compareVersions = (currentVersion: string, latestVersion: string): boolean => {
  // 移除版本号前的 'v' 前缀
  const current = currentVersion.replace(/^v/, '');
  const latest = latestVersion.replace(/^v/, '');
  
  return current !== latest;
};