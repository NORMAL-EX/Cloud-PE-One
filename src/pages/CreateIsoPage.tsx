import React, { useState, useEffect, useRef } from 'react';
import { 
  Typography, 
  Button, 
  Progress, 
  Notification 
} from '@douyinfe/semi-ui';
import { IconDownload, IconDisc, IconGlobeStroke} from '@douyinfe/semi-icons';
import { getIsoDownloadLink } from '../api/isoApi';
import { saveFileDialog } from '../utils/tauriApiWrapper';
import { downloadFileToPath, getDownloadInfo, DownloadInfo } from '../api/downloadApi';
import { useAppContext } from '../utils/AppContext';

const { Title, Text } = Typography;

const CreateIsoPage: React.FC = () => {
  const { config, setIsGeneratingIso } = useAppContext();
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo>({
    progress: "0%",
    speed: "0.00MB/s",
    downloading: false,
  });
  const [savePath, setSavePath] = useState<string>('');
  const downloadStartedRef = useRef<boolean>(false); // 用于标记下载是否真正开始
  const monitoringRef = useRef<boolean>(false); // 用于标记是否正在监听

  // 监听下载进度
  useEffect(() => {
    let intervalId: number | null = null;

    const startMonitoring = () => {
      if (monitoringRef.current) return; // 防止重复监听
      
      console.log('开始监听下载进度...');
      monitoringRef.current = true;
      intervalId = window.setInterval(async () => {
        try {
          const info = await getDownloadInfo();
          console.log('下载信息:', info);
          setDownloadInfo(info);
          
          // 如果下载完成，停止监听
          if (!info.downloading && downloading && downloadStartedRef.current) {
            console.log('下载完成，停止监听');
            setDownloading(false);
            downloadStartedRef.current = false;
            monitoringRef.current = false;
            
            // 通知AppContext下载完成
            setIsGeneratingIso(false);
            
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            
            Notification.success({
              title: '镜像生成成功！',
              content: `生成镜像已保存至：${savePath}`,
              duration: 5
            });
          }
        } catch (error) {
          console.error("获取下载信息失败:", error);
        }
      }, 1000);
    };

    // 只有在真正开始下载时才启动监听
    if (downloading && downloadStartedRef.current) {
      startMonitoring();
    } else if (!downloading && monitoringRef.current) {
      // 如果下载状态变为false，停止监听
      console.log('下载状态变为false，停止监听');
      monitoringRef.current = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (!downloading) {
        monitoringRef.current = false;
      }
    };
  }, [downloading, downloadStartedRef.current, savePath, setIsGeneratingIso]);

  // 处理窗口关闭和页面切换事件
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (downloading) {
        e.preventDefault();
        e.returnValue = '当前正在生成ISO镜像，确定要离开吗？';
        return e.returnValue;
      }
    };

    // 监听页面切换事件
    const handleRouteChange = (e: Event) => {
      if (downloading) {
        e.preventDefault();
        e.stopPropagation();
        
        // 显示禁止切换页面的通知
        Notification.warning({
          title: '禁止切换页面',
          content: '当前正在生成ISO镜像，请等待完成后再切换页面',
          duration: 3
        });
        
        return false;
      }
    };
    
    // 监听浏览器关闭事件
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // 获取所有链接并添加事件监听
    const links = document.querySelectorAll('a');
    links.forEach(link => {
      link.addEventListener('click', handleRouteChange);
    });

    // 监听浏览器前进后退按钮
    const handlePopState = (e: PopStateEvent) => {
      if (downloading) {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        
        Notification.warning({
          title: '禁止切换页面',
          content: '当前正在生成ISO镜像，请等待完成后再切换页面',
          duration: 3
        });
      }
    };
    
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      links.forEach(link => {
        link.removeEventListener('click', handleRouteChange);
      });
    };
  }, [downloading]);

  // 获取进度百分比数值
  const getProgressPercent = (): number => {
    const match = downloadInfo.progress.match(/(\d+)%/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const handleStartGenerate = async () => {
    if (downloading) {
      Notification.warning({
        title: '提示',
        content: '已有下载任务在进行中',
      });
      return;
    }

    try {
      console.log('开始生成ISO镜像...');
      
      // 打开文件保存对话框
      console.log('打开文件保存对话框...');
      let filePath: string | null = null;
      
      try {
        filePath = await saveFileDialog('Cloud-PE.iso');
        console.log('文件保存路径:', filePath);
      } catch (dialogError) {
        console.error('文件保存对话框出错:', dialogError);
        Notification.error({
          title: '操作失败',
          content: '无法打开文件保存对话框',
          duration: 3
        });
        return;
      }
      
      if (!filePath) {
        console.log('用户取消了文件保存');
        return;
      }

      console.log('开始下载流程...');
      
      // 获取下载链接
      console.log('获取下载链接...');
      let downloadLink: string;
      try {
        downloadLink = await getIsoDownloadLink();
        console.log('下载链接获取成功:', downloadLink);
      } catch (linkError) {
        console.error('获取下载链接失败:', linkError);
        // 重置所有状态，不要设置下载状态
        setSavePath('');
        setDownloadInfo({
          progress: "0%",
          speed: "0.00MB/s",
          downloading: false,
        });
        
        Notification.error({
          title: '获取下载链接失败',
          content: '无法获取ISO镜像下载链接，请检查网络连接',
          duration: 3
        });
        return;
      }

      // 只有成功获取下载链接后才设置下载状态
      setDownloading(true);
      setSavePath(filePath);
      setDownloadInfo({
        progress: "0%",
        speed: "0.00MB/s",
        downloading: true,
      });

      // 通知AppContext开始下载
      setIsGeneratingIso(true);

      // 开始下载
      console.log('开始下载文件...');
      try {
        // 先显示下载开始通知
        Notification.info({
          title: '开始生成ISO镜像',
          content: '镜像生成任务已在后台运行',
          duration: 3
        });
        
        // 标记下载真正开始，这会触发useEffect开始监听
        downloadStartedRef.current = true;
        
        // 使用 downloadApi 中的 downloadFileToPath
        await downloadFileToPath(
          downloadLink,
          filePath,
          config.downloadThreads // 使用设置的线程数目
        );
        
      } catch (downloadError) {
        console.error('下载文件失败:', downloadError);
        // 重置所有状态
        setDownloading(false);
        downloadStartedRef.current = false;
        monitoringRef.current = false;
        setSavePath('');
        setDownloadInfo({
          progress: "0%",
          speed: "0.00MB/s",
          downloading: false,
        });
        
        // 通知AppContext下载失败
        setIsGeneratingIso(false);
        
        Notification.error({
          title: '下载失败',
          content: downloadError instanceof Error ? downloadError.message : '下载ISO镜像时发生错误',
          duration: 3
        });
      }

    } catch (error) {
      console.error('生成ISO镜像失败 - 未预期的错误:', error);
      // 重置所有状态
      setDownloading(false);
      downloadStartedRef.current = false;
      monitoringRef.current = false;
      setSavePath('');
      setDownloadInfo({
        progress: "0%",
        speed: "0.00MB/s",
        downloading: false,
      });
      
      // 通知AppContext下载失败
      setIsGeneratingIso(false);
      
      Notification.error({
        title: '生成失败',
        content: '生成ISO镜像时发生未知错误，请重试',
        duration: 3
      });
    }
  };

  if (downloading) {
    return (
      <div style={{ 
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '0 24px',
        boxSizing: 'border-box',
        marginTop: 100
      }}>
        <IconGlobeStroke style={{ color: 'var(--semi-color-info)', fontSize: 66, marginBottom: 24 }}/>
        <Title heading={2} style={{ marginBottom: 32, textAlign: 'center' }}>正在生成ISO镜像</Title>
        
        <div style={{ width: '100%', maxWidth: 400, marginBottom: 24 }}>
          <Progress 
            percent={getProgressPercent()} 
            showInfo={true}
            strokeWidth={8}
            format={percent => `${percent.toFixed(1)}%`}
          />
        </div>
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          width: '100%', 
          maxWidth: 400,
          marginTop: 16
        }}>
          <Text type="tertiary" strong>
            下载速度: {downloadInfo.speed}
          </Text>
          <Text type="tertiary" strong>
            状态: {downloadInfo.downloading ? '下载中' : '完成'}
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflow: 'hidden',
      padding: '0 24px',
      boxSizing: 'border-box',
      marginTop: 100
    }}>
      <IconDisc style={{ color: 'var(--semi-color-info)', fontSize: 66, marginBottom: 24 }}/>

      <Title heading={2} style={{ marginBottom: 32, textAlign: 'center' }}>生成ISO镜像</Title>
      <Button 
        type="primary"
        icon={<IconDownload />}
        onClick={handleStartGenerate}
      >
        开始生成
      </Button>
    </div>
  );
};

export default CreateIsoPage;