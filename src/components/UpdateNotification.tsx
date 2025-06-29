import React, { useState } from 'react';
import { Modal, Button, Typography, Spin, Banner } from '@douyinfe/semi-ui';
import { IconAlertTriangle } from '@douyinfe/semi-icons';
import { invoke } from '../utils/tauriApiWrapper';
import ReactMarkdown from 'react-markdown';

const { Text, Title } = Typography;

interface UpdateNotificationProps {
  visible: boolean;
  onClose: () => void;
  version: string;
  updateLog: string;
  downloadLink: string;
  appExecutableName: string;
  canSkip: boolean;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  visible,
  onClose,
  version,
  updateLog,
  downloadLink,
  appExecutableName,
  canSkip
}) => {
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('0.00');
  const [error, setError] = useState<string | null>(null);

  // 处理更新按钮点击
  const handleUpdate = async () => {
    try {
      setDownloading(true);
      setError(null);

      // 调用Rust下载函数
      await invoke('download_update', {
        url: downloadLink,
        appName: appExecutableName
      });

      // 启动下载进度监控
      const progressInterval = setInterval(async () => {
        try {
          const status = await invoke('get_app_download_status');
          if (status) {
            const { progress, speed } = status as { progress: number; speed: string };
            setDownloadProgress(progress);
            setDownloadSpeed(speed);

            // 如果下载完成，清除定时器
            if (progress === 100) {
              clearInterval(progressInterval);
              // 下载完成后，调用安装函数
              await invoke('install_update', { appName: appExecutableName });
              // 安装后应用会重启，不需要额外处理
            }
          }
        } catch (err) {
          console.error('获取下载状态失败:', err);
        }
      }, 1000);

    } catch (err) {
      console.error('更新失败:', err);
      setError('更新过程中出现错误，请稍后重试。');
      setDownloading(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("skippedUpdateVersion", version);
    onClose();
  };

  // 格式化更新日志，处理换行符
  const formattedUpdateLog = updateLog.split('\\n').join('\n');

  return (
    <Modal
      title={canSkip ? "🎉Cloud-PE One 有可用的更新，是否立即升级？" : "😥您目前所使用的Cloud-PE One已被抛弃，请立即升级新版本以继续使用该软件"}
      visible={visible}
      onCancel={canSkip ? onClose : undefined}
      closeOnEsc={canSkip}
      closable={canSkip}
      maskClosable={canSkip}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {canSkip && !downloading && (
            <Button type="tertiary" onClick={handleSkip} style={{ marginRight: 8 }}>
              跳过此版本
            </Button>
          )}
          {canSkip && !downloading && (
            <Button type="tertiary" onClick={onClose} style={{ marginRight: 8 }}>
              稍后再说
            </Button>
          )}
          <Button
            type="primary"
            loading={downloading}
            onClick={handleUpdate}
            disabled={downloading}
          >
            {downloading ? `正在更新 (${downloadProgress}%)` : '立即升级'}
          </Button>
        </div>
      }
      style={{ width: 500 }}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Text>发现新版本: Cloud-PE One {version}</Text>
        </div>

        {error && (
          <Banner
            type="danger"
            description={error}
            style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ 
          maxHeight: 300, 
          overflowY: 'auto', 
          border: '1px solid var(--semi-color-border)', 
          borderRadius: 4,
          padding: 16,
          whiteSpace: 'pre-wrap'
        }}>
          <Title heading={6} style={{ marginBottom: 8 }}>更新日志:</Title>
          <ReactMarkdown>{formattedUpdateLog}</ReactMarkdown>
        </div>
      </div>
    </Modal>
  );
};

export default UpdateNotification;



