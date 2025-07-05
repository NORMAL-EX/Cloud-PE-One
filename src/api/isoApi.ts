// ISO镜像生成相关API
import axios from 'axios';

// 简单的内存缓存
const apiCache: Map<string, any> = new Map();

// 获取ISO下载链接
export const getIsoDownloadLink = async (): Promise<string> => {
  const url = 'https://api.ce-ramos.cn/GetInfo/?m=1';
  
  // 检查缓存
  if (apiCache.has(url)) {
    return apiCache.get(url).down_link;
  }
  
  try {
    const response = await axios.get(url);
    
    if (response.data.code === 200) {
      // 缓存成功的响应
      apiCache.set(url, response.data);
      return response.data.down_link;
    } else {
      throw new Error(`API返回错误: ${response.data.msg || '未知错误'}`);
    }
  } catch (error) {
    console.error('获取ISO下载链接失败:', error);
    throw error;
  }
};