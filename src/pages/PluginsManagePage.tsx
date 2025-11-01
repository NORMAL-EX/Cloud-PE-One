import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, Spin, Notification, Empty, Collapse, Tag } from '@douyinfe/semi-ui';
import { IconAlertCircle, IconInfoCircle } from '@douyinfe/semi-icons';
import { useAppContext } from '../utils/AppContext';
import { getPluginFiles, enablePlugin, disablePlugin, updatePlugin, generatePluginId, compareVersions, Plugin } from '../api/pluginsApi';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const PluginsManagePage: React.FC = () => {
  const { bootDrive, pluginListRefreshTrigger, pluginCategories, isNetworkConnected, config, triggerPluginListRefresh } = useAppContext();
  const [enabledPlugins, setEnabledPlugins] = useState<Plugin[]>([]);
  const [disabledPlugins, setDisabledPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [processingPlugins, setProcessingPlugins] = useState<Record<string, boolean>>({});
  const [updatablePlugins, setUpdatablePlugins] = useState<Set<string>>(new Set());
  const [recentlyUpdatedPlugins, setRecentlyUpdatedPlugins] = useState<Set<string>>(new Set());

  // 加载插件文件列表
  const fetchPluginFiles = async () => {
    // 如果没有启动盘，不加载插件
    if (!bootDrive) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const { enabled, disabled } = await getPluginFiles(bootDrive.letter);
      setEnabledPlugins(enabled);
      setDisabledPlugins(disabled);

      // 如果联网且有插件市场数据，检查更新
      if (isNetworkConnected && pluginCategories.length > 0 && enabled.length > 0) {
        checkForUpdates(enabled);
      }
    } catch (err) {
      console.error('加载插件文件失败:', err);
      setError('加载插件文件失败，请确保启动盘已正确插入。');
    } finally {
      setLoading(false);
    }
  };

  // 检查插件更新
  const checkForUpdates = (localPlugins: Plugin[]) => {
    const updatable = new Set<string>();
    
    // 创建市场插件映射
    const marketPluginsMap = new Map<string, Plugin>();
    pluginCategories.forEach(category => {
      category.list.forEach(plugin => {
        const id = generatePluginId(plugin.name, plugin.author);
        marketPluginsMap.set(id, plugin);
      });
    });

    // 检查每个本地已启用插件
    localPlugins.forEach(localPlugin => {
      if (localPlugin.id) {
        const marketPlugin = marketPluginsMap.get(localPlugin.id);
        if (marketPlugin) {
          const comparison = compareVersions(localPlugin.version, marketPlugin.version);
          if (comparison < 0) {
            updatable.add(localPlugin.id);
          }
        }
      }
    });

    setUpdatablePlugins(updatable);
  };

  // 对插件进行排序：有更新的在最上面，刚更新的在中间，其他的在最下面
  const sortPluginsByUpdate = (plugins: Plugin[]): Plugin[] => {
    return [...plugins].sort((a, b) => {
      const aHasUpdate = a.id && updatablePlugins.has(a.id);
      const bHasUpdate = b.id && updatablePlugins.has(b.id);
      const aRecentlyUpdated = a.id && recentlyUpdatedPlugins.has(a.id);
      const bRecentlyUpdated = b.id && recentlyUpdatedPlugins.has(b.id);

      // 有更新的排在最前面
      if (aHasUpdate && !bHasUpdate) return -1;
      if (!aHasUpdate && bHasUpdate) return 1;

      // 刚更新的排在中间（有更新的下面，无更新的上面）
      if (aRecentlyUpdated && !bRecentlyUpdated && !bHasUpdate) return -1;
      if (!aRecentlyUpdated && bRecentlyUpdated && !aHasUpdate) return 1;

      // 其他保持原顺序
      return 0;
    });
  };

  // 初始加载和监听刷新触发器
  useEffect(() => {
    fetchPluginFiles();
  }, [bootDrive, pluginListRefreshTrigger]);

  // 当网络状态或插件市场数据变化时，重新检查更新
  useEffect(() => {
    if (isNetworkConnected && pluginCategories.length > 0 && enabledPlugins.length > 0) {
      checkForUpdates(enabledPlugins);
    } else {
      setUpdatablePlugins(new Set());
    }
  }, [isNetworkConnected, pluginCategories, enabledPlugins]);

  // 更新插件文件名后缀的辅助函数
  const updatePluginFileName = (plugin: Plugin, newExtension: string): Plugin => {
    const baseName = plugin.file.replace(/\.(ce|CBK)$/i, '');
    return {
      ...plugin,
      file: `${baseName}.${newExtension}`
    };
  };

  // 启用插件
  const handleEnablePlugin = async (plugin: Plugin) => {
    if (!bootDrive) return;
    
    try {
      console.log('启用插件:', plugin.file);
      setProcessingPlugins(prev => ({ ...prev, [plugin.file]: true }));
      
      const success = await enablePlugin(bootDrive.letter, plugin.file);
      
      if (success) {
        // 创建更新后的插件对象（禁用状态的.CBK文件启用后变成.ce文件）
        const updatedPlugin = updatePluginFileName(plugin, 'ce');
        // 启用后需要分配唯一ID
        updatedPlugin.id = generatePluginId(updatedPlugin.name, updatedPlugin.author);
        
        // 更新状态
        setDisabledPlugins(prev => prev.filter(p => p.file !== plugin.file));
        setEnabledPlugins(prev => [...prev, updatedPlugin]);
        
        Notification.success({
          title: '成功',
          content: `插件 ${plugin.name} 已启用`,
          duration: 3,
        });
      }
    } catch (err) {
      console.error('启用插件失败:', err);
      Notification.error({
        title: '错误',
        content: `启用插件 ${plugin.name} 失败`,
        duration: 3,
      });
    } finally {
      setProcessingPlugins(prev => ({ ...prev, [plugin.file]: false }));
    }
  };

  // 禁用插件
  const handleDisablePlugin = async (plugin: Plugin) => {
    if (!bootDrive) return;
    
    try {
      console.log('禁用插件:', plugin.file);
      setProcessingPlugins(prev => ({ ...prev, [plugin.file]: true }));
      
      const success = await disablePlugin(bootDrive.letter, plugin.file);
      
      if (success) {
        // 创建更新后的插件对象（启用状态的.ce文件禁用后变成.CBK文件）
        const updatedPlugin = updatePluginFileName(plugin, 'CBK');
        // 禁用后移除唯一ID
        delete updatedPlugin.id;
        
        // 更新状态
        setEnabledPlugins(prev => prev.filter(p => p.file !== plugin.file));
        setDisabledPlugins(prev => [...prev, updatedPlugin]);
        
        Notification.success({
          title: '成功',
          content: `插件 ${plugin.name} 已禁用`,
          duration: 3,
        });
      }
    } catch (err) {
      console.error('禁用插件失败:', err);
      Notification.error({
        title: '错误',
        content: `禁用插件 ${plugin.name} 失败`,
        duration: 3,
      });
    } finally {
      setProcessingPlugins(prev => ({ ...prev, [plugin.file]: false }));
    }
  };

  // 更新插件
  const handleUpdatePlugin = async (plugin: Plugin) => {
    if (!bootDrive || !plugin.id) return;

    // 从插件市场找到对应的新版本插件
    let marketPlugin: Plugin | null = null;
    for (const category of pluginCategories) {
      const found = category.list.find(p => generatePluginId(p.name, p.author) === plugin.id);
      if (found) {
        marketPlugin = found;
        break;
      }
    }

    if (!marketPlugin) {
      Notification.error({
        title: '错误',
        content: '未找到插件市场中的对应版本',
        duration: 3,
      });
      return;
    }

    try {
      console.log('更新插件:', plugin.file, '到版本:', marketPlugin.version);
      setProcessingPlugins(prev => ({ ...prev, [plugin.file]: true }));

      const newFileName = `${marketPlugin.name}_${marketPlugin.version}_${marketPlugin.author}_${marketPlugin.describe}.ce`;

      await updatePlugin(
        marketPlugin.link,
        plugin.file,
        newFileName,
        bootDrive.letter,
        config.downloadThreads
      );

      // 标记为刚更新的插件
      const newPluginId = generatePluginId(marketPlugin.name, marketPlugin.author);
      setRecentlyUpdatedPlugins(prev => new Set(prev).add(newPluginId));
      
      // 5秒后移除"刚更新"标记
      setTimeout(() => {
        setRecentlyUpdatedPlugins(prev => {
          const updated = new Set(prev);
          updated.delete(newPluginId);
          return updated;
        });
      }, 5000);

      // 触发插件列表刷新
      triggerPluginListRefresh();

      Notification.success({
        title: '更新成功',
        content: `插件 ${plugin.name} 已更新到最新版本`,
        duration: 3,
      });
    } catch (err) {
      console.error('更新插件失败:', err);
      Notification.error({
        title: '错误',
        content: `插件 ${plugin.name} 更新失败`,
        duration: 3,
      });
    } finally {
      setProcessingPlugins(prev => ({ ...prev, [plugin.file]: false }));
    }
  };

  // 渲染插件卡片
  const renderPluginCard = (plugin: Plugin, isEnabled: boolean) => {
    const isProcessing = processingPlugins[plugin.file];
    const canUpdate = plugin.id && updatablePlugins.has(plugin.id);
    
    return (
      <Card
        key={plugin.file}
        style={{ 
          width: '100%', 
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)'
        }}
        bodyStyle={{ padding: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <Title heading={5} style={{ marginBottom: 0, marginRight: 8 }}>{plugin.name}</Title>
              {canUpdate && <Tag color="orange">有更新</Tag>}
            </div>
            <Paragraph style={{ marginBottom: 8 }}>{plugin.describe}</Paragraph>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <Text type="tertiary">版本: {plugin.version}</Text>
              <Text type="tertiary">大小: {plugin.size}</Text>
              <Text type="tertiary">作者: {plugin.author}</Text>
              <Text type="tertiary">文件: {plugin.file}</Text>
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center',
            alignItems: 'center',
            minWidth: 100,
            gap: 8
          }}>
            {isProcessing ? (
              <Spin size="middle" />
            ) : (
              <>
                {canUpdate && (
                  <Button 
                    type="warning" 
                    onClick={() => handleUpdatePlugin(plugin)}
                  >
                    更新
                  </Button>
                )}
                {isEnabled ? (
                  <Button 
                    type="danger" 
                    onClick={() => handleDisablePlugin(plugin)}
                  >
                    禁用
                  </Button>
                ) : (
                  <Button 
                    type="primary" 
                    onClick={() => handleEnablePlugin(plugin)}
                  >
                    启用
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </Card>
    );
  };

  // 如果没有启动盘，显示提示
  if (!bootDrive) {
    return (
      <div style={{ 
        padding: 24, 
        height: '84vh', 
        display: 'flex', 
        flexDirection: 'column' 
      }}>
        <Title heading={3} style={{ marginBottom: 24 }}>插件管理</Title>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Empty
            image={<IconAlertCircle style={{ color: 'var(--semi-color-warning)', fontSize: 50}} />}
            title="尚未准备就绪"
            description="目前您还尚未安装或制作Cloud-PE启动盘，因此该功能暂不可用！"
          />
        </div>
      </div>
    );
  }

  // 对已启用插件进行排序
  const sortedEnabledPlugins = sortPluginsByUpdate(enabledPlugins);

  return (
    <div style={{ 
      padding: 24, 
      height: '84vh', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <Title heading={3} style={{ marginBottom: 24, flexShrink: 0 }}>插件管理</Title>
      
      {loading ? (
        <div style={{ 
          flex: 1,
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center'
        }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty
            image={<IconAlertCircle style={{ color: 'var(--semi-color-danger)', fontSize: 50}}/>}
            title="加载失败"
            description={error}
          />
        </div>
      ) : (
        <div style={{ 
          flex: 1, 
          overflow: 'auto',
          paddingRight: 8
        }}>
          <Collapse defaultActiveKey={['enabled', 'disabled']}>
            <Panel 
              header={`已启用插件 (${enabledPlugins.length})`} 
              itemKey="enabled"
            >
              {sortedEnabledPlugins.length > 0 ? (
                sortedEnabledPlugins.map(plugin => renderPluginCard(plugin, true))
              ) : (
                <Empty
                  image={<IconInfoCircle style={{ color: 'var(--semi-color-info)', fontSize: 50}}/>}
                  title="暂无已启用插件"
                  description="您可以从插件市场下载插件，或启用已禁用的插件"
                />
              )}
            </Panel>
            
            <Panel 
              header={`已禁用插件 (${disabledPlugins.length})`} 
              itemKey="disabled"
            >
              {disabledPlugins.length > 0 ? (
                disabledPlugins.map(plugin => renderPluginCard(plugin, false))
              ) : (
                <Empty
                  image={<IconInfoCircle style={{ color: 'var(--semi-color-info)', fontSize: 50}}/>}
                  title="暂无已禁用插件"
                  description="您可以禁用不需要的插件"
                />
              )}
            </Panel>
          </Collapse>
        </div>
      )}
    </div>
  );
};

export default PluginsManagePage;
