// ISO镜像生成相关API
import axios from 'axios';
import { downloadFileToPath } from '../utils/tauriApiWrapper';

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

// 下载文件（使用Tauri的下载功能）
export const downloadFile = async (
  url: string,
  savePath: string,
  onProgress: (progress: number, speed: string) => void
): Promise<void> => {
  try {
    // 模拟下载进度（在实际应用中，这应该从Tauri后端获取真实进度）
    const progressInterval = setInterval(() => {
      const progress = Math.min(100, Math.random() * 100);
      const speed = (Math.random() * 10 + 1).toFixed(2);
      onProgress(progress, speed);
    }, 200);

    // 调用Tauri下载函数
    await downloadFileToPath(url, savePath);
    
    // 清除进度更新
    clearInterval(progressInterval);
    
    // 确保进度显示为100%
    onProgress(100, '0.00');
  } catch (error) {
    console.error('下载文件失败:', error);
    throw error;
  }
};

