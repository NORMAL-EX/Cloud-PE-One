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
    bootDriveUpdateAvailable,
    setSearchKeyword, 
    searchKeyword, 
    pluginCategories, 
    isLoadingPlugins, 
    pluginsError,
    isGeneratingIso,
    isCreatingBootDrive,
    isUpgradingBootDrive
  } = useAppContext();
  
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  // 添加状态跟踪当前是否处于收起状态下的点击
  const [, setClickedInCollapsedState] = useState<boolean>(false);
  // 本地搜索状态
  const [localSearchValue, setLocalSearchValue] = useState<string>('');
  // 添加窗口宽度状态
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  // 添加Nav的选中状态，用于控制选中项
  const [selectedKeys, setSelectedKeys] = useState<string[]>([currentPage]);

  const handleMinimize = async () => {
     appWindow.minimize()
  };

  const handleClose = async () => {
    appWindow.close()
  };

  const handleCollapseChange = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    // 重置点击状态
    setClickedInCollapsedState(false);
  };

  // 修复类型错误的菜单点击处理函数
  const handleNavSelect = (data: any) => {
    const itemKey = String(data.itemKey); // 确保 itemKey 为字符串类型
    
    // 检查是否正在生成ISO
    if (isGeneratingIso) {
      Notification.warning({
        title: '提示',
        content: '正在生成ISO镜像中，不可切换页面！',
        duration: 3
      });
      // 阻止切换时，恢复之前的选中状态
      setSelectedKeys([currentPage]);
      return;
    }
    
    // 检查是否正在制作启动盘
    if (isCreatingBootDrive) {
      Notification.warning({
        title: '提示',
        content: '制作启动盘中，不可切换页面！',
        duration: 3
      });
      // 阻止切换时，恢复之前的选中状态
      setSelectedKeys([currentPage]);
      return;
    }
    
    // 检查是否正在升级启动盘
    if (isUpgradingBootDrive) {
      Notification.warning({
        title: '提示',
        content: '升级启动盘中，不可切换页面！',
        duration: 3
      });
      // 阻止切换时，恢复之前的选中状态
      setSelectedKeys([currentPage]);
      return;
    }
    
    // 更新选中状态
    setSelectedKeys([itemKey]);
    
    // 如果在收起状态下点击，先设置标志，然后延迟执行导航
    if (isCollapsed) {
      setClickedInCollapsedState(true);
      // 使用setTimeout避免在Tooltip2渲染周期内触发状态更新
      setTimeout(() => {
        onNavigate(itemKey);
        setClickedInCollapsedState(false);
      }, 100);
    } else {
      // 正常状态下直接导航
      onNavigate(itemKey);
    }
  };

  // 处理搜索输入变化
  const handleSearchChange = (value: string) => {
    setLocalSearchValue(value);
    
    // 如果搜索框被清空，也清空全局搜索关键词
    if (!value.trim()) {
      setSearchKeyword('');
    }
  };

  // 处理搜索提交
  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && localSearchValue.trim()) {
      // 检查是否正在生成ISO
      if (isGeneratingIso) {
        Notification.warning({
          title: '提示',
          content: '正在生成ISO镜像中，不可切换页面！',
          duration: 3
        });
        return;
      }
      
      // 检查是否正在制作启动盘
      if (isCreatingBootDrive) {
        Notification.warning({
          title: '提示',
          content: '制作启动盘中，不可切换页面！',
          duration: 3
        });
        return;
      }
      
      // 检查是否正在升级启动盘
      if (isUpgradingBootDrive) {
        Notification.warning({
          title: '提示',
          content: '升级启动盘中，不可切换页面！',
          duration: 3
        });
        return;
      }
      
      // 设置全局搜索关键词
      setSearchKeyword(localSearchValue);
      // 更新选中状态
      setSelectedKeys(['download-plugins']);
      // 导航到插件市场页面
      onNavigate('download-plugins');
    }
  };

  // 处理搜索框清除
  const handleSearchClear = () => {
    setLocalSearchValue('');
    setSearchKeyword('');
  };

  // 计算搜索框宽度
  const getSearchBoxWidth = () => {
    if (windowWidth < 890) {
      return 250;
    } else {
      return 250 + (windowWidth - 889);
    }
  };

  // 使用useEffect监听收起状态变化
  useEffect(() => {
    // 当从收起状态恢复时，重置点击状态
    if (!isCollapsed) {
      setClickedInCollapsedState(false);
    }
  }, [isCollapsed]);

  // 同步全局搜索关键词到本地状态
  useEffect(() => {
    setLocalSearchValue(searchKeyword);
  }, [searchKeyword]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 监听currentPage变化，同步到selectedKeys
  useEffect(() => {
    setSelectedKeys([currentPage]);
  }, [currentPage]);

  // 判断是否应该显示搜索框
  const shouldShowSearchBox = !isLoadingPlugins && !pluginsError && pluginCategories.length > 0;

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Header className="draggable"  style={{ 
        backgroundColor: 'var(--semi-color-bg-1)', 
        height: 48, 
        lineHeight: '48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: '1px solid var(--semi-color-border)',
      }} data-tauri-drag-region>
        <div style={{ display: 'flex', alignItems: 'center' }} data-tauri-drag-region>
          <img src="" className="cloud-pe-logo" alt="Logo" style={{ width: 38, height: 38, marginRight: 8 }} data-tauri-drag-region />
          <Text className="cloud-pe-title" strong style={{ fontFamily: '-apple-system', fontSize: 20 }}>Cloud-PE</Text>
        </div>
        
        {/* 只有在插件市场有数据时才显示搜索框 */}
        {shouldShowSearchBox ? (
          <Input
            style={{ 
              width: getSearchBoxWidth(),
              verticalAlign: 'middle' // 修复搜索框错位
            }} 
            placeholder="输入关键词，回车搜索插件"
            prefix={<IconSearch />}
            value={localSearchValue}
            onChange={handleSearchChange}
            onKeyPress={handleSearchSubmit}
            onClear={handleSearchClear}
            showClear
            data-tauri-drag-region={false}
          />
        ) : (
          <div style={{ width: getSearchBoxWidth() }} data-tauri-drag-region></div> // 占位，保持布局平衡
        )}
        
        <div>
          <Button 
            icon={<IconMinus />} 
            type="tertiary" 
            theme="borderless" 
            onClick={handleMinimize}
            style={{ marginRight: 8 }}
            data-tauri-drag-region={false}
          />
          <Button 
            icon={<IconClose />} 
            type="danger" 
            theme="borderless" 
            onClick={handleClose}
            data-tauri-drag-region={false}
          />
        </div>
      </Header>
      <Layout>
        <Sider style={{ backgroundColor: 'var(--semi-color-bg-1)' }}>
          <Nav
            selectedKeys={selectedKeys} // 使用受控的选中状态
            style={{ height: '100%' }}
            mode="vertical" // 明确指定垂直模式
            isCollapsed={isCollapsed}
            onCollapseChange={handleCollapseChange}
            // 使用修复后的选择处理函数
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