<template>
  <div class="sidebar-nav h-full flex flex-col text-sm" :class="{ 'items-center': collapsed }">
    <!-- 折叠/展开控制按钮 (可选，也可以由父组件控制) -->
    <div class="p-2 flex items-center" :class="collapsed ? 'justify-center' : 'justify-between'">
      <span v-if="!collapsed" class="font-semibold text-lg text-text-base">{{ t('fileManager.sidebarNav.title') }}</span>
      <button @click="toggleCollapse"
        class="p-2 rounded-md hover:bg-background-base text-text-muted"
        :title="t(collapsed ? 'fileManager.sidebarNav.expand' : 'fileManager.sidebarNav.collapse')" data-testid="fm-sidebar-toggle">
        <svg v-if="collapsed" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20"
          fill="currentColor">
          <path fill-rule="evenodd"
            d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z"
            clip-rule="evenodd" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto space-y-4 p-2">
      <!-- 逻辑根路径 -->
      <section>
        <h3 v-if="!collapsed"
          class="px-2 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
          {{ t('fileManager.sidebarNav.locations') }}
        </h3>
        <ul>
          <li v-for="item in rootNavigationItems" :key="item.logicalPath">
            <a href="#" @click.prevent="navigateTo(item.logicalPath)"
              class="flex items-center px-2 py-2 rounded-md hover:bg-primary/10 text-text-base hover:text-primary"
              :class="{ 'bg-primary/20 text-primary': isActiveRoot(item.logicalPath), 'justify-center': collapsed }"
              :title="collapsed ? item.label : undefined" v-comfy-tooltip="collapsed ? item.label : ''">
              <component v-if="item.icon && !collapsed" :is="getIconComponent(item.icon)"
                class="h-5 w-5 mr-3 flex-shrink-0" />
              <component v-if="item.icon && collapsed" :is="getIconComponent(item.icon)" class="h-6 w-6" />
              <span v-if="!collapsed">{{ item.label }}</span>
            </a>
          </li>
        </ul>
      </section>

      <!-- 最近访问 -->
      <section v-if="recentAccessItemsSorted.length > 0">
        <h3 v-if="!collapsed"
          class="px-2 py-1 mt-4 text-xs font-semibold text-text-muted uppercase tracking-wider flex justify-between items-center">
          <span>{{ t('fileManager.sidebarNav.recentAccess') }}</span>
          <button @click="clearRecentAccess" :title="t('fileManager.sidebarNav.clearRecent')" class="text-xs hover:text-error"
            :v-comfy-tooltip="t('fileManager.sidebarNav.clearRecent')">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </h3>
        <ul v-if="!collapsed">
          <li v-for="item in recentAccessItemsSorted.slice(0, 5)" :key="item.logicalPath">
            <a href="#" @click.prevent="navigateTo(item.logicalPath)"
              class="flex items-center px-2 py-1.5 rounded-md hover:bg-background-base text-text-muted text-xs truncate"
              :title="item.displayName" v-comfy-tooltip="item.displayName">
              <component :is="item.itemType === 'directory' ? FolderIcon : DocumentIcon"
                class="h-4 w-4 mr-2 flex-shrink-0 text-text-muted" />
              <span class="truncate">{{ item.displayName }}</span>
            </a>
          </li>
        </ul>
        <!-- 折叠时可以不显示最近访问，或只显示图标 -->
      </section>

      <!-- 收藏夹 -->
      <section>
        <h3 v-if="!collapsed"
          class="px-2 py-1 mt-4 text-xs font-semibold text-text-muted uppercase tracking-wider">
          {{ t('fileManager.sidebarNav.favorites') }}
        </h3>
        <ul v-if="!collapsed">
          <li v-if="favoritesPaths.length === 0 && !collapsed"
            class="px-2 py-1 text-xs text-text-muted">
            {{ t('fileManager.sidebarNav.noFavorites') }}
          </li>
          <li v-for="favPath in favoritesPaths" :key="favPath">
            <a href="#" @click.prevent="navigateTo(favPath)"
              class="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-background-base text-text-muted text-xs"
              :title="favPath">
              <div class="flex items-center truncate">
                <StarIcon class="h-4 w-4 mr-2 flex-shrink-0 text-accent" />
                <span class="truncate">{{ getPathDisplayName(favPath) }}</span>
              </div>
              <button @click.stop.prevent="removeFromFavorites(favPath)"
                class="ml-2 p-0.5 rounded hover:bg-error/10" :title="t('fileManager.sidebarNav.unfavorite')">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-error" viewBox="0 0 20 20"
                  fill="currentColor">
                  <path fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd" />
                </svg>
              </button>
            </a>
          </li>
        </ul>
        <!-- 折叠时可以显示收藏夹图标列表 -->
        <ul v-if="collapsed && favoritesPaths.length > 0">
          <li v-for="favPath in favoritesPaths" :key="favPath + '-collapsed'">
            <a href="#" @click.prevent="navigateTo(favPath)"
              class="flex justify-center items-center px-2 py-2 rounded-md hover:bg-primary/10"
              :title="getPathDisplayName(favPath)" v-comfy-tooltip="getPathDisplayName(favPath)">
              <StarIcon class="h-6 w-6 text-accent" />
            </a>
          </li>
        </ul>
      </section>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFileManagerStore } from '@/stores/fileManagerStore';
import { FolderIcon, DocumentIcon, StarIcon } from '@heroicons/vue/24/outline'; // 使用 heroicons 作为示例

// 假设的图标组件映射，实际项目中可能需要更完善的图标系统
const iconComponents: Record<string, any> = {
  UserIcon: defineAsyncComponent(() => import('@heroicons/vue/24/outline/UserIcon')),
  UsersIcon: defineAsyncComponent(() => import('@heroicons/vue/24/outline/UserGroupIcon')), // 通常是 UserGroupIcon
  // 添加更多图标...
};

const getIconComponent = (iconName: string) => {
  return iconComponents[iconName] || FolderIcon; // 默认图标
};

const { t } = useI18n();

const props = defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:collapsed', value: boolean): void;
}>();

const fileManagerStore = useFileManagerStore();

const rootNavigationItems = computed(() => fileManagerStore.rootNavigationItems);
const recentAccessItemsSorted = computed(() => fileManagerStore.recentAccessItemsSorted);
const favoritesPaths = computed(() => fileManagerStore.favoritesPaths);

const navigateTo = (path: string) => {
  fileManagerStore.navigateTo(path);
};

const clearRecentAccess = () => {
  fileManagerStore.clearRecentAccess();
};

const removeFromFavorites = (path: string) => {
  fileManagerStore.removeFromFavorites(path);
};

const toggleCollapse = () => {
  emit('update:collapsed', !props.collapsed);
};

const isActiveRoot = (path: string) => {
  // 如果当前路径是该根路径或其子路径
  return fileManagerStore.currentLogicalPath.startsWith(path);
};

const getPathDisplayName = (logicalPath: string): string => {
  return logicalPath.split('/').filter(Boolean).pop() || logicalPath;
};

</script>

<style scoped>
/* 可以添加一些特定于 SidebarNav 的样式 */
.sidebar-nav a span {
  /* 防止文本换行，并用省略号显示溢出 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>