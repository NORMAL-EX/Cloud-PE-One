import React from 'react';
import { Typography, Button } from '@douyinfe/semi-ui';

const { Title } = Typography;

const UpgradeBootDrivePage: React.FC = () => {
  const handleUpgrade = () => {
    // 这里可以添加升级逻辑
    console.log('开始升级启动盘');
  };

  return (
    <div style={{ 
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%'
    }}>
      <Title heading={2} style={{ marginBottom: 32 }}>升级</Title>
      <Button 
        type="primary" 
        size="large"
        onClick={handleUpgrade}
      >
        test
      </Button>
    </div>
  );
};

export default UpgradeBootDrivePage;

