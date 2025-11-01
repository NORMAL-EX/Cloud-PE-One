import React from 'react';
import { Button, Typography } from '@douyinfe/semi-ui';

const { Title } = Typography;

interface PlaceholderPageProps {
  title: string;
}

const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title }) => {
  return (
    <div style={{ 
      padding: 24, 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      // 修改高度计算，避免与侧边栏冲突
      height: 'calc(100% - 24px)',
      // 添加最小高度，确保内容显示正常
      minHeight: '300px'
    }}>
      <Title heading={2} style={{ marginBottom: 24 }}>{title}</Title>
      <Button>test</Button>
    </div>
  );
};

export default PlaceholderPage;

