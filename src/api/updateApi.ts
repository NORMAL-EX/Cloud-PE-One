import axios from 'axios';

// 简单的内存缓存
const apiCache: Map<string, any> = new Map();

// 定义API返回的数据结构
export interface UpdateInfo {
  code: number;
  message: string;
  data: {
    cloud_pe: string;
    cloudpe_updata: string[];
    iso_version: string;
    iso_important_updata: string[];
    iso_second_version: string;
    iso_s_important_updata: string[];
    hub_version: string;
  };
  hub_new: {
    hub_ver: string;
    hub_tip: string;
    hub_tip_type: string;
    hub_updata_link: string;
    app_name_exe: string;
    log: {
      [version: string]: {
        can_skip: string;
        log: string;
        md5: string;
      };
    };
  };
}

// 获取更新信息的API
export const getUpdateInfo = async (): Promise<UpdateInfo> => {
  const url = 'https://api.ce-ramos.cn/GetInfo/';
  
  // 检查缓存
  if (apiCache.has(url)) {
    return apiCache.get(url);
  }
  
  try {
    const response = await axios.get<UpdateInfo>(url);
    // 缓存成功的响应
    apiCache.set(url, response.data);
    return response.data;
  } catch (error) {
    console.error('获取更新信息失败:', error);
    throw new Error('获取更新信息失败');
  }
};

// 比较版本号，判断是否需要更新
export const checkNeedsUpdate = (currentVersion: string, latestVersion: string): boolean => {
  // 移除版本号前的'v'字符
  const current = currentVersion.replace('v', '');
  const latest = latestVersion.replace('v', '');
  
  // 将版本号拆分为数字数组
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);
  
  // 比较版本号的每一部分
  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;
    
    if (latestPart > currentPart) {
      return true; // 需要更新
    } else if (latestPart < currentPart) {
      return false; // 不需要更新
    }
  }
  
  return false; // 版本相同，不需要更新
};

// 检查更新是否可跳过
export const isUpdateSkippable = (updateInfo: UpdateInfo): boolean => {
  const latestVersion = updateInfo.hub_new.hub_ver;
  const canSkip = updateInfo.hub_new.log[latestVersion]?.can_skip;
  
  return canSkip === 'true';
};

// 获取更新日志
export const getUpdateLog = (updateInfo: UpdateInfo): string => {
  const latestVersion = updateInfo.hub_new.hub_ver;
  return updateInfo.hub_new.log[latestVersion]?.log || '';
};

// 获取更新下载链接
export const getUpdateLink = (updateInfo: UpdateInfo): string => {
  return updateInfo.hub_new.hub_updata_link;
};

// 获取应用程序可执行文件名
export const getAppExecutableName = (updateInfo: UpdateInfo): string => {
  return updateInfo.hub_new.app_name_exe;
};