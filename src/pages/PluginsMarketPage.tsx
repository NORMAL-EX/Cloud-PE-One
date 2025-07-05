import React, { useState, useEffect } from 'react';
import { Typography, Nav, Card, Button, Spin, Toast, Empty, Notification, Tooltip } from '@douyinfe/semi-ui';
import { IconDownload, IconAlertCircle, IconGlobe, IconArrowLeft } from '@douyinfe/semi-icons';
import { IconEmpty } from '@douyinfe/semi-icons-lab';
import { downloadPlugin, Plugin } from '../api/pluginsApi';
import { useAppContext } from '../utils/AppContext';

const { Title, Text, Paragraph } = Typography;

const PluginsMarketPage: React.FC = () => {
  const { 
    bootDrive, 
    pluginCategories, 
    isLoadingPlugins, 
    pluginsError,
    searchResults,
    searchKeyword,
    config,
    // 新增：使用全局下载状态
    downloadingPlugins,
    setPluginDownloading,
  } = useAppContext();
  
  const [currentCategory, setCurrentCategory] = useState<string>('');
  const [, setUserSelectedCategory] = useState<boolean>(false);
  const [hasProcessedSearch, setHasProcessedSearch] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isPageLoaded, setIsPageLoaded] = useState<boolean>(false);
  
  // 新增状态：控制Web搜索界面
  const [webSearchPlugin, setWebSearchPlugin] = useState<Plugin | null>(null);
  const [showWebSearch, setShowWebSearch] = useState<boolean>(false);

  // 生成插件的唯一标识符
  const getPluginUniqueId = (plugin: Plugin): string => {
    return `${plugin.name}_${plugin.version}_${plugin.author}_${plugin.describe}`;
  };

  // 去重函数：移除重复的插件
  const deduplicatePlugins = (plugins: Plugin[]): Plugin[] => {
    const seen = new Set<string>();
    return plugins.filter(plugin => {
      const uniqueId = getPluginUniqueId(plugin);
      if (seen.has(uniqueId)) {
        return false;
      }
      seen.add(uniqueId);
      return true;
    });
  };

  // 当插件分类加载完成后，设置默认分类
  useEffect(() => {
    if (pluginCategories.length > 0 && !currentCategory && !isInitialized) {
      if (searchResults) {
        setCurrentCategory('搜索');
        setHasProcessedSearch(true);
      } else {
        setCurrentCategory(pluginCategories[0].class);
      }
      setIsInitialized(true);
    }
  }, [pluginCategories, searchResults, currentCategory, isInitialized]);

  // 当搜索结果变化时，处理分类切换
  useEffect(() => {
    if (searchResults && !hasProcessedSearch) {
      setCurrentCategory('搜索');
      setHasProcessedSearch(true);
      setUserSelectedCategory(false);
    } 
    else if (!searchResults && currentCategory === '搜索' && pluginCategories.length > 0) {
      setCurrentCategory(pluginCategories[0].class);
      setHasProcessedSearch(false);
      setUserSelectedCategory(false);
    }
  }, [searchResults, currentCategory, pluginCategories, hasProcessedSearch]);

  // 当搜索关键词变化时，重置处理状态
  useEffect(() => {
    if (searchKeyword) {
      setHasProcessedSearch(false);
    }
  }, [searchKeyword]);

  // 监听页面加载状态
  useEffect(() => {
    if (!isLoadingPlugins && !pluginsError && isInitialized && pluginCategories.length > 0) {
      setIsPageLoaded(true);
    }
    if (pluginsError) {
      setIsPageLoaded(true);
    }
  }, [isLoadingPlugins, pluginsError, isInitialized, pluginCategories.length]);

  // 组件卸载时恢复body滚动条
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // 处理分类切换
  const handleCategoryChange = (key: string) => {
    setUserSelectedCategory(true);
    setCurrentCategory(key);
  };

  // 处理插件下载
  const handleDownloadPlugin = async (plugin: Plugin) => {
    if (!bootDrive) {
      Notification.error({
        content: '目前您还尚未安装或制作Cloud-PE启动盘，因此该功能暂不可用！',
        duration: 3,
        title: '尚未准备就绪！'
      });
      return;
    }
    
    const pluginId = getPluginUniqueId(plugin);
    
    try {
      setPluginDownloading(pluginId, true);
      
      await downloadPlugin(
        plugin.link,
        `${plugin.name}_${plugin.version}_${plugin.author}_${plugin.describe}.ce`,
        bootDrive.letter,
        config.downloadThreads
      );
      
      Toast.success(`插件 ${plugin.name} 下载完成`);
    } catch (err) {
      console.error('下载插件失败:', err);
      Toast.error(`插件 ${plugin.name} 下载失败`);
    } finally {
      setPluginDownloading(pluginId, false);
    }
  };

  // 处理Web搜索
  const handleWebSearch = (plugin: Plugin) => {
    setWebSearchPlugin(plugin);
    setShowWebSearch(true);
    // 隐藏body滚动条
    document.body.style.overflow = 'hidden';
  };

  // 处理返回
  const handleBackFromWebSearch = () => {
    setShowWebSearch(false);
    setWebSearchPlugin(null);
    // 恢复body滚动条
    document.body.style.overflow = '';
  };

  // 获取当前分类的插件列表（已去重）
  const getCurrentCategoryPlugins = (): Plugin[] => {
    let plugins: Plugin[] = [];
    
    if (currentCategory === '搜索' && searchResults) {
      plugins = searchResults.list;
    } else {
      const category = pluginCategories.find(cat => cat.class === currentCategory);
      plugins = category ? category.list : [];
    }
    
    return deduplicatePlugins(plugins);
  };

  // 获取导航项
  const getNavItems = () => {
    const items = pluginCategories.map(category => ({
      itemKey: category.class,
      text: category.class
    }));
    
    if (searchResults) {
      items.unshift({
        itemKey: '搜索',
        text: '搜索'
      });
    }
    
    return items;
  };

  // 生成唯一的插件卡片key
  const generatePluginKey = (plugin: Plugin, index: number): string => {
    return `${getPluginUniqueId(plugin)}-${index}-${currentCategory}`;
  };

  // 渲染插件卡片
  const renderPluginCard = (plugin: Plugin, index: number) => {
    const pluginId = getPluginUniqueId(plugin);
    const isDownloading = downloadingPlugins[pluginId];
    
    return (
      <Card
        key={generatePluginKey(plugin, index)}
        style={{ 
          width: '100%', 
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)'
        }}
        bodyStyle={{ padding: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <Title heading={5} style={{ marginBottom: 8 }}>{plugin.name}</Title>
            <Paragraph style={{ marginBottom: 8 }}>{plugin.describe}</Paragraph>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <Text type="tertiary">版本: {plugin.version}</Text>
              <Text type="tertiary">大小: {plugin.size}</Text>
              <Text type="tertiary">作者: {plugin.author}</Text>
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center',
            alignItems: 'center',
            minWidth: config.enablePluginWebSearch ? 150 : 100,
            gap: 8
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Web搜索按钮 */}
              {config.enablePluginWebSearch && (
                <Tooltip content="在 Bing 上搜索关于该软件的有关信息">
                  <Button 
                    icon={<IconGlobe />}
                    onClick={() => handleWebSearch(plugin)}
                  >
                    在 Web 上搜索
                  </Button>
                </Tooltip>
              )}
              
              {/* 下载按钮 */}
              {isDownloading ? (
                <Button 
                  type="primary" 
                  loading={true}
                >
                  下载中
                </Button>
              ) : (
                <Button 
                  type="primary" 
                  icon={<IconDownload />}
                  onClick={() => handleDownloadPlugin(plugin)}
                >
                  下载
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  // 渲染Web搜索界面
  const renderWebSearchView = () => {
    if (!webSearchPlugin) return null;
    
    const searchQuery = encodeURIComponent(webSearchPlugin.name);
    const bingUrl = `https://www.bing.com/search?q=${searchQuery}`;
    
    return (
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--semi-color-bg-0)',
        overflow: 'hidden'  // 防止内部产生滚动条
      }}>
        {/* 头部信息栏 */}
        <div style={{
          padding: 16,
          borderBottom: '1px solid var(--semi-color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          backgroundColor: 'var(--semi-color-bg-1)'
        }}>
          <Button 
            onClick={handleBackFromWebSearch}
            icon={<IconArrowLeft />}
          >
            返回
          </Button>
          
          <div style={{ flex: 1 }}>
            <Title heading={4} style={{ marginBottom: 4 }}>{webSearchPlugin.name}</Title>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Text type="secondary">作者: {webSearchPlugin.author}</Text>
              <Text type="secondary">版本: {webSearchPlugin.version}</Text>
              <Text type="secondary">大小: {webSearchPlugin.size}</Text>
            </div>
            <Text type="secondary">{webSearchPlugin.describe}</Text>
          </div>
        </div>
        
        {/* 浏览器框架 */}
        <div style={{ flex: 1, position: 'relative' }}>
          <iframe
            src={bingUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
            title={`搜索 ${webSearchPlugin.name}`}
          />
        </div>
      </div>
    );
  };

  const shouldShowCategories = !isLoadingPlugins && !pluginsError && pluginCategories.length > 0;
  
  // 判断是否应该隐藏滚动条（出现错误或暂无插件时）
  const shouldHideScrollbar = pluginsError || 
    (isPageLoaded && !isLoadingPlugins && !pluginsError && getCurrentCategoryPlugins().length === 0);

  // 如果显示Web搜索界面，渲染Web搜索视图
  if (showWebSearch) {
    return (
      <div style={{ 
        display: 'flex', 
        height: 'calc(100vh - 48px)',
        overflow: 'hidden'  // 确保容器本身也不显示滚动条
      }}>
        {renderWebSearchView()}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)' }}>
      {/* 左侧分类菜单 */}
      {shouldShowCategories && (
        <div style={{ 
          width: 120,
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ 
            backgroundColor: 'var(--semi-color-nav-bg)', 
            height: '100%', 
            borderRight: '1px solid var(--semi-color-border)',
            overflow: 'auto'
          }}>
            <Nav
              style={{ 
                width: '100%',
                borderRight: 0,
                minHeight: '100%'
              }}
              selectedKeys={[currentCategory]}
              onSelect={({ itemKey }) => handleCategoryChange(itemKey as string)}
              items={getNavItems()}
            />
          </div>
        </div>
      )}
      
      {/* 右侧插件列表 */}
      <div style={{ 
        flex: 1, 
        padding: 16,
        backgroundColor: 'var(--semi-color-bg-0)',
        overflow: shouldHideScrollbar ? 'hidden' : 'auto'  // 条件控制overflow
      }}>
        {isLoadingPlugins && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">正在加载插件列表...</Text>
            </div>
          </div>
        )}
        
        {pluginsError && (
      <div style={{ 
        padding: 24, 
        height: '84vh', 
        display: 'flex', 
        flexDirection: 'column' 
      }}>
        <Title heading={3} style={{ marginBottom: 24 }}>插件管理</Title>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Empty
            image={<IconAlertCircle style={{ color: 'var(--semi-color-danger)', fontSize: 50}} />}
            title="出现错误"
            description={pluginsError}
          />
        </div>
      </div>
        )}
        
        {isPageLoaded && !isLoadingPlugins && !pluginsError && (
          <>
            {getCurrentCategoryPlugins().length > 0 ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: 16
              }}>
                {getCurrentCategoryPlugins().map((plugin, index) => 
                  renderPluginCard(plugin, index)
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Empty
                  image={<IconEmpty style={{ color: 'var(--semi-color-danger)', fontSize: 50}} />}
                  title="暂无插件"
                  description={currentCategory === '搜索' ? '没有找到相关插件' : '该分类下暂无插件'}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PluginsMarketPage;