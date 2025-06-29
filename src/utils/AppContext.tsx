import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppConfig, loadConfig, saveConfig, applyTheme } from './theme';
import type { DriveInfo } from './system';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import { getPlugins, PluginCategory } from '../api/pluginsApi';
import { getNotification } from '../api/notificationApi';
import { getBootDriveUpdateInfo, compareVersions } from '../api/bootDriveUpdateApi';

interface UpdateInfo {
  version: string;
  updateLog: string;
  downloadLink: string;
  appExecutableName: string;
  canSkip: boolean;
}

interface NotificationInfo {
  content: string;
  type: 'info' | 'warning' | 'danger' | 'success';
}

interface AppContextType {
  config: AppConfig;
  bootDrive: DriveInfo | null;
  bootDriveVersion: string | null;
  isLoadingBootDriveVersion: boolean;
  bootDriveUpdateAvailable: boolean;
  isCheckingBootDriveUpdate: boolean;
  bootDriveUpdateBannerClosed: boolean;
  setBootDriveUpdateBannerClosed: (closed: boolean) => void;
  isNetworkConnected: boolean;
  isLoading: boolean;
  updateInfo: UpdateInfo | null;
  isUpdateAvailable: boolean;
  isCheckingUpdate: boolean;
  updateError: string | null;
  updateDialogVisible: boolean;
  // 新增插件数据相关状态
  pluginCategories: PluginCategory[];
  isLoadingPlugins: boolean;
  pluginsError: string | null;
  // 新增通知数据相关状态
  notification: NotificationInfo | null;
  isLoadingNotification: boolean;
  notificationError: string | null;
  notificationClosed: boolean;
  setNotificationClosed: (closed: boolean) => void;
  // 新增搜索相关状态
  searchKeyword: string;
  searchResults: PluginCategory | null;
  setSearchKeyword: (keyword: string) => void;
  // 新增ISO生成状态
  isGeneratingIso: boolean;
  setIsGeneratingIso: (generating: boolean) => void;
  // 原有方法
  setUpdateDialogVisible: (visible: boolean) => void;
  updateConfig: (newConfig: Partial<AppConfig>) => Promise<void>;
  setBootDrive: (drive: DriveInfo | null) => void;
  setNetworkConnected: (connected: boolean) => void;
  setIsLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>({
    themeMode: 'system',
    downloadThreads: 8,
  });
  const [bootDrive, setBootDrive] = useState<DriveInfo | null>(null);
  const [bootDriveVersion, setBootDriveVersion] = useState<string | null>(null);
  const [isLoadingBootDriveVersion, setIsLoadingBootDriveVersion] = useState<boolean>(false);
  const [bootDriveUpdateAvailable, setBootDriveUpdateAvailable] = useState<boolean>(false);
  const [isCheckingBootDriveUpdate, setIsCheckingBootDriveUpdate] = useState<boolean>(false);
  const [bootDriveUpdateBannerClosed, setBootDriveUpdateBannerClosed] = useState<boolean>(false);
  const [isNetworkConnected, setNetworkConnected] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [updateDialogVisible, setUpdateDialogVisible] = useState<boolean>(false);
  
  // 插件数据相关状态
  const [pluginCategories, setPluginCategories] = useState<PluginCategory[]>([]);
  const [isLoadingPlugins, setIsLoadingPlugins] = useState<boolean>(true);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  
  // 通知数据相关状态
  const [notification, setNotification] = useState<NotificationInfo | null>(null);
  const [isLoadingNotification] = useState<boolean>(true);
  const [notificationError] = useState<string | null>(null);
  const [notificationClosed, setNotificationClosed] = useState<boolean>(false);
  
  // 搜索相关状态
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PluginCategory | null>(null);
  
  // ISO生成状态
  const [isGeneratingIso, setIsGeneratingIso] = useState<boolean>(false);
  
  // 使用更新检查钩子
  const { 
    isUpdateAvailable, 
    isCheckingUpdate, 
    updateInfo, 
    error: updateError 
  } = useUpdateCheck();

  // 初始化配置
  useEffect(() => {
    const initConfig = async () => {
      try {
        const loadedConfig = await loadConfig();
        setConfig(loadedConfig);
        applyTheme(loadedConfig.themeMode);

        // 在初始化时获取通知数据
        const notificationInfo = await getNotification();
        setNotification(notificationInfo);

        if (notificationInfo && typeof notificationInfo.content === 'string' && notificationInfo.content.length > 0) {
          // 只有当通知内容有效时才进行记忆功能判断
          const lastClosedNotificationContent = localStorage.getItem('lastClosedNotificationContent');
          if (lastClosedNotificationContent === notificationInfo.content) {
            setNotificationClosed(true); // 内容一致，不显示
          } else {
            setNotificationClosed(false); // 内容不一致，显示
          }
        } else {
          // 如果没有有效的通知内容，则默认关闭通知（不显示）
          setNotificationClosed(true);
        }
      } catch (error) {
        console.error('初始化配置失败:', error);
      }
    };

    initConfig();
  }, []);

  // 在应用启动时获取插件数据
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        setIsLoadingPlugins(true);
        setPluginsError(null);
        
        const data = await getPlugins();
        setPluginCategories(data);
      } catch (err) {
        console.error('获取插件列表失败:', err);
        setPluginsError('获取插件列表失败，请检查网络连接后重试。');
      } finally {
        setIsLoadingPlugins(false);
      }
    };

    fetchPlugins();
  }, []);

  // 监听搜索关键词变化，实时更新搜索结果
  useEffect(() => {
    if (!searchKeyword.trim()) {
      setSearchResults(null);
      return;
    }

    // 搜索逻辑
    const keyword = searchKeyword.toLowerCase().trim();
    const allPlugins = pluginCategories.flatMap(category => category.list);
    
    // 根据关键词筛选插件
    const filteredPlugins = allPlugins.filter(plugin => {
      const name = plugin.name.toLowerCase();
      const author = plugin.author.toLowerCase();
      
      return name.includes(keyword) || 
             keyword.includes(name) || 
             author.includes(keyword) || 
             keyword.includes(author);
    });
    
    // 创建搜索结果分类
    if (filteredPlugins.length > 0) {
      setSearchResults({
        class: '搜索',
        list: filteredPlugins
      });
    } else {
      setSearchResults({
        class: '搜索',
        list: []
      });
    }
  }, [searchKeyword, pluginCategories]);

  // 当启动盘状态变化时，读取版本信息
  useEffect(() => {
    const loadBootDriveVersion = async () => {
      if (!bootDrive) {
        setBootDriveVersion(null);
        return;
      }

      // 检查缓存
      const cacheKey = `bootDriveVersion_${bootDrive.letter}`;
      const cachedVersion = localStorage.getItem(cacheKey);
      if (cachedVersion) {
        setBootDriveVersion(cachedVersion);
        return;
      }

      try {
        setIsLoadingBootDriveVersion(true);
        const { readBootDriveVersion } = await import('./tauriApiWrapper');
        const version = await readBootDriveVersion(bootDrive.letter);
        setBootDriveVersion(version);
        
        // 缓存版本信息
        localStorage.setItem(cacheKey, version);
      } catch (error) {
        console.error('读取启动盘版本失败:', error);
        setBootDriveVersion(null);
      } finally {
        setIsLoadingBootDriveVersion(false);
      }
    };

    loadBootDriveVersion();
  }, [bootDrive]);

  // 检查启动盘升级
  useEffect(() => {
    const checkBootDriveUpdate = async () => {
      // 如果没有启动盘、启动盘版本为空，或者启动盘字母为空字符串，则不检查升级
      if (!bootDrive || !bootDriveVersion || bootDrive.letter === '') {
        setBootDriveUpdateAvailable(false);
        return;
      }

      // 检查缓存
      const cacheKey = 'bootDriveUpdateInfo';
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTime = localStorage.getItem(`${cacheKey}_time`);
      const now = Date.now();
      
      // 缓存有效期为1小时
      if (cachedData && cacheTime && (now - parseInt(cacheTime)) < 3600000) {
        try {
          const updateInfo = JSON.parse(cachedData);
          const needsUpdate = compareVersions(bootDriveVersion, updateInfo.cloudPeVersion);
          setBootDriveUpdateAvailable(needsUpdate);
          return;
        } catch (error) {
          console.error('解析缓存的升级信息失败:', error);
        }
      }

      try {
        setIsCheckingBootDriveUpdate(true);
        const updateInfo = await getBootDriveUpdateInfo();
        
        // 缓存升级信息
        localStorage.setItem(cacheKey, JSON.stringify(updateInfo));
        localStorage.setItem(`${cacheKey}_time`, now.toString());
        
        const needsUpdate = compareVersions(bootDriveVersion, updateInfo.cloudPeVersion);
        setBootDriveUpdateAvailable(needsUpdate);
      } catch (error) {
        console.error('检查启动盘升级失败:', error);
        setBootDriveUpdateAvailable(false);
      } finally {
        setIsCheckingBootDriveUpdate(false);
      }
    };

    checkBootDriveUpdate();
  }, [bootDrive, bootDriveVersion]);

  // 监听启动盘升级Banner关闭状态变化
  useEffect(() => {
    const bannerClosedState = localStorage.getItem('bootDriveUpdateBannerClosed');
    if (bannerClosedState === 'true') {
      setBootDriveUpdateBannerClosed(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('bootDriveUpdateBannerClosed', bootDriveUpdateBannerClosed.toString());
  }, [bootDriveUpdateBannerClosed]);

  // 监听系统主题变化
  useEffect(() => {
    if (config.themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleChange = () => {
        applyTheme('system');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [config.themeMode]);

  // 当检测到更新时，显示更新对话框
  useEffect(() => {
    if (isUpdateAvailable && updateInfo) {
      const skippedVersion = localStorage.getItem("skippedUpdateVersion");
      if (skippedVersion === updateInfo.version) {
        setUpdateDialogVisible(false);
        return;
      }
      // 如果更新不可跳过，立即显示更新对话框
      if (!updateInfo.canSkip) {
        setUpdateDialogVisible(true);
      } else {
        // 可跳过的更新，延迟显示对话框，给用户一些时间先看到应用界面
        const timer = setTimeout(() => {
          setUpdateDialogVisible(true);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isUpdateAvailable, updateInfo]);

  // 更新配置
  const updateConfig = async (newConfig: Partial<AppConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    await saveConfig(updatedConfig);
    
    if (newConfig.themeMode) {
      applyTheme(newConfig.themeMode);
    }
  };

  const value = {
    config,
    bootDrive,
    bootDriveVersion,
    isLoadingBootDriveVersion,
    bootDriveUpdateAvailable,
    isCheckingBootDriveUpdate,
    bootDriveUpdateBannerClosed,
    setBootDriveUpdateBannerClosed,
    isNetworkConnected,
    isLoading,
    updateInfo,
    isUpdateAvailable,
    isCheckingUpdate,
    updateError,
    updateDialogVisible,
    // 新增插件数据相关状态
    pluginCategories,
    isLoadingPlugins,
    pluginsError,
    // 新增通知数据相关状态
    notification,
    isLoadingNotification,
    notificationError,
    notificationClosed,
    setNotificationClosed,
    // 新增搜索相关状态
    searchKeyword,
    searchResults,
    setSearchKeyword,
    // 新增ISO生成状态
    isGeneratingIso,
    setIsGeneratingIso,
    // 原有方法
    setUpdateDialogVisible,
    updateConfig,
    setBootDrive,
    setNetworkConnected,
    setIsLoading,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};