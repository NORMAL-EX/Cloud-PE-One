import React from 'react';
import { Typography, Button, Tag } from '@douyinfe/semi-ui';
import { useAppContext } from '../utils/AppContext';
import NotificationBanner from '../components/NotificationBanner';
import BootDriveUpdateBanner from '../components/BootDriveUpdateBanner';

const { Title, Text } = Typography;

interface HomePageProps {
  onNavigate: (page: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { 
    bootDrive, 
    bootDriveVersion,
    isLoadingBootDriveVersion,
    bootDriveUpdateAvailable,
    bootDriveUpdateBannerClosed,
    setBootDriveUpdateBannerClosed,
    notification, 
    isLoadingNotification,
    notificationClosed // 移动到组件内部
  } = useAppContext();

  console.log("启动盘：",bootDrive?.letter)

  console.log("升级状态：", bootDriveUpdateAvailable);

  return (
    <div style={{ 
      paddingTop: 18, // 顶边距18px
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center', // 水平居中
      position: 'relative',
      overflow: 'auto'
    }}>
      {/* 不响应宽高变化的标题 */}
      <div style={{
        position: 'absolute',
        top: 38,
        left: 160,
        transform: 'translateX(-50%)',
        width: 'auto',
        whiteSpace: 'nowrap'
      }}>
        <Title strong heading={2} style={{ fontSize: 24, marginBottom: 24 }}>欢迎使用Cloud-PE One！</Title>
      </div>

      {/* 通知Banner */}
      { notification && ( //fix:移除!isLoadingNotification，因为他会导致通知无法显示
        <div style={{
          position: 'absolute',
          top: 85, // 标题下方8px处
          left: 0,
          right: 0,
          padding: '0 16px',
          zIndex: 100
        }}>
          <NotificationBanner 
            type={notification.type} 
            content={notification.content} 
          />
        </div>
      )}

      {/* 启动盘升级Banner */}
      {bootDriveUpdateAvailable && !bootDriveUpdateBannerClosed && (
        <div style={{
          position: 'absolute',
          top: !notificationClosed ? 155 : 93, // 如果有通知Banner，则在其下方 //fix:移除!isLoadingNotification，因为他会导致通知无法显示
          left: 0,
          right: 0,
          padding: '0 16px',
          zIndex: 99
        }}>
          <BootDriveUpdateBanner
            onNavigateToUpgrade={() => onNavigate('upgrade-boot-drive')}
            onClose={() => setBootDriveUpdateBannerClosed(true)}
          />
        </div>
      )}

      {/* 响应宽度变化的内容区 */}
      <div style={{
        marginTop: bootDriveUpdateAvailable && !bootDriveUpdateBannerClosed ? 195 : 155, // 如果有升级Banner，增加顶部边距
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center' // 水平居中
      }}>
        {bootDrive ? (
          <>
            <div style={{ fontSize: 80, marginBottom: 16 }}>😎</div>
            <Text strong style={{ fontSize: 18, marginBottom: 12 }}>已插入Cloud-PE启动盘</Text>
            
            {/* 显示启动盘版本信息 */}
            {bootDriveVersion && (
              <div style={{ marginBottom: 24 }}>
                <Tag
                  color='green'
                  size='large'
                >
                  版本：Cloud-PE v{bootDriveVersion}
                </Tag>
              </div>
            )}
            
            <Button  
              type="primary" 
              onClick={() => onNavigate('download-plugins')}
              style={{ marginBottom: 16 }}
            >
              下载插件
            </Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 80, marginBottom: 16 }}>😶</div>
            <Text strong style={{ fontSize: 18, marginBottom: 24 }}>尚未插入Cloud-PE启动盘</Text>
            <div style={{ 
              display: 'flex', 
              gap: 16,
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <Button 
                type="primary" 
                onClick={() => onNavigate('create-boot-drive')}
              >
                制作启动盘
              </Button>
              <Button 
                type="primary"
                onClick={() => onNavigate('create-iso')}
              >
                生成ISO镜像
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;