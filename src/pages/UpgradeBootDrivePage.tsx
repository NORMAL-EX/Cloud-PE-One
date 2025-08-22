import React, { useState, useEffect, useRef } from 'react';
import { 
  Typography, 
  Button, 
  Progress,
  Notification 
} from '@douyinfe/semi-ui';
import { 
  IconGlobeStroke, 
  IconTickCircle,
  IconPlay
} from '@douyinfe/semi-icons';
import { invoke } from '@tauri-apps/api/core';
import { useAppContext } from '../utils/AppContext';
import { cacheService } from '../utils/cacheService';
import { downloadFileToPath, getDownloadInfo, DownloadInfo } from '../api/downloadApi';

const { Title, Text } = Typography;

interface UpgradeBootDrivePageProps {
  onNavigate: (page: string) => void;
}

const UpgradeBootDrivePage: React.FC<UpgradeBootDrivePageProps> = ({ onNavigate }) => {
  const { config, setIsUpgradingBootDrive, reloadBootDrive, bootDrive } = useAppContext();
  const [isDeploying, setIsDeploying] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo>({
    progress: "0%",
    speed: "0.00MB/s",
    downloading: false,
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const downloadStartedRef = useRef<boolean>(false);
  const monitoringRef = useRef<boolean>(false);

  // 使用官方 Tauri API 调用函数
  const safeTauriInvoke = async (command: string, args?: any): Promise<any> => {
    try {
      console.log(`调用 Tauri 命令: ${command}`, args);
      const result = await invoke(command, args || {});
      console.log(`命令 ${command} 执行结果:`, result);
      return result;
    } catch (error) {
      console.error(`命令 ${command} 执行失败:`, error);
      throw error;
    }
  };

  // 监听下载进度
  useEffect(() => {
    let intervalId: number | null = null;

    const startMonitoring = () => {
      if (monitoringRef.current) return;
      
      console.log('开始监听下载进度...');
      monitoringRef.current = true;
      intervalId = window.setInterval(async () => {
        try {
          const info = await getDownloadInfo();
          console.log('下载信息:', info);
          setDownloadInfo(info);
          
          if (!info.downloading && isDeploying && downloadStartedRef.current) {
            console.log('下载完成，停止监听');
            downloadStartedRef.current = false;
            monitoringRef.current = false;
            
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            
            await performDeploy();
          }
        } catch (error) {
          console.error("获取下载信息失败:", error);
        }
      }, 1000);
    };

    if (isDeploying && downloadStartedRef.current) {
      startMonitoring();
    } else if (!isDeploying && monitoringRef.current) {
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
      if (!isDeploying) {
        monitoringRef.current = false;
      }
    };
  }, [isDeploying, downloadStartedRef.current]);

  // 获取进度百分比数值
  const getProgressPercent = (): number => {
    const match = downloadInfo.progress.match(/(\d+)%/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const handleStartUpgrade = async () => {
    if (!bootDrive?.letter) {
      Notification.error({
        title: '错误',
        content: '未检测到启动盘，请确保启动盘已正确连接',
        duration: 5
      });
      return;
    }

    setIsDeploying(true);
    setIsUpgradingBootDrive(true);

    try {
      console.log('开始升级流程...');
      console.log('使用驱动器:', bootDrive.letter);
      
      // 从缓存获取下载链接
      const downloadLink = cacheService.getIsoDownloadLink();
      
      if (!downloadLink) {
        console.error('缓存中没有下载链接');
        setIsDeploying(false);
        setIsUpgradingBootDrive(false);
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

      const downloadPath = bootDrive.letter + "\\Cloud-PE.iso";
      console.log('下载路径:', downloadPath);

      setDownloadInfo({
        progress: "0%",
        speed: "0.00MB/s",
        downloading: true,
      });

      console.log('开始下载文件...');
      try {
        Notification.info({
          title: '开始升级Cloud-PE',
          content: `正在下载Cloud-PE镜像到 ${bootDrive.letter} 驱动器`,
          duration: 3
        });
        
        downloadStartedRef.current = true;
        
        await downloadFileToPath(
          downloadLink,
          downloadPath,
          config.downloadThreads
        );
        
      } catch (downloadError) {
        console.error('下载文件失败:', downloadError);
        setIsDeploying(false);
        setIsUpgradingBootDrive(false);
        downloadStartedRef.current = false;
        monitoringRef.current = false;
        setDownloadInfo({
          progress: "0%",
          speed: "0.00MB/s",
          downloading: false,
        });
        
        Notification.error({
          title: '下载失败',
          content: downloadError instanceof Error ? downloadError.message : '下载ISO镜像时发生错误',
          duration: 3
        });
      }

    } catch (error) {
      console.error('升级失败 - 未预期的错误:', error);
      setIsDeploying(false);
      setIsUpgradingBootDrive(false);
      downloadStartedRef.current = false;
      monitoringRef.current = false;
      setDownloadInfo({
        progress: "0%",
        speed: "0.00MB/s",
        downloading: false,
      });
      
      Notification.error({
        title: '升级失败',
        content: '升级过程中发生未知错误，请重试',
        duration: 3
      });
    }
  };

  const performDeploy = async () => {
    try {
      const result = await safeTauriInvoke('deploy_to_usb', {
        driveLetter: bootDrive?.letter
      });
      
      setIsDeploying(false);
      setIsCompleted(true);
      setIsUpgradingBootDrive(false);
      
      Notification.success({
        title: '升级成功',
        content: result.message || '启动盘升级完成！',
        duration: 5
      });
    } catch (error) {
      console.error('部署失败:', error);
      setIsDeploying(false);
      setIsUpgradingBootDrive(false);
      
      Notification.error({
        title: '升级失败',
        content: `启动盘升级过程中发生错误: ${error}`,
        duration: 5
      });
    }
  };

  const handleNavigateHome = () => {
    try {
      if (bootDrive?.letter) {
        reloadBootDrive(bootDrive.letter);
      }
      onNavigate('home');
    } catch (error) {
      console.error('导航到主页失败:', error);
      Notification.error({
        title: '导航失败',
        content: '无法返回主页，请重试',
        duration: 3
      });
    }
  };

  // 完成页面
  if (isCompleted) {
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
        <IconTickCircle style={{ color: 'var(--semi-color-success)', fontSize: 66, marginBottom: 24 }}/>
        <Title heading={2} style={{ marginBottom: 32, textAlign: 'center' }}>升级成功</Title>
        <div style={{ display: 'flex', gap: 16 }}>
          <Button 
            type="primary"
            onClick={handleNavigateHome}
          >
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  // 升级进行中页面
  if (isDeploying) {
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
        <Title heading={2} style={{ marginBottom: 32, textAlign: 'center' }}>升级中</Title>
        
        <div style={{ width: '100%', maxWidth: 400, marginBottom: 16 }}>
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
            状态: {downloadInfo.downloading ? '下载中' : '部署中'}
          </Text>
        </div>
      </div>
    );
  }

  // 初始页面
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
      <IconPlay style={{ color: 'var(--semi-color-success)', fontSize: 66, marginBottom: 24 }}/>
      <Title heading={2} style={{ marginBottom: 16, textAlign: 'center' }}>升级启动盘</Title>
      
      {!bootDrive?.letter && (
        <Text type="warning" style={{ marginBottom: 32, textAlign: 'center' }}>
          未检测到启动盘，请确保启动盘已正确连接
        </Text>
      )}
      
      <Button 
        type="primary"
        onClick={handleStartUpgrade}
        disabled={!bootDrive?.letter}
      >
        立即升级
      </Button>
    </div>
  );
};

export default UpgradeBootDrivePage;