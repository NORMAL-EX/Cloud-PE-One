import React, { useState, useEffect } from 'react';
import { Typography, Nav, Card, Button, Spin, Toast, Empty, Notification } from '@douyinfe/semi-ui';
import { IconDownload, IconAlertCircle } from '@douyinfe/semi-icons';
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
    config
  } = useAppContext();
  
  const [currentCategory, setCurrentCategory] = useState<string>('');
  const [downloadingPlugins, setDownloadingPlugins] = useState<Record<string, boolean>>({});
  const [, setDownloadProgress] = useState<Record<string, { progress: number; speed: string }>>({});
  // 添加一个状态来跟踪用户是否手动选择了分类
  const [userSelectedCategory, setUserSelectedCategory] = useState<boolean>(false);
  // 添加一个状态来跟踪是否已经处理过当前搜索
  const [hasProcessedSearch, setHasProcessedSearch] = useState<boolean>(false);
  // 添加一个状态来跟踪是否已经初始化过
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  // 添加一个状态来跟踪页面是否完全加载完毕
  const [isPageLoaded, setIsPageLoaded] = useState<boolean>(false);

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
        return false; // 跳过重复的插件
      }
      seen.add(uniqueId);
      return true;
    });
  };

  // 当插件分类加载完成后，设置默认分类
  useEffect(() => {
    if (pluginCategories.length > 0 && !currentCategory && !isInitialized) {
      // 如果有搜索结果，默认选择搜索分类
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
    // 只有在新的搜索结果出现且用户没有手动选择其他分类时，才自动切换到搜索分类
    if (searchResults && !hasProcessedSearch) {
      setCurrentCategory('搜索');
      setHasProcessedSearch(true);
      // 重置用户选择状态，允许用户之后自由切换
      setUserSelectedCategory(false);
    } 
    // 如果搜索结果清空了（用户清空了搜索），且当前在搜索分类
    else if (!searchResults && currentCategory === '搜索' && pluginCategories.length > 0) {
      setCurrentCategory(pluginCategories[0].class);
      setHasProcessedSearch(false);
      setUserSelectedCategory(false);
    }
  }, [searchResults, currentCategory, pluginCategories, hasProcessedSearch]);

  // 当搜索关键词变化时，重置处理状态（表示新的搜索）
  useEffect(() => {
    if (searchKeyword) {
      setHasProcessedSearch(false);
    }
  }, [searchKeyword]);

  // 监听页面加载状态，当数据加载完成且初始化完成后，标记页面为已加载
  useEffect(() => {
    if (!isLoadingPlugins && !pluginsError && isInitialized && pluginCategories.length > 0) {
      setIsPageLoaded(true);
    }
    // 如果出现错误，也认为页面加载完毕（只是加载失败）
    if (pluginsError) {
      setIsPageLoaded(true);
    }
  }, [isLoadingPlugins, pluginsError, isInitialized, pluginCategories.length]);

  // 处理分类切换
  const handleCategoryChange = (key: string) => {
    // 设置用户已手动选择分类
    setUserSelectedCategory(true);
    setCurrentCategory(key);
  };

  // 处理插件下载
  const handleDownloadPlugin = async (plugin: Plugin) => {
    // 检查是否有启动盘
    if (!bootDrive) {
      // 使用Notification.error代替Modal.error
      Notification.error({
        content: '目前您还尚未安装或制作Cloud-PE启动盘，因此该功能暂不可用！',
        duration: 3,
        title: '尚未准备就绪！'
      });
      return;
    }
    
    // 使用唯一标识符
    const pluginId = getPluginUniqueId(plugin);
    
    try {
      // 设置下载状态
      setDownloadingPlugins(prev => ({ ...prev, [pluginId]: true }));
      setDownloadProgress(prev => ({ 
        ...prev, 
        [pluginId]: { progress: 0, speed: '0.00' } 
      }));
      // 开始下载，使用配置中的下载线程数
      await downloadPlugin(
        plugin.link,
        `${plugin.name}_${plugin.version}_${plugin.author}_${plugin.describe}.ce`,
        bootDrive.letter,
        (progress, speed) => {
          setDownloadProgress(prev => ({
            ...prev,
            [pluginId]: { progress, speed }
          }));
        },
        config.downloadThreads // 传递下载线程数
      );
      
      // 下载完成
      Toast.success(`插件 ${plugin.name} 下载完成`);
    } catch (err) {
      console.error('下载插件失败:', err);
      Toast.error(`插件 ${plugin.name} 下载失败`);
    } finally {
      // 重置下载状态
      setDownloadingPlugins(prev => ({ ...prev, [pluginId]: false }));
    }
  };

  // 获取当前分类的插件列表（已去重）
  const getCurrentCategoryPlugins = (): Plugin[] => {
    let plugins: Plugin[] = [];
    
    // 如果是搜索分类，返回搜索结果
    if (currentCategory === '搜索' && searchResults) {
      plugins = searchResults.list;
    } else {
      // 否则返回当前分类的插件列表
      const category = pluginCategories.find(cat => cat.class === currentCategory);
      plugins = category ? category.list : [];
    }
    
    // 对插件列表进行去重处理
    return deduplicatePlugins(plugins);
  };

  // 获取导航项
  const getNavItems = () => {
    const items = pluginCategories.map(category => ({
      itemKey: category.class,
      text: category.class
    }));
    
    // 如果有搜索结果，添加搜索分类
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
    // 使用插件的唯一标识符和索引组合生成唯一key
    return `${getPluginUniqueId(plugin)}-${index}-${currentCategory}`;
  };

  // 渲染插件卡片
  const renderPluginCard = (plugin: Plugin, index: number) => {
    // 使用唯一标识符来获取下载状态
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
            minWidth: 100
          }}>
            {isDownloading ? (
              <>
              <Button 
                type="primary" 
                loading={true}
              >
                下载中
              </Button>

              </>
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
      </Card>
    );
  };

  // 如果获取不到数据，隐藏左侧分类菜单
  const shouldShowCategories = !isLoadingPlugins && !pluginsError && pluginCategories.length > 0;

  // 添加调试信息
  console.log('当前状态:', {
    currentCategory,
    userSelectedCategory,
    hasSearchResults: !!searchResults,
    searchKeyword,
    categoriesCount: pluginCategories.length,
    hasProcessedSearch,
    isInitialized,
    isLoadingPlugins,
    isPageLoaded
  });

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)' }}>
      {/* 只有在有数据时才显示左侧分类菜单 */}
      {shouldShowCategories && (
        <div style={{ 
          width: 120,
          flexShrink: 0, // 防止收缩
          position: 'relative', // 确保滚动条在正确位置
          overflow: 'hidden' // 隐藏外层容器的滚动条，由内部Nav组件管理
        }}>
          <div style={{ 
            backgroundColor: 'var(--semi-color-nav-bg)', 
            height: '100%', 
            borderRight: '1px solid var(--semi-color-border)',
            overflow: 'auto' // 在这一层处理滚动
          }}>
            <Nav
              style={{ 
                width: '100%',
                borderRight: 0,
                minHeight: '100%' // 确保Nav组件占满容器高度
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
        padding: 24,
        overflow: 'auto',
        position: 'relative' // 确保滚动条在正确位置
      }}>
        <Title heading={3} style={{ marginBottom: 24 }}>
          {currentCategory}
          {searchKeyword && currentCategory === '搜索' && (
            <Text type="tertiary" style={{ fontSize: 14, marginLeft: 8 }}>
              搜索: {searchKeyword}
            </Text>
          )}
        </Title>
        
        {isLoadingPlugins ? (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            height: 300
          }}>
            <Spin size="large"/>
          </div>
        ) : pluginsError ? (
          <div style={{ padding: 24 , marginTop: -48}}>
          <Title heading={3} style={{ marginBottom: 24 ,marginLeft:-24}}>插件市场</Title>
          <Empty
            image={<IconAlertCircle style={{ color: 'var(--semi-color-danger)' ,fontSize: 50}} />}
            title="加载失败"
            description={pluginsError}
          />
          </div>
        ) : (
          <div>
            {getCurrentCategoryPlugins().map((plugin, index) => renderPluginCard(plugin, index))}
            
            {/* 修改这里：只有在页面完全加载完毕后才显示"暂无插件" */}
            {isPageLoaded && getCurrentCategoryPlugins().length === 0 && (
              <div style={{ padding: 24, marginTop: -48 }}>
                {currentCategory === '' && (
                  <Title heading={3} style={{ marginBottom: 24, marginLeft: -24 }}>
                    插件市场
                  </Title>
                )}
                <Empty
                  image={<IconEmpty style={{ color: 'var(--semi-color-danger)', fontSize: 50 }} />}
                  title="暂无插件"
                  description={currentCategory === '搜索' ? "没有找到匹配的插件" : "当前分类下没有可用的插件"}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginsMarketPage;