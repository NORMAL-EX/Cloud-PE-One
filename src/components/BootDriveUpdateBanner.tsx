import React from 'react';
import { Banner, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

interface BootDriveUpdateBannerProps {
  onNavigateToUpgrade: () => void;
  onClose: () => void;
}

const BootDriveUpdateBanner: React.FC<BootDriveUpdateBannerProps> = ({  
  onClose 
}) => {
  return (
    <Banner
      type="danger"
      onClose={onClose}
      description={
        <Text>
          你的Cloud-PE不是最新版本，建议您<strong>立即升级</strong>
        </Text>
      }
    />
  );
};

export default BootDriveUpdateBanner;

