/* eslint-disable @typescript-eslint/no-unused-vars */
import "./../App.css";
import React, { useState, useEffect } from 'react';
import { Layout, Nav, Input, Button , Typography, Notification} from '@douyinfe/semi-ui';
import { 
  IconMinus,
  IconClose,
  IconSearch
} from '@douyinfe/semi-icons';
const { Text } = Typography;

import { 
  IconIntro, 
  IconDescriptions,
  IconToken,
  IconTooltip,
  IconConfig
} from '@douyinfe/semi-icons-lab';

import { useAppContext } from '../utils/AppContext';

import { Window } from '@tauri-apps/api/window';
const { Sider, Content, Header } = Layout;
const appWindow = new Window('main');

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, currentPage, onNavigate }) => {
  const {
    bootDrive,
    bootDriveUpdateAvailable,
    setSearchKeyword, 
    searchKeyword, 
    pluginCategories, 
    isLoadingPlugins, 
    pluginsError,
    isGeneratingIso,
    isCreatingBootDrive,
    isUpgradingBootDrive,
    isNetworkConnected
  } = useAppContext();
  
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [, setClickedInCollapsedState] = useState<boolean>(false);
  const [localSearchValue, setLocalSearchValue] = useState<string>('');
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([currentPage]);

  // 修复：使用 onClick 替代 onMouseDown，并简化事件处理
  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  const handleCollapseChange = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    setClickedInCollapsedState(false);
  };

  const requiresNetworkConnection = (page: string): boolean => {
    const networkRequiredPages = [
      'create-boot-drive',
      'create-iso',
      'upgrade-boot-drive',
      'download-plugins',
      'docs'
    ];
    return networkRequiredPages.includes(page);
  };

  const handleNavSelect = async (data: any) => {
    const itemKey = String(data.itemKey);
    
    if (isGeneratingIso) {
      Notification.warning({
        title: '提示',
        content: '正在生成ISO镜像中,不可切换页面!',
        duration: 3
      });
      setSelectedKeys([currentPage]);
      return;
    }
    
    if (isCreatingBootDrive) {
      Notification.warning({
        title: '提示',
        content: '制作启动盘中,不可切换页面!',
        duration: 3
      });
      setSelectedKeys([currentPage]);
      return;
    }
    
    if (isUpgradingBootDrive) {
      Notification.warning({
        title: '提示',
        content: '升级启动盘中,不可切换页面!',
        duration: 3
      });
      setSelectedKeys([currentPage]);
      return;
    }
    
    if (!isNetworkConnected && requiresNetworkConnection(itemKey)) {
      Notification.warning({
        title: '提示',
        content: '当前处于离线模式,不可使用该功能!',
        duration: 3
      });
      setSelectedKeys([currentPage]);
      return;
    }
    
    setSelectedKeys([itemKey]);
    
    if (isCollapsed) {
      setClickedInCollapsedState(true);
      setTimeout(() => {
        onNavigate(itemKey);
        setClickedInCollapsedState(false);
      }, 100);
    } else {
      onNavigate(itemKey);
    }
  };

  const handleSearchChange = (value: string) => {
    setLocalSearchValue(value);
    if (!value.trim()) {
      setSearchKeyword('');
    }
  };

  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && localSearchValue.trim()) {
      if (isGeneratingIso) {
        Notification.warning({
          title: '提示',
          content: '正在生成ISO镜像中,不可切换页面!',
          duration: 3
        });
        return;
      }
      
      if (isCreatingBootDrive) {
        Notification.warning({
          title: '提示',
          content: '制作启动盘中,不可切换页面!',
          duration: 3
        });
        return;
      }
      
      if (isUpgradingBootDrive) {
        Notification.warning({
          title: '提示',
          content: '升级启动盘中,不可切换页面!',
          duration: 3
        });
        return;
      }
      
      if (!isNetworkConnected) {
        Notification.warning({
          title: '提示',
          content: '当前处于离线模式,不可切换页面!',
          duration: 3
        });
        return;
      }
      
      setSearchKeyword(localSearchValue);
      setSelectedKeys(['download-plugins']);
      onNavigate('download-plugins');
    }
  };

  const handleSearchClear = () => {
    setLocalSearchValue('');
    setSearchKeyword('');
  };

  const getSearchBoxWidth = () => {
    if (windowWidth < 890) {
      return 250;
    } else {
      return 250 + (windowWidth - 889);
    }
  };

  useEffect(() => {
    if (!isCollapsed) {
      setClickedInCollapsedState(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    setLocalSearchValue(searchKeyword);
  }, [searchKeyword]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setSelectedKeys([currentPage]);
  }, [currentPage]);

  const shouldShowSearchBox = !isLoadingPlugins && !pluginsError && pluginCategories.length > 0 && isNetworkConnected;

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Header 
        className="draggable"  
        style={{ 
          backgroundColor: 'var(--semi-color-bg-1)', 
          height: 48, 
          lineHeight: '48px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid var(--semi-color-border)',
        }}
      >
        {/* 左侧Logo和标题区域 - 可拖动 */}
        <div 
          style={{ display: 'flex', alignItems: 'center' }} 
          data-tauri-drag-region
        >
          <img 
            src="" 
            className="cloud-pe-logo" 
            alt="Logo" 
            style={{ width: 30, height: 30, marginRight: 8 }} 
            data-tauri-drag-region 
          />
          <Text 
            className="cloud-pe-title" 
            strong 
            style={{ fontFamily: '-apple-system', fontSize: 20 }}
            data-tauri-drag-region
          >
            Cloud-PE
          </Text>
        </div>
        
        {/* 中间搜索框 - 不可拖动 */}
        {shouldShowSearchBox ? (
          <Input
            style={{ 
              width: getSearchBoxWidth(),
              verticalAlign: 'middle'
            }} 
            placeholder="输入关键字,回车搜索插件"
            prefix={<IconSearch />}
            value={localSearchValue}
            onChange={handleSearchChange}
            onKeyPress={handleSearchSubmit}
            onClear={handleSearchClear}
            showClear
          />
        ) : (
          <div 
            style={{ width: getSearchBoxWidth() }}
            data-tauri-drag-region
          />
        )}
        
        {/* 右侧窗口控制按钮 - 关键修复：完全移除拖动属性 */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Button 
            icon={<IconMinus />} 
            type="tertiary" 
            theme="borderless" 
            onClick={handleMinimize}
            style={{ 
              cursor: 'pointer'
            }}
          />
          <Button 
            icon={<IconClose />} 
            type="danger" 
            theme="borderless" 
            onClick={handleClose}
            style={{ 
              cursor: 'pointer'
            }}
          />
        </div>
      </Header>
      <Layout>
        <Sider style={{ backgroundColor: 'var(--semi-color-bg-1)' }}>
          <Nav
            selectedKeys={selectedKeys}
            style={{ height: '100%' }}
            mode="vertical"
            isCollapsed={isCollapsed}
            onCollapseChange={handleCollapseChange}
            onSelect={handleNavSelect}
            items={[
              { itemKey: 'home', text: '首页', icon: <IconIntro /> },
              {
                itemKey: 'install',
                text: '安装',
                icon: <IconDescriptions />,
                items: [
                  { itemKey: 'create-boot-drive', text: '制作启动盘' },
                  { itemKey: 'create-iso', text: '生成ISO镜像' },
                  ...(bootDriveUpdateAvailable ? [{ itemKey: 'upgrade-boot-drive', text: '升级' }] : [])
                ]
              },
              {
                itemKey: 'plugins',
                text: '插件',
                icon: <IconToken />,
                items: [
                  { itemKey: 'download-plugins', text: '下载插件' },
                  { itemKey: 'manage-plugins', text: '插件管理' },
                ]
              },
              { itemKey: 'docs', text: '文档', icon: <IconTooltip /> },
              { itemKey: 'settings', text: '设置', icon: <IconConfig /> },
            ]}
            footer={{
              collapseButton: true,
            }}
          />
        </Sider>
        <Content style={{ 
          padding: 0, 
          backgroundColor: 'var(--semi-color-bg-0)',
          overflow: 'auto'
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;