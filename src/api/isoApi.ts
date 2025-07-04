// ISO镜像生成相关API
import axios from 'axios';

// 获取ISO下载链接
export const getIsoDownloadLink = async (): Promise<string> => {
  try {
    const response = await axios.get('https://api.ce-ramos.cn/GetInfo/?m=1');
    
    if (response.data.code === 200) {
      return response.data.down_link;
    } else {
      throw new Error(`API返回错误: ${response.data.msg || '未知错误'}`);
    }
  } catch (error) {
    console.error('获取ISO下载链接失败:', error);
    throw error;
  }
};