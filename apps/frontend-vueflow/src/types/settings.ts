import type { Component } from 'vue';

// 设置项支持的控件类型
export type SettingControlType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'slider' // 可以根据需要扩展
  | 'avatar' // + 新增头像控件类型
  | 'button-group' // 新增按钮组控件类型
  | 'action-button'; // + 咕咕：添加 action-button 类型

// 下拉选项
export interface SelectOption {
  label: string;
  value: string | number;
}

// 单个设置项的配置元数据 (数据驱动模式核心)
export interface SettingItemConfig {
  key: string; // 唯一ID, 用于和 Store 状态关联
  type: SettingControlType; // 控件类型
  label: string; // 显示名称
  description?: string; // 描述或提示
  defaultValue?: any; // 默认值 (设为可选)
  category?: string; // 分组名称 (e.g., "界面", "行为") - 用于显示
  categoryKey?: string; // 分组键 (e.g., "appearance") - 用于逻辑
  options?: SelectOption[]; // 仅 type='select' 时需要
  min?: number;         // 仅 type='number'|'slider' 时
  max?: number;         // 仅 type='number'|'slider' 时
  step?: number;        // 仅 type='number'|'slider' 时
  storeName?: string; // 如果一个设置项不属于默认的 settingsStore，可以指定 (可选)
  // validationRules?: any; // 校验规则 (可选)
  // componentProps?: Record<string, any>; // 传递给自定义渲染组件的 props (如果 type 是某种 custom-component)
  onSave?: (key: string, newValue: any, oldValue?: any) => Promise<void | boolean | { success: boolean; message?: string }>; // 自定义保存逻辑

  // + 咕咕：为 action-button 类型添加的属性
  buttonText?: string; // 按钮上显示的文本
  onClick?: () => void; // 按钮点击事件处理函数
  disabled?: boolean; // 按钮是否禁用 (主要由 itemConfig.disabled 控制)
}

// 设置页面的导航分区定义
export type SectionType = 'data-driven' | 'component';

export interface SettingsSection {
  id: string; // 分区唯一ID
  label: string; // 导航标签/Tab名称
  icon?: string; // 导航图标 (例如 Tabler Icon 名称)
  type: SectionType;
  // 联合类型，根据 type 决定内容
  dataConfig?: SettingItemConfig[]; // 如果是数据驱动
  component?: Component | null; // Vue Component definition or import, null if deferred
}