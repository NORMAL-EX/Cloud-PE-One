import React, { useState, useEffect } from 'react';
import { Spin, Modal, Button, Typography } from '@douyinfe/semi-ui';
import { IconAlertTriangle } from '@douyinfe/semi-icons';
import { checkNetworkConnection, checkBootDrive, exitApp } from '../utils/system';
import { useAppContext } from '../utils/AppContext';

const { Text } = Typography;

interface LoadingScreenProps {
  onLoadingComplete: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onLoadingComplete }) => {
  const { setBootDrive, setNetworkConnected, setIsLoading } = useAppContext();
  const [loadingText, setLoadingText] = useState<string>('正在启动: 检查环境');
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);

  useEffect(() => {
    const initializeApp = async () => {
      // 检查网络连接
       setLoadingText('正在启动: 检查网络连接');
       // WARNING:开发环境暂时使用
      //const isConnected = await checkNetworkConnection();
      const isConnected = true;
      setNetworkConnected(isConnected);
      
      if (!isConnected) {
        setShowErrorModal(true);
        return;
      } 
      
      // 检查启动盘
      setLoadingText('正在启动: 检查启动盘');
      const bootDriveInfo = await checkBootDrive();
      setBootDrive(bootDriveInfo);
      
      // 完成加载
      setLoadingText('正在启动: 加载完成');
      setTimeout(() => {
        setIsLoading(false);
        onLoadingComplete();
      }, 500);
    };
    
    initializeApp();
  }, [onLoadingComplete, setBootDrive, setNetworkConnected, setIsLoading]);

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
          <Text>未连接互联网，无法使用相关功能，点[确定]关闭。</Text>
          <div style={{ 
            marginTop: 24, 
            textAlign: 'right',
            paddingRight: 8 
          }}>
            <Button 
              type="danger" 
              theme="solid" 
              onClick={exitApp}
            >
              确定
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default LoadingScreen;

