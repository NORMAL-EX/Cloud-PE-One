import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Select, Card, Collapse, Button, Switch, Input, Notification, Spin, Modal } from '@douyinfe/semi-ui';
import { useAppContext } from '../utils/AppContext';
import type { ThemeMode, DownloadThreads } from '../utils/theme';
import { openUrl } from '../utils/tauriApiWrapper';
import { openDevTools } from '../utils/devtools';
import { IconGithubLogo } from '@douyinfe/semi-icons';

const { Text, Paragraph } = Typography;
const { Option } = Select;

const SettingsPage: React.FC = () => {
  const { 
    config, 
    updateConfig, 
    isMicaSupported, 
    isCheckingMicaSupport,
    allBootDrives,
    bootDrive,
    switchBootDrive
  } = useAppContext();
  const [userNickname, setUserNickname] = useState(config.userNickname || '');
  const saveTimeoutRef = useRef<number | null>(null);
  
  // 新增：启动盘切换相关状态
  const [selectedBootDrive, setSelectedBootDrive] = useState<string>(bootDrive?.letter || '');
  const [showBootDriveModal, setShowBootDriveModal] = useState(false);
  const [pendingBootDrive, setPendingBootDrive] = useState<string>('');

  // 监听配置变化，同步用户称呼
  useEffect(() => {
    setUserNickname(config.userNickname || '');
  }, [config.userNickname]);

  // 监听启动盘变化
  useEffect(() => {
    if (bootDrive?.letter) {
      setSelectedBootDrive(bootDrive.letter);
    }
  }, [bootDrive]);

  // 自定义防抖保存函数
  const debouncedSave = useCallback((nickname: string) => {
    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置新的定时器
    saveTimeoutRef.current = window.setTimeout(async () => {
      if (nickname.trim() && nickname.trim() !== config.userNickname) {
        try {
          await updateConfig({ userNickname: nickname.trim() });
        } catch (error) {
          console.error('保存用户称呼失败:', error);
        }
      }
    }, 500); // 500ms 防抖延迟
  }, [config.userNickname, updateConfig]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleThemeChange = (value: string | number | any[] | Record<string, any> | undefined) => {
    updateConfig({ themeMode: value as ThemeMode });
  };

  const handleThreadsChange = (value: string | number | any[] | Record<string, any> | undefined) => {
    updateConfig({ downloadThreads: Number(value) as DownloadThreads });
  };

  const handleWebSearchToggle = (checked: boolean) => {
    updateConfig({ enablePluginWebSearch: checked });
  };

  const handleUserNicknameChange = (value: string) => {
    setUserNickname(value);
    // 如果个性化欢迎语已启用，触发自动保存
    if (config.enablePersonalizedGreeting) {
      debouncedSave(value);
    }
  };

  const handlePersonalizedGreetingToggle = (checked: boolean) => {
    updateConfig({ enablePersonalizedGreeting: checked });
  };

  // 修改：处理窗口效果切换
  const handleWindowEffectsToggle = (checked: boolean) => {
    // 如果系统不支持 Mica，显示警告并不执行操作
    if (checked && !isMicaSupported) {
      Notification.warning({
        title: '提示',
        content: '当前系统版本不支持 Mica 效果，请升级到 Windows 11 22H2 及以上版本的系统',
        duration: 3,
      });
      return;
    }
    
    updateConfig({ enableWindowEffects: checked ? 'full' : 'off' });
  };

  // 处理启动盘选择变化
  const handleBootDriveChange = async (value: string | number | any[] | Record<string, any> | undefined) => {
    const driveLetter = value as string;
    if (driveLetter !== bootDrive?.letter) {
      // 检查选择的启动盘是否已经是默认的
      const defaultDriveLetter = localStorage.getItem('defaultBootDrive');
      
      if (defaultDriveLetter === driveLetter) {
        // 如果已经是默认的，直接切换，不显示模态框
        await switchBootDrive(driveLetter);
        setSelectedBootDrive(driveLetter);
        
        Notification.success({
          title: '成功',
          content: `已切换到启动盘 ${driveLetter}`,
          duration: 3,
        });
      } else {
        // 如果不是默认的，显示模态框询问
        setPendingBootDrive(driveLetter);
        setShowBootDriveModal(true);
      }
    }
  };

  // 处理模态框确认
  const handleBootDriveModalOk = async () => {
    if (pendingBootDrive) {
      // 保存为默认启动盘
      localStorage.setItem('defaultBootDrive', pendingBootDrive);
      
      // 切换启动盘
      await switchBootDrive(pendingBootDrive);
      setSelectedBootDrive(pendingBootDrive);
      
      Notification.success({
        title: '成功',
        content: `已切换到启动盘 ${pendingBootDrive}`,
        duration: 3,
      });
    }
    setShowBootDriveModal(false);
    setPendingBootDrive('');
  };

  // 处理模态框取消
  const handleBootDriveModalCancel = async () => {
    if (pendingBootDrive) {
      // 不保存为默认，但仍然切换
      await switchBootDrive(pendingBootDrive);
      setSelectedBootDrive(pendingBootDrive);
      
      Notification.success({
        title: '成功',
        content: `已切换到启动盘 ${pendingBootDrive}（未设为默认）`,
        duration: 3,
      });
    }
    setShowBootDriveModal(false);
    setPendingBootDrive('');
  };

  // 这个函数已经存在，用于在外部浏览器打开URL
  const handleOpenLink = async (url: string) => {
    await openUrl(url);
  };

  // 处理打开开发者工具
  const handleOpenDevTools = async () => {
    try {
      await openDevTools();
      Notification.success({
        title: '成功',
        content: '已成功打开开发人员工具',
        duration: 3,
      });
    } catch (error) {
      Notification.error({
        title: '失败',
        content: '打开开发人员工具失败',
        duration: 3,
      });
    }
  };

  // 处理测试通知
  const handleTestNotification = () => {
    Notification.info({
      title: '信息',
      content: '已成功完成此操作',
      duration: 3,
    });
  };

  // 判断窗口效果是否应该被禁用
  const isWindowEffectsDisabled = () => {
    return config.themeMode !== 'system' || !isMicaSupported;
  };

  // 获取窗口效果禁用的原因
  const getWindowEffectsDisabledReason = () => {
    if (config.themeMode !== 'system') {
      return '（仅在跟随系统颜色模式下可用）';
    }
    if (!isMicaSupported) {
      return '（需要 Windows 11 Build 22621 或更高版本）';
    }
    return '';
  };

  return (
    <div style={{
      height: '92vh',
      overflow: 'auto',
      padding: 0
    }}>
      <div style={{
        padding: 16,
        maxWidth: 800,
        margin: '0 auto',
        minHeight: 'calc(100vh - 32px)', // 确保内容至少占满视口高度减去padding
        boxSizing: 'border-box'
      }}>
        <Collapse defaultActiveKey={['client-settings', 'about']}>
          <Collapse.Panel header="客户端设置" itemKey="client-settings">
            <div style={{ padding: '8px 0' }}>
              {/* 用户称呼设置 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12,
                  marginBottom: 8
                }}>
                  用户称呼：
                  <Input
                    value={userNickname}
                    onChange={handleUserNicknameChange}
                    placeholder="请输入您的称呼"
                    style={{ width: 180 }} 
                    maxLength={20}
                    disabled={!config.enablePersonalizedGreeting} // 根据个性化欢迎语设置禁用
                  />
                </div>
              </div>

              {/* 启用个性化欢迎语设置 */}
              <div style={{ 
                marginBottom: 16,
                display: 'flex', 
                alignItems: 'center',
                gap: 12
              }}>
                启用个性化欢迎语：
                <Switch
                  checked={config.enablePersonalizedGreeting}
                  onChange={handlePersonalizedGreetingToggle}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                下载线程数：
                <Select
                  value={config.downloadThreads}
                  onChange={handleThreadsChange}
                  style={{ width: 120 }}
                >
                  <Option value={8}>8</Option>
                  <Option value={16}>16</Option>
                  <Option value={32}>32</Option>
                  <Option value={64}>64</Option>
                </Select>
                {config.downloadThreads > 32 && (
                  <Text type="tertiary" size="small" style={{ marginLeft: 8 }}>
                    （当前下载线程数大于32线程，可能出现稳定性问题）
                  </Text>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                颜色模式：
                <Select
                  value={config.themeMode}
                  onChange={handleThemeChange}
                  style={{ width: 120 }}
                >
                  <Option value="system">跟随系统</Option>
                  <Option value="light">浅色模式</Option>
                  <Option value="dark">深色模式</Option>
                </Select>
              </div>

              {/* 新增：启动盘选择（仅在有多个启动盘时显示） */}
              {allBootDrives.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  使用启动盘：
                  <Select
                    value={selectedBootDrive}
                    onChange={handleBootDriveChange}
                    style={{ width: 90 }}
                  >
                    {allBootDrives.map(drive => {
                      return (
                        <Option key={drive.letter} value={drive.letter}>
                          {drive.letter}
                        </Option>
                      );
                    })}
                  </Select>
                </div>
              )}

              {/* 新增：启用窗口效果设置 */}
              <div style={{ 
                marginBottom: 16,
                display: 'flex', 
                alignItems: 'center',
                gap: 12
              }}>
                启用 Mica 效果：
                {isCheckingMicaSupport ? (
                  <Spin size="small" style={{ marginRight: 8 }} />
                ) : (
                  <>
                    <Switch
                      checked={config.enableWindowEffects !== 'off'}
                      onChange={handleWindowEffectsToggle}
                      disabled={isWindowEffectsDisabled()}
                    />
                    {isWindowEffectsDisabled() && (
                      <Text type="tertiary" size="small">
                        {getWindowEffectsDisabledReason()}
                      </Text>
                    )}
                  </>
                )}
              </div>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: 12
              }}>
                开启插件市场"搜索"按钮：
                <Switch
                  checked={config.enablePluginWebSearch}
                  onChange={handleWebSearchToggle}
                />
              </div>
            </div>
          </Collapse.Panel>

          <Collapse.Panel header="关于" itemKey="about">
            <div style={{ padding: '12px 0' }}>
              <div style={{
                display: 'flex',
                gap: 16,
                marginBottom: 16,
                flexWrap: 'wrap'
              }}>
                <Card title="关于 Cloud-PE One" style={{ 
                  flex: 1, 
                  minWidth: 300,
                  height: 'auto' // 让卡片高度自适应内容
                }}>
                  <Paragraph>
                    <div style={{ marginBottom: 8 }}>
                      <Text>由开发者 <strong>dddffgg</strong> 与 <strong>Hello,World!</strong> 共同开发并发布</Text>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong>技术栈:</Text>
                      <Text> Tauri, Rust, TypeScript, Vite, React, Semi Design</Text>
                    </div>
                    <div>
                      <Text strong>Copyright © 2025-现在 Cloud-PE Dev.</Text>
                    </div>
                  </Paragraph>
                </Card>

                <Card title="相关链接" style={{ flex: 1, minWidth: 300, maxHeight: 180 }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    gap: 8
                  }}>
                    {/* Cloud-PE官方网站 */}
                    <span
                      className="semi-typography semi-typography-normal semi-typography-link"
                      style={{ cursor: 'pointer', textDecoration: 'underline' }} // 添加样式使其看起来像链接
                      onClick={() => handleOpenLink('https://cloud-pe.cn/' )}
                    >
                      <span className="semi-typography-link-text">Cloud-PE官方网站</span>
                    </span>
                    {/* 相关文档 */}
                    <span
                      className="semi-typography semi-typography-normal semi-typography-link"
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => handleOpenLink('https://docs.cloud-pe.cn/' )}
                    >
                      <span className="semi-typography-link-text">相关文档</span>
                    </span>
                    {/* dddffggの博客 */}
                    <span
                      className="semi-typography semi-typography-normal semi-typography-link"
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => handleOpenLink('https://blog.cloud-pe.cn/' )}
                    >
                      <span className="semi-typography-link-text">dddffggの博客</span>
                    </span>
                  </div>
                </Card>
              </div>

              <Card title="工具" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Button 
                    onClick={handleOpenDevTools}
                  >
                    开发人员工具
                  </Button>
                  <Button 
                    onClick={handleTestNotification}
                  >
                    测试
                  </Button>
                </div>
              </Card>

              <Card title="开源" style={{ marginBottom: 16 }}> {/* 添加底部边距 */}
                <div style={{ marginBottom: 8 }}>
                  开源协议：Apache 2.0
                </div>
                <div style={{ marginTop: 12 }}>
                  <Button
                    icon={<IconGithubLogo />}
                    style={{ color: 'var(--semi-color-text-0)' }}
                    onClick={() => handleOpenLink('https://github.com/NORMAL-EX/Cloud-PE-One' )}
                  >
                    在 GitHub 上浏览
                  </Button>
                </div>
              </Card>
            </div>
          </Collapse.Panel>
        </Collapse>

        {/* 启动盘切换确认模态框 */}
        <Modal
          title="切换启动盘"
          visible={showBootDriveModal}
          onOk={handleBootDriveModalOk}
          onCancel={handleBootDriveModalCancel}
          okText="是"
          cancelText="否"
          centered
        >
          <Text>是否将此启动盘设置为默认启动盘？</Text>
        </Modal>
      </div>
    </div>
  );
};

export default SettingsPage;