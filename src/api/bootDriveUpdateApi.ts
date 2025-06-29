// 启动盘升级相关API
import axios from 'axios';

interface BootDriveUpdateInfo {
  cloudPeVersion: string;
  cloudPeUpdateList: string[];
}

// 获取启动盘升级信息
export const getBootDriveUpdateInfo = async (): Promise<BootDriveUpdateInfo> => {
  try {
    const response = await axios.get('https://api.ce-ramos.cn/GetInfo/');
    
    if (response.data.code === 200) {
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

