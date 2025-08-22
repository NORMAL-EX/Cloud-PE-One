import React, { useState, useEffect, useRef } from 'react';
import { 
  Typography, 
  Button, 
  Steps, 
  Select, 
  Progress,
  Notification,
  Modal,
  Spin,
  RadioGroup,
  Radio
} from '@douyinfe/semi-ui';
import { 
  IconRefresh, 
  IconGlobeStroke, 
  IconTickCircle,
  IconPlay
} from '@douyinfe/semi-icons';
import { invoke } from '@tauri-apps/api/core';
import { useAppContext } from '../utils/AppContext';
import { getIsoDownloadLink } from '../api/isoApi';
import { downloadFileToPath, getDownloadInfo, DownloadInfo } from '../api/downloadApi';

const { Title, Text } = Typography;
const { Step } = Steps;

interface UsbDevice {
  phydrive: number;
  name: string;
  skipSelect: boolean;
}

interface CreateUsbPageProps {
  onNavigate: (page: string) => void;
}

const CreateUsbPage: React.FC<CreateUsbPageProps> = ({ onNavigate }) => {
  const { config, setIsCreatingBootDrive, reloadBootDrive } = useAppContext();
  const [currentStep, setCurrentStep] = useState(0); // 0: 初始, 1: 选择设备, 2: 部署
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number | undefined>(undefined);
  const [bootMode, setBootMode] = useState<string>('UEFI');
  const [downloading, setDownloading] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [selectedDrive, setSelectedDrive] = useState<string>('');
  const [isInstallingVentoy, setIsInstallingVentoy] = useState(false);
  const [isInDeploymentProcess, setIsInDeploymentProcess] = useState(false); // 新增状态
  
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo>({
    progress: "0%",
    speed: "0.00MB/s",
    downloading: false,
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // 使用 ref 来存储最新的状态，避免闭包问题
  const downloadingRef = useRef<boolean>(false);
  const completeHandledRef = useRef<boolean>(false);
  const maxProgressRef = useRef<number>(0);
  
  // 添加一个key来强制刷新Select组件
  const [selectKey, setSelectKey] = useState(0);

  // 更新 ref 当状态改变时
  useEffect(() => {
    downloadingRef.current = downloading;
  }, [downloading]);

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

  // 取消下载的函数
  const cancelDownload = async () => {
    try {
      console.log('取消下载任务...');
      // 调用后端取消下载的API
      await safeTauriInvoke('cancel_download');
      
      // 重置所有下载相关状态
      setDownloading(false);
      setIsDeploying(false);
      setIsInDeploymentProcess(false);
      downloadingRef.current = false;
      completeHandledRef.current = false;
      maxProgressRef.current = 0;
      setDownloadInfo({
        progress: "0%",
        speed: "0.00MB/s",
        downloading: false,
      });
    } catch (error) {
      console.error('取消下载失败:', error);
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 组件卸载时取消下载
      if (downloadingRef.current) {
        cancelDownload();
      }
    };
  }, []);

  // 单一的轮询 effect，处理所有逻辑
  useEffect(() => {
    if (!downloading) {
      completeHandledRef.current = false;
      maxProgressRef.current = 0;
      return;
    }

    let intervalId: number | null = null;
    
    const checkProgress = async () => {
      try {
        const info = await getDownloadInfo();
        console.log('轮询获取到的信息:', info);
        
        // 解析当前进度
        const progressMatch = info.progress.match(/(\d+(?:\.\d+)?)/);
        const currentProgress = progressMatch ? parseFloat(progressMatch[1]) : 0;
        
        // 确保进度不会倒退
        if (currentProgress >= maxProgressRef.current) {
          maxProgressRef.current = currentProgress;
          setDownloadInfo(info);
        } else {
          // 如果新进度小于最大进度，保持最大进度但更新其他信息
          setDownloadInfo({
            ...info,
            progress: `${maxProgressRef.current.toFixed(1)}%`
          });
        }
        
        // 检查是否完成
        if (!completeHandledRef.current && 
            info.progress === "100%" && 
            !info.downloading && 
            downloadingRef.current) {
          
          console.log('检测到下载完成，执行完成逻辑');
          completeHandledRef.current = true; // 防止重复执行
          
          // 清除定时器
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          
          // 执行完成逻辑
          setTimeout(() => {
            setDownloading(false);
            setIsDeploying(true);
            performDeploy();
          }, 100);
        }
      } catch (error) {
        console.error("获取下载信息失败:", error);
      }
    };

    // 立即执行一次
    checkProgress();
    
    // 设置定时器
    intervalId = window.setInterval(checkProgress, 500);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [downloading]);

  // 获取USB设备列表
  const getUsbDevices = async (): Promise<UsbDevice[]> => {
    try {
      setIsLoading(true);
      const devices = await safeTauriInvoke('get_usb_devices');
      console.log('获取到USB设备:', devices);
      return Array.isArray(devices) ? devices : [];
    } catch (error) {
      console.error('获取USB设备列表失败:', error);
      Notification.error({
        title: '错误',
        content: `获取USB设备列表失败: ${error}`,
        duration: 5
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // 获取系统引导方式
  const getSystemBootMode = async () => {
    try {
      const mode = await safeTauriInvoke('get_system_boot_mode');
      console.log('系统引导方式:', mode);
      setBootMode(mode);
    } catch (error) {
      console.error('获取系统引导方式失败:', error);
      // 默认使用UEFI
      setBootMode('UEFI');
    }
  };

  // 刷新设备列表
  const refreshDevices = async () => {
    try {
      const deviceList = await getUsbDevices();
      setDevices(deviceList);
      
      // 强制刷新Select组件
      setSelectKey(prevKey => prevKey + 1);
      
      // 检查当前选中的设备是否还存在于新列表中
      if (selectedDevice !== undefined) {
        const deviceStillExists = deviceList.some(d => d.phydrive === selectedDevice);
        if (!deviceStillExists) {
          // 如果当前选中的设备不存在了，清空选择
          setSelectedDevice(undefined);
        }
      }
      
      if (deviceList.length === 0) {
        Notification.warning({
          title: '提示',
          content: '未检测到任何USB设备，请确保U盘已正确连接',
          duration: 4
        });
      }
    } catch (error) {
      console.error('刷新设备列表失败:', error);
    }
  };

  // 初始化时获取系统引导方式
  useEffect(() => {
    if (currentStep === 1) {
      getSystemBootMode();
    }
  }, [currentStep]);

  // 监听选中设备的skipSelect属性
  const selectedDeviceInfo = devices.find(d => d.phydrive === selectedDevice);
  const shouldShowBootMode = !selectedDeviceInfo?.skipSelect;

  const handleStartCreate = async () => {
    // 在开始新的制作流程前，先取消可能存在的下载任务
    if (downloadingRef.current || isDeploying) {
      await cancelDownload();
    }
    
    // 重置所有状态
    setIsCompleted(false);
    setCurrentStep(1);
    setIsCreatingBootDrive(true);
    setIsInDeploymentProcess(false);
    await refreshDevices();
  };

  // 获取进度百分比数值
  const getProgressPercent = (): number => {
    const match = downloadInfo.progress.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  };

  const handleDeploy = async () => {
    if (selectedDevice === undefined) {
      Notification.warning({
        title: '提示',
        content: '请先选择一个设备',
        duration: 3
      });
      return;
    }

    const selectedDeviceInfo = devices.find(d => d.phydrive === selectedDevice);
    if (!selectedDeviceInfo) return;

    // 如果设备需要警告（skipSelect为false）
    if (!selectedDeviceInfo.skipSelect) {
      Modal.warning({
        title: '警告',
        content: '这个操作将使您U盘内所有的数据被清空，确定要继续吗？',
        okButtonProps: { theme: 'solid', type: 'danger' },
        onOk: () => {
          Modal.warning({
            title: '警告',
            content: '确认要继续执行这个操作吗？（防误触）',
            okButtonProps: { theme: 'solid', type: 'danger' },
            onOk: () => {
              startDeployment();
            }
          });
        }
      });
    } else {
      // skipSelect为true时直接开始部署
      startDeployment();
    }
  };

  const startDeployment = async () => {
    if (downloading) {
      Notification.warning({
        title: '提示',
        content: '已有下载任务在进行中',
      });
      return;
    }

    // 在开始新的部署前，先确保清理旧的下载状态
    await cancelDownload();

    setCurrentStep(2);
    setIsInDeploymentProcess(true); // 设置部署流程标志

    try {
      console.log('开始部署流程...');
      console.log('选择的设备 phydrive:', selectedDevice);
      
      const selectedDeviceInfo = devices.find(d => d.phydrive === selectedDevice);
      
      // 如果不是Ventoy设备，先安装Ventoy
      if (!selectedDeviceInfo?.skipSelect) {
        setIsInstallingVentoy(true);
        
        try {
          console.log('开始安装Ventoy...');
          console.log('引导方式:', bootMode);
          
          // 调用后端安装Ventoy
          await safeTauriInvoke('install_ventoy', {
            physicalDrive: selectedDevice,
            bootMode: bootMode
          });
          
          console.log('Ventoy安装完成');
          setIsInstallingVentoy(false);
          
          // 等待系统识别新的分区
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // 重新扫描设备
          const latestDevices = await getUsbDevices();
          setDevices(latestDevices);
          
        } catch (ventoyError) {
          console.error('Ventoy安装失败:', ventoyError);
          setIsInstallingVentoy(false);
          setIsInDeploymentProcess(false);
          setIsCreatingBootDrive(false);
          
          Notification.error({
            title: 'Ventoy安装失败',
            content: `无法安装Ventoy: ${ventoyError}`,
            duration: 5
          });
          return;
        }
      }
      
      // 继续部署流程
      console.log('获取下载链接...');
      let downloadLink: string;
      try {
        // 这里直接调用API获取最新的下载链接，不使用缓存
        downloadLink = await getIsoDownloadLink();
        console.log('下载链接获取成功:', downloadLink);
      } catch (linkError) {
        console.error('获取下载链接失败:', linkError);
        setIsInDeploymentProcess(false);
        setIsCreatingBootDrive(false);
        
        Notification.error({
          title: '获取下载链接失败',
          content: '无法获取ISO镜像下载链接，请检查网络连接',
          duration: 3
        });
        return;
      }

      // 根据设备类型设置下载路径
      let downloadPath: string = "";
      let driveLetter: string = '';

      // 重新获取最新的设备信息
      const currentDevices = devices.length > 0 ? devices : await getUsbDevices();
      const currentDeviceInfo = currentDevices.find(d => d.phydrive === selectedDevice);
      
      // 尝试获取设备的驱动器号
      if (currentDeviceInfo) {
        const driveMatch = currentDeviceInfo.name.match(/^([A-Z]:)/);
        if (driveMatch) {
          driveLetter = driveMatch[1];
          downloadPath = `${driveLetter}\\Cloud-PE.iso`;
          console.log('设备下载路径:', downloadPath);
        }
      }
      
      // 如果还是找不到驱动器，使用默认值
      if (!downloadPath) {
        // 对于刚安装Ventoy的设备，可能需要更多时间
        if (!selectedDeviceInfo?.skipSelect) {
          // 再等待一下并重试
          await new Promise(resolve => setTimeout(resolve, 2000));
          const retryDevices = await getUsbDevices();
          const retryDeviceInfo = retryDevices.find(d => d.phydrive === selectedDevice);
          
          if (retryDeviceInfo) {
            const driveMatch = retryDeviceInfo.name.match(/^([A-Z]:)/);
            if (driveMatch) {
              driveLetter = driveMatch[1];
              downloadPath = `${driveLetter}\\Cloud-PE.iso`;
              console.log('重试后获取到下载路径:', downloadPath);
            }
          }
        }
        
        // 如果仍然没有找到，使用默认路径
        if (!downloadPath) {
          setIsInDeploymentProcess(false);
          Modal.error({
            title: '错误',
            content: '软件遇到严重错误，请联系开发者处理'
          });
          return;
        }
      }

      // 保存选择的驱动器到状态
      setSelectedDrive(driveLetter);
      completeHandledRef.current = false;
      maxProgressRef.current = 0;

      // 设置下载状态，初始就显示下载中
      setDownloading(true);
      setIsCreatingBootDrive(true);
      
      // 立即设置初始下载状态，确保显示"下载中"
      setDownloadInfo({
        progress: "0%",
        speed: "0.00MB/s",
        downloading: true
      });

      // 显示开始通知
      Notification.info({
        title: '开始部署Cloud-PE',
        content: `正在下载Cloud-PE镜像到: ${driveLetter}`,
        duration: 3
      });

      // 开始下载
      try {
        await downloadFileToPath(
          downloadLink,
          downloadPath,
          config.downloadThreads
        );
        console.log('downloadFileToPath 调用完成');
      } catch (error) {
        console.error('下载失败:', error);
        
        // 重置状态
        setDownloading(false);
        setIsDeploying(false);
        setIsInDeploymentProcess(false);
        setIsCreatingBootDrive(false);
        setSelectedDrive('');
        maxProgressRef.current = 0;
        
        Notification.error({
          title: '下载失败',
          content: error instanceof Error ? error.message : '下载ISO镜像时发生错误',
          duration: 3
        });
      }

    } catch (error) {
      console.error('部署失败 - 未预期的错误:', error);
      setDownloading(false);
      setIsDeploying(false);
      setIsInDeploymentProcess(false);
      setIsCreatingBootDrive(false);
      setIsInstallingVentoy(false);
      
      Notification.error({
        title: '部署失败',
        content: '部署过程中发生未知错误，请重试',
        duration: 3
      });
    }
  };

const performDeploy = async () => {
  try {
    // 调用Rust后端执行部署
    console.log("选择的盘符：", selectedDrive);
    const result = await safeTauriInvoke('deploy_to_usb', {
      driveLetter: selectedDrive
    });
    
    setIsDeploying(false);
    setIsInDeploymentProcess(false);
    setIsCreatingBootDrive(false);
    setIsCompleted(true);
    
    const successMessage = result.message || '启动盘制作完成！';
    
    Notification.success({
      title: '部署成功',
      content: successMessage,
      duration: 5
    });
    
    // 自动执行重新加载启动盘并导航到主页
    setTimeout(async () => {
      try {
        // 直接重新加载启动盘信息，传入true参数跳过get_drive_info检查
        await reloadBootDrive(selectedDrive, true);
        onNavigate('home');
      } catch (error) {
        console.error('自动导航到主页失败:', error);
        // 如果失败了，至少也要显示完成页面
        setIsCompleted(true);
      }
    }, 1000); // 延迟1秒执行，确保文件系统同步
    
  } catch (error) {
    console.error('部署失败:', error);
    
    setIsDeploying(false);
    setIsInDeploymentProcess(false);
    setIsCreatingBootDrive(false);
    
    Notification.error({
      title: '部署失败',
      content: `启动盘制作过程中发生错误: ${error}`,
      duration: 5
    });
  }
};

  // 初始页面
  if (currentStep === 0) {
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
        <Title heading={2} style={{ marginBottom: 32, textAlign: 'center' }}>制作启动盘</Title>
        <Button 
          type="primary"
          onClick={handleStartCreate}
        >
          开始制作
        </Button>
      </div>
    );
  }

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
        <Title heading={2} style={{ marginBottom: 32, textAlign: 'center' }}>部署成功</Title>
      </div>
    );
  }

  // 如果正在部署流程中（包括安装Ventoy和下载）
  if (isInDeploymentProcess) {
    // 如果正在安装Ventoy
    if (isInstallingVentoy) {
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
          marginTop: 50
        }}>
          <Steps current={1} style={{ marginBottom: 40, width: '100%', maxWidth: 600 }}>
            <Step title="已完成" description="选择安装设备" />
            <Step title="进行中" description="部署Cloud-PE" />
          </Steps>

          <Spin size="large" style={{ marginBottom: 24 }} />
          <Title heading={3} style={{ marginBottom: 32, textAlign: 'center' }}>
            正在安装Ventoy中
          </Title>
        </div>
      );
    }

    // 如果正在下载或部署
    if (downloading || isDeploying) {
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
          marginTop: 50
        }}>
          <Steps current={1} style={{ marginBottom: 40, width: '100%', maxWidth: 600 }}>
            <Step title="已完成" description="选择安装设备" />
            <Step title="进行中" description="部署Cloud-PE" />
          </Steps>

          <IconGlobeStroke style={{ color: 'var(--semi-color-info)', fontSize: 66, marginBottom: 24 }}/>
          <Title heading={2} style={{ marginBottom: 32, textAlign: 'center' }}>部署中</Title>
          
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
              状态: {downloading ? '下载中' : '部署中'}
            </Text>
          </div>
        </div>
      );
    }

    // 部署流程中的等待状态（比如获取下载链接等）
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
        marginTop: 50
      }}>
        <Steps current={1} style={{ marginBottom: 40, width: '100%', maxWidth: 600 }}>
          <Step title="已完成" description="选择安装设备" />
          <Step title="进行中" description="部署Cloud-PE" />
        </Steps>

        <Spin size="large" style={{ marginBottom: 24 }} />
        <Title heading={3} style={{ marginBottom: 32, textAlign: 'center' }}>
          准备部署中...
        </Title>
      </div>
    );
  }

  // 选择设备步骤页面
  return (
    <div style={{ 
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflow: 'hidden',
      padding: '0 24px',
      boxSizing: 'border-box',
      marginTop: 50
    }}>
      <Steps current={0} style={{ marginBottom: 40, width: '100%', maxWidth: 600 }}>
        <Step title="进行中" description="选择安装设备" />
        <Step title="等待中" description="部署Cloud-PE" />
      </Steps>

      <Title heading={3} style={{ marginBottom: 24, textAlign: 'center' }}>
        选择要制作启动盘的USB设备
      </Title>

      <div style={{ width: '100%', maxWidth: 500 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: 16,
            gap: 12
          }}>
            <Text strong style={{ fontSize: 14 }}>设备：</Text>
            <Select
              key={selectKey}
              value={selectedDevice}
              onChange={(value) => setSelectedDevice(value as number)}
              style={{ flex: 1 }}
              placeholder="选择USB设备"
              loading={isLoading}
              optionList={devices.map(device => ({
                value: device.phydrive,
                label: device.name,
                device: device
              }))}
            />
            <Button 
              icon={<IconRefresh />}
              onClick={refreshDevices}
              type="tertiary"
              loading={isLoading}
            />
          </div>

          {selectedDeviceInfo?.skipSelect && (
            <Text type="secondary" style={{ 
              marginBottom: 16, 
              display: 'block',
              fontSize: 14
            }}>
              检测到当前设备已安装Ventoy，将直接部署Cloud-PE镜像到设备根目录
            </Text>
          )}

          {shouldShowBootMode && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12,
              marginBottom: 8
            }}>
              <Text strong style={{ fontSize: 14 }}>引导方式：</Text>
              <RadioGroup
                value={bootMode}
                onChange={(e) => setBootMode(e.target.value)}
                type="button"
                direction="horizontal"
              >
                <Radio value="MBR">MBR</Radio>
                <Radio value="UEFI">UEFI</Radio>
              </RadioGroup>
            </div>
          )}
        </div>

        {devices.length === 0 && !isLoading && (
          <Text type="warning" style={{ marginBottom: 24, display: 'block' }}>
            未检测到任何USB设备，请确保U盘已正确连接并点击刷新按钮
          </Text>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button 
            type="primary"
            onClick={handleDeploy}
            disabled={selectedDevice === undefined}
          >
            立即部署
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateUsbPage;