import React from 'react';
import { Typography, Select, Card, Collapse, Button } from '@douyinfe/semi-ui';
import { useAppContext } from '../utils/AppContext';
import type { ThemeMode, DownloadThreads } from '../utils/theme';
import { openUrl } from '../utils/tauriApiWrapper';
import { openDevTools } from '../utils/system';
import { IconGithubLogo } from '@douyinfe/semi-icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const SettingsPage: React.FC = () => {
  const { config, updateConfig } = useAppContext();

  const handleThemeChange = (value: string | number | any[] | Record<string, any> | undefined) => {
    updateConfig({ themeMode: value as ThemeMode });
  };

  const handleThreadsChange = (value: string | number | any[] | Record<string, any> | undefined) => {
    updateConfig({ downloadThreads: Number(value) as DownloadThreads });
  };

  // 这个函数已经存在，用于在外部浏览器打开URL
  const handleOpenLink = async (url: string) => {
    await openUrl(url);
  };

  const handleOpenDevTools = async () => {
    await openDevTools();
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
                </Select>
              </div>

              <div>
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
                      <Text>由开发者 <strong>Hello,World</strong> 与 <strong>RUZ-EX</strong> 共同开发并发布</Text>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong>技术栈:</Text>
                      <Text> Tauri, Rust, TypeScript, Vite, React, Semi Design</Text>
                    </div>
                    <div>
                      <Text strong>Copyright © 2026-现在 Cloud-PE Dev.</Text>
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
                  {/* RUZ-EXの博客 */}
                  <span
                    className="semi-typography semi-typography-normal semi-typography-link"
                    style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => handleOpenLink('https://blog.ce-ramos.cn/' )}
                  >
                    <span className="semi-typography-link-text">RUZ-EXの博客</span>
                  </span>
                </div>
              </Card>
            </div>

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
      </div>
    </div>
  );
};

export default SettingsPage;