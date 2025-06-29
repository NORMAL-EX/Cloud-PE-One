import { getUpdateInfo } from './updateApi';

// 通知类型
export type NotificationType = 'info' | 'warning' | 'danger' | 'success';

// 通知信息接口
export interface NotificationInfo {
  content: string;
  type: NotificationType;
}

// 获取通知信息
export const getNotification = async (): Promise<NotificationInfo | null> => {
  try {
    // 复用更新API获取通知信息
    const updateInfo = await getUpdateInfo();
    
    // 获取通知内容和类型
    const content = updateInfo.hub_new.hub_tip;
    let type = updateInfo.hub_new.hub_tip_type as NotificationType;
    
    // 验证通知类型是否有效，如果无效则默认为info
    if (!['info', 'warning', 'danger', 'success'].includes(type)) {
      type = 'info';
    }
    
    // 如果没有通知内容，返回null
    if (!content) {
      return null;
    }
    
    return {
      content,
      type
    };
  } catch (error) {
    console.error('获取通知信息失败:', error);
    return null;
  }
};

