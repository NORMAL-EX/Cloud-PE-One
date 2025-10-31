import React from 'react';
import { Banner } from '@douyinfe/semi-ui';
import { IconClose } from '@douyinfe/semi-icons';
import { useAppContext } from '../utils/AppContext';

interface NotificationBannerProps {
  type: 'info' | 'warning' | 'danger' | 'success';
  content: string;
}

const NotificationBanner: React.FC<NotificationBannerProps> = ({ type, content }) => {
  const { notificationClosed, setNotificationClosed } = useAppContext();

  // 处理关闭按钮点击
  const handleClose = () => {
    setNotificationClosed(true);
    localStorage.setItem("lastClosedNotificationContent", content);
  };

  if (notificationClosed) {
    return null;
  } else {
      return (
    <div style={{ marginTop: 8, marginBottom: 16 }}>
      <Banner
        type={type}
        description={content}
        closeIcon={<IconClose />}
        onClose={handleClose}
        style={{
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
  }
};

export default NotificationBanner;