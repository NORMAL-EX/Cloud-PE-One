import React, { useState, useEffect, useRef } from 'react';
import { Spin, Modal, Button, Typography, Select, Checkbox } from '@douyinfe/semi-ui';
import { IconAlertTriangle } from '@douyinfe/semi-icons';
import { useAppContext } from '../utils/AppContext';
import { cacheService } from '../utils/cacheService';

const { Text } = Typography;

interface LoadingScreenProps {
  onLoadingComplete: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onLoadingComplete }) => {
  const { setBootDrive, setNetworkConnected, setIsLoading, setBootDriveVersion } = useAppContext();
  const [loadingText, setLoadingText] = useState<string>('正在启动: 检查环境');
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [showBootDriveModal, setShowBootDriveModal] = useState<boolean>(false);
  const [selectedDriveLetter, setSelectedDriveLetter] = useState<string>('');
  const [bootDrives, setBootDrives] = useState<Array<{ letter: string; isBootDrive: boolean }>>([]);
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(false);
  
  // 添加一个ref来跟踪是否已经初始化
  const isInitialized = useRef<boolean>(false);
  // 添加一个ref来跟踪是否正在处理中
  const isProcessing = useRef<boolean>(false);

  useEffect(() => {
    // 如果已经初始化或正在处理中，直接返回
    if (isInitialized.current || isProcessing.current) {
      return;
    }

    const initializeApp = async () => {
      // 标记正在处理
      isProcessing.current = true;

      try {
        // 如果已经是离线模式，跳过网络检查
        if (isOfflineMode) {
          await handleOfflineModeInit();
          return;
        }

        // 初始化缓存服务（包含网络检查）
        setLoadingText('正在启动: 检查网络连接');
        await cacheService.initialize();
        
        // 从缓存获取网络连接状态
        const isConnected = cacheService.getNetworkConnected();
        setNetworkConnected(isConnected);
        
        if (!isConnected) {
          setShowErrorModal(true);
          isProcessing.current = false;
          return;
        }
        
        // 处理启动盘
        await handleBootDriveInit();
      } finally {
        isProcessing.current = false;
      }
    };

    const handleOfflineModeInit = async () => {
      setNetworkConnected(false);
      await handleBootDriveInit();
    };

    const handleBootDriveInit = async () => {
      // 从缓存获取所有启动盘信息
      setLoadingText('正在启动: 检查启动盘');
      const allBootDrives = cacheService.getAllBootDrives();
      
      if (allBootDrives.length === 0) {
        // 没有检测到启动盘
        setBootDrive(null);
        completeLoading();
      } else if (allBootDrives.length === 1) {
        // 只有一个启动盘，直接使用
        const bootDriveInfo = cacheService.getBootDrive();
        const bootDriveVersion = cacheService.getBootDriveVersion();
        setBootDrive(bootDriveInfo);
        setBootDriveVersion(bootDriveVersion);
        completeLoading();
      } else {
        // 多个启动盘，检查是否有默认选择
        const defaultDriveLetter = localStorage.getItem('defaultBootDrive');
        const defaultDrive = defaultDriveLetter ? allBootDrives.find(d => d.letter === defaultDriveLetter) : undefined;
        
        if (defaultDrive && defaultDriveLetter) {
          // 使用默认启动盘
          await cacheService.setSelectedBootDrive(defaultDriveLetter);
          const bootDriveInfo = cacheService.getBootDrive();
          const bootDriveVersion = cacheService.getBootDriveVersion();
          setBootDrive(bootDriveInfo);
          setBootDriveVersion(bootDriveVersion);
          completeLoading();
        } else {
          // 显示选择模态框
          setBootDrives(allBootDrives);
          setShowBootDriveModal(true);
          isProcessing.current = false; // 等待用户选择时，解除处理锁
        }
      }
    };
    
    const completeLoading = () => {
      // 标记已完成初始化
      isInitialized.current = true;
      
      setLoadingText('正在启动: 加载完成');
      setTimeout(() => {
        setIsLoading(false);
        onLoadingComplete();
      }, 500);
    };
    
    initializeApp();
  }, []); // 移除所有依赖项，只在组件挂载时执行一次

  // 处理跳过按钮点击
  const handleSkipOffline = async () => {
    setShowErrorModal(false);
    setIsOfflineMode(true);
    
    // 在离线模式下，设置网络状态为 false 但允许应用继续运行
    setNetworkConnected(false);
    
    // 标记正在处理
    isProcessing.current = true;
    
    try {
      // 从缓存获取启动盘信息（离线模式下cacheService已经初始化了本地数据）
      const allBootDrives = cacheService.getAllBootDrives();
      
      if (allBootDrives.length === 0) {
        setBootDrive(null);
        completeLoadingOffline();
      } else if (allBootDrives.length === 1) {
        const bootDriveInfo = cacheService.getBootDrive();
        const bootDriveVersion = cacheService.getBootDriveVersion();
        setBootDrive(bootDriveInfo);
        setBootDriveVersion(bootDriveVersion);
        completeLoadingOffline();
      } else {
        // 多个启动盘，检查是否有默认选择
        const defaultDriveLetter = localStorage.getItem('defaultBootDrive');
        const defaultDrive = defaultDriveLetter ? allBootDrives.find(d => d.letter === defaultDriveLetter) : undefined;
        
        if (defaultDrive && defaultDriveLetter) {
          await cacheService.setSelectedBootDrive(defaultDriveLetter);
          const bootDriveInfo = cacheService.getBootDrive();
          const bootDriveVersion = cacheService.getBootDriveVersion();
          setBootDrive(bootDriveInfo);
          setBootDriveVersion(bootDriveVersion);
          completeLoadingOffline();
        } else {
          setBootDrives(allBootDrives);
          setShowBootDriveModal(true);
          isProcessing.current = false; // 等待用户选择时，解除处理锁
        }
      }
    } finally {
      if (!showBootDriveModal) {
        isProcessing.current = false;
      }
    }
  };

  const completeLoadingOffline = () => {
    // 标记已完成初始化
    isInitialized.current = true;
    isProcessing.current = false;
    
    // 完成加载
    setLoadingText('正在启动: 加载完成');
    setTimeout(() => {
      setIsLoading(false);
      onLoadingComplete();
    }, 500);
  };

  // 处理启动盘选择
  const handleBootDriveSelect = async () => {
    if (!selectedDriveLetter) {
      return;
    }
    
    if (saveAsDefault) {
      localStorage.setItem('defaultBootDrive', selectedDriveLetter);
    }
    
    await cacheService.setSelectedBootDrive(selectedDriveLetter);
    const bootDriveInfo = cacheService.getBootDrive();
    const bootDriveVersion = cacheService.getBootDriveVersion();
    setBootDrive(bootDriveInfo);
    setBootDriveVersion(bootDriveVersion); // 添加这一行，设置版本信息
    
    setShowBootDriveModal(false);
    
    // 标记已完成初始化
    isInitialized.current = true;
    isProcessing.current = false;
    
    // 完成加载
    setLoadingText('正在启动: 加载完成');
    setTimeout(() => {
      setIsLoading(false);
      onLoadingComplete();
    }, 500);
  };

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'var(--semi-color-bg-0)',
    }}>
      <Spin size="large" /><br></br>
      <Text>{loadingText}</Text>
      
      {/* 网络错误模态框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <IconAlertTriangle style={{ color: 'var(--semi-color-danger)', marginRight: 8, fontSize: 24 }} />
            <span>已离线</span>
          </div>
        }
        visible={showErrorModal}
        footer={null}
        closable={false}
        width={400}
        centered
      >
        <div style={{ padding: '0 0 25px 0' }}>
          <Text>未连接互联网，无法使用相关功能。您可以选择关闭应用或进入离线模式。</Text>
          <div style={{ 
            marginTop: 24, 
            textAlign: 'right',
            paddingRight: 8,
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end'
          }}>
            <Button 
              type="tertiary" 
              onClick={handleSkipOffline}
            >
              进入离线模式
            </Button>
            <Button 
              type="danger" 
              theme="solid" 
              onClick={() => window.close()}
            >
              关闭应用
            </Button>
          </div>
        </div>
      </Modal>

      {/* 启动盘选择模态框 */}
      <Modal
        title="您想使用哪个启动盘？"
        visible={showBootDriveModal}
        footer={null}
        closable={false}
        width={400}
        centered
      >
        <div style={{ padding: '0 0 20px 0' }}
        >
          <Select
            style={{ width: '100%' }}
            placeholder="请选择一个启动盘"
            value={selectedDriveLetter}
            onChange={(value) => setSelectedDriveLetter(value as string)}
          >
            {bootDrives.map(drive => (
              <Select.Option key={drive.letter} value={drive.letter}>
                {drive.letter}
              </Select.Option>
            ))}
          </Select>
          
          <div style={{ marginTop: 20 }}>
            <Checkbox
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked ?? false)}
            >
              把这项选择设为默认值
            </Checkbox>
          </div>
          
          <div style={{ 
            marginTop: 24, 
            textAlign: 'right',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end'
          }}>
            <Button 
              type="primary"
              theme="solid"
              onClick={handleBootDriveSelect}
              disabled={!selectedDriveLetter}
            >
              继续
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LoadingScreen;