import React, { useEffect, useRef } from 'react';
import { Spin } from '@douyinfe/semi-ui';

const DocsPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    const handleIframeLoad = () => {
      setLoading(false);
    };

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
    }

    return () => {
      if (iframe) {
        iframe.removeEventListener('load', handleIframeLoad);
      }
    };
  }, []);

  return (
    <div style={{ height: 'calc(100vh - 48px)', position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'var(--semi-color-bg-0)',
          zIndex: 1
        }}>
          <Spin size="large" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="https://docs.ce-ramos.cn"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        title="Cloud-PE 文档"
      />
    </div>
  );
};

export default DocsPage;

