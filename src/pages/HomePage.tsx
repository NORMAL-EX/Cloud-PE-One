import React, { useState, useEffect, useMemo } from 'react';
import { Typography, Button, Tag } from '@douyinfe/semi-ui';
import { useAppContext } from '../utils/AppContext';
import NotificationBanner from '../components/NotificationBanner';

const { Title, Text } = Typography;

interface HomePageProps {
  onNavigate: (page: string) => void;
}

// 定义欢迎语配置
interface GreetingConfig {
  startTime: string; // 格式 "HH:MM"
  endTime?: string;  // 格式 "HH:MM"，如果没有表示精确时间
  message: string;   // 消息模板，使用 {userName} 占位符
}

// 工作日欢迎语配置数组 - 易于扩展
const greetingConfigs: GreetingConfig[] = [
  // 凌晨时段
  { startTime: "00:00", endTime: "00:59", message: '<div class="emoji moon"></div>夜猫子{userName}，是在偷偷卷吗？' },
  { startTime: "01:00", endTime: "04:59", message: '<div class="emoji owl"></div>{userName}，熬夜伤身，早点休息吧~' },
  { startTime: "05:00", endTime: "05:59", message: '<div class="emoji bird"></div>早起的{userName}，今天一定会很好的！' },
  
  // 早晨时段
  { startTime: "06:00", endTime: "06:59", message: '<div class="emoji Sun_with_face"></div>{userName}早上好，新的一天就此开始吧！' },
  { startTime: "07:00", endTime: "07:59", message: '<div class="emoji Hot_beverage"></div>早安{userName}，来杯咖啡开启美好的一天吧' },
  { startTime: "08:00", endTime: "08:59", message: '<div class="emoji Flexed_biceps"></div>{userName}，元气满满的早晨，加油！' },
  { startTime: "09:00", endTime: "09:59", message: '<div class="emoji Rocket"></div>嗨{userName}，美好的上午时光开始啦！' },
  { startTime: "10:00", endTime: "10:59", message: '<div class="emoji Waving_hand"></div>上午好呀，{userName}！' },
  
  // 中午时段
  { startTime: "12:00", endTime: "12:59", message: '<div class="emoji Steaming_bowl"></div>午饭时间到！{userName}记得好好吃饭哦' },
  { startTime: "13:00", endTime: "13:59", message: '<div class="emoji Sleeping_face"></div>{userName}，午后小憩一下，下午更有精神' },
  
  // 下午时段
  { startTime: "14:00", endTime: "14:59", message: '<div class="emoji Sun_behind_small_cloud"></div>下午好{userName}！' },
  { startTime: "15:00", endTime: "15:59", message: '<div class="emoji Hot_beverage"></div>嘿{userName}，下午茶时间，放松一下吧' },
  
  // 晚上时段
  { startTime: "18:00", endTime: "18:59", message: '<div class="emoji Cityscape_at_dusk"></div>晚上好{userName}，忙碌了一天，该放松啦' },
  { startTime: "22:00", endTime: "22:59", message: '<div class="emoji moon"></div>{userName}，夜色渐深，准备休息了吗？' },
  { startTime: "23:00", endTime: "23:59", message: '<div class="emoji Cityscape_at_dusk"></div>夜深了，早点休息吧{userName}' },
];

// 周末特殊欢迎语配置数组 - 易于扩展
const sundayGreetingConfigs: GreetingConfig[] = [
  // 凌晨时段
  { startTime: "00:00", endTime: "02:59", message: '<div class="emoji Cityscape_at_dusk"></div>{userName}，周末的夜晚格外宁静' },
  { startTime: "03:00", endTime: "04:59", message: '<div class="emoji moon"></div>{userName}，周末的凌晨时分' },
  { startTime: "05:00", endTime: "05:59", message: '<div class="emoji Sunrise"></div>{userName}，周末的清晨到了' },
  
  // 早晨时段
  { startTime: "06:00", endTime: "07:59", message: '<div class="emoji Cherry_blossom"></div>{userName}早安！周末的早晨' },
  { startTime: "08:00", endTime: "08:59", message: '<div class="emoji Couch_and_lamp"></div>{userName}，周末的早餐时间' },
  { startTime: "09:00", endTime: "09:59", message: '<div class="emoji SUN"></div>{userName}睡到自然醒了吗？周末就该这样！' },
  { startTime: "10:00", endTime: "10:59", message: '<div class="emoji Rainbow"></div>嗨{userName}，周末愉快！今天有什么计划吗？' },
  
  // 中午时段
  { startTime: "11:00", endTime: "11:59", message: '<div class="emoji Shallow_pan_of_food"></div>{userName}，周末的上午过得怎么样？' },
  { startTime: "12:00", endTime: "12:59", message: '<div class="emoji Steaming_bowl"></div>{userName}，周末的午餐时间到了' },
  { startTime: "13:00", endTime: "13:59", message: '<div class="emoji Couch_and_lamp"></div>{userName}，周末午后的悠闲时光！' },
  
  // 下午时段
  { startTime: "14:00", endTime: "14:59", message: '<div class="emoji SUN"></div>{userName}，周末下午是放松的黄金时段！' },
  { startTime: "15:00", endTime: "15:59", message: '<div class="emoji Hot_beverage"></div>{userName}，周末的下午茶时光' },
  { startTime: "16:00", endTime: "16:59", message: '<div class="emoji Person_walking"></div>{userName}，周末的下午时分' },
  { startTime: "17:00", endTime: "17:59", message: '<div class="emoji Cityscape_at_dusk"></div>{userName}，周末的傍晚到了' },
  
  // 晚上时段
  { startTime: "18:00", endTime: "18:59", message: '<div class="emoji Popcorn"></div>{userName}，周末的夜晚开始了！' },
  { startTime: "19:00", endTime: "19:59", message: '<div class="emoji Pizza"></div>{userName}，周末晚餐时间到~' },
  { startTime: "20:00", endTime: "22:59", message: '<div class="emoji moon"></div>周末即将结束' },
  { startTime: "23:00", endTime: "23:59", message: '<div class="emoji star"></div>{userName}，周末的尾声，准备迎接新的一周了吗？' },
];

// 默认欢迎语（其他时间）
const defaultGreeting = '<div class="emoji Sparkles"></div>哈喽，{userName}！';

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { 
    config,
    bootDrive, 
    bootDriveVersion,
    bootDriveUpdateAvailable,
    bootDriveUpdateCanSkip,
    notification, 
    notificationClosed
  } = useAppContext();

  console.log("启动盘：",bootDrive?.letter);

  // 获取当前时间的欢迎语
  const getGreeting = useMemo(() => {
    return (): string => {
      if (!config.enablePersonalizedGreeting || !config.userNickname) {
        return "欢迎使用Cloud-PE One！";
      }

      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const dayOfWeek = now.getDay(); // 0是周日
      
      // 选择使用哪个配置数组（只有周日使用特殊欢迎语）
      const configsToUse = (dayOfWeek === 0) ? sundayGreetingConfigs : greetingConfigs;
      
      // 查找匹配的欢迎语
      for (const greetingConfig of configsToUse) {
        if (greetingConfig.endTime) {
          // 时间段
          if (currentTime >= greetingConfig.startTime && currentTime <= greetingConfig.endTime) {
            return greetingConfig.message.replace('{userName}', config.userNickname);
          }
        } else {
          // 精确时间
          if (currentTime === greetingConfig.startTime) {
            return greetingConfig.message.replace('{userName}', config.userNickname);
          }
        }
      }
      
      // 默认欢迎语
      return defaultGreeting.replace('{userName}', config.userNickname);
    };
  }, [config.enablePersonalizedGreeting, config.userNickname]);

  // 使用 useMemo 计算初始值，避免闪烁
  const [currentGreeting, setCurrentGreeting] = useState<string>(() => getGreeting());

  // 实时更新欢迎语
  useEffect(() => {
    const updateGreeting = () => {
      setCurrentGreeting(getGreeting());
    };

    // 初始设置（已在 useState 中设置，这里可以省略）
    // updateGreeting();

    // 每分钟更新一次（因为欢迎语是按分钟变化的）
    const interval = setInterval(updateGreeting, 60000);

    return () => clearInterval(interval);
  }, [getGreeting]);

  // 获取emoji的className
  const getEmojiClassName = () => {
    if (!bootDriveUpdateAvailable) {
      return 'cool';
    }
    
    // 如果有升级，根据是否可跳过来决定className
    return bootDriveUpdateCanSkip ? 'dotted_line_face' : 'Melting_face';
  };

  return (
    <div style={{ 
      paddingTop: 18, // 顶边距18px
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center', // 水平居中
      position: 'relative',
      overflow: 'auto'
    }}>
      {/* 不响应宽高变化的标题 - 使用动态欢迎语 */}
      <div style={{
        position: 'absolute',
        top: 38,
        left: 25,
        width: 'auto',
        whiteSpace: 'nowrap'
      }}>
<Title 
  strong 
  heading={2} 
  style={{ 
    fontSize: 24, 
    marginBottom: 24,
    display: 'flex',
    alignItems: 'center'
  }}
>
  <span 
    dangerouslySetInnerHTML={{
      __html: currentGreeting.replace(
        /<div class="([^"]*)">\s*<\/div>/g,
        '<div class="$1" style="display: inline-block; margin-right: 1px; vertical-align: middle; position: relative; top: -2px;"></div>'
      )
    }} 
  />
</Title>
      </div>

      {/* 通知Banner */}
      { notification && ( //fix:移除!isLoadingNotification，因为他会导致通知无法显示
        <div style={{
          position: 'absolute',
          top: 85, // 标题下方8px处
          left: 0,
          right: 0,
          padding: '0 16px',
          zIndex: 100
        }}>
          <NotificationBanner 
            type={notification.type} 
            content={notification.content} 
          />
        </div>
      )}

      {/* 响应宽度变化的内容区 */}
      <div style={{
        marginTop: notification && !notificationClosed ? 155 : 115, // 根据是否有通知调整顶部边距
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center' // 水平居中
      }}>
        {bootDrive ? (
          <>
            <div style={{ fontSize: 80, marginBottom: 16 }} className={getEmojiClassName()}></div>
            <Text strong style={{ fontSize: 18, marginBottom: 12 }}>
              {bootDriveUpdateAvailable ? '您的Cloud-PE启动盘不是最新版本' : '已插入Cloud-PE启动盘'}
            </Text>

            
            
            {/* 显示启动盘版本信息 */}
            {bootDriveVersion && (
              <div style={{ marginBottom: 24 }}>
                <Tag
                  color='green'
                  size='large'
                >
                  版本：Cloud-PE v{bootDriveVersion}
                </Tag>
              </div>
            )}
            
            <Button  
              type="primary" 
              onClick={() => onNavigate('download-plugins')}
              style={{ marginBottom: 16 }}
            >
              下载插件
            </Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 80, marginBottom: 16 }} className='silence'></div>
            <Text strong style={{ fontSize: 18, marginBottom: 24 }}>尚未插入Cloud-PE启动盘</Text>
            <div style={{ 
              display: 'flex', 
              gap: 16,
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <Button 
                type="primary" 
                onClick={() => onNavigate('create-boot-drive')}
              >
                制作启动盘
              </Button>
              <Button 
                type="primary"
                onClick={() => onNavigate('create-iso')}
              >
                生成ISO镜像
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;