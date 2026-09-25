// DSH Creative Suite POC: 数据迁移器
// 将旧格式数据迁移到新资源系统

import { emptyStore } from './index.js'

/**
 * 迁移旧格式的 creative-suite.json 存储到新资源系统
 * @param {Object} legacyStore - 旧存储对象
 * @returns {Object} 新格式的存储对象
 */
export function migrateLegacyStore(legacyStore) {
  const store = emptyStore()
  
  if (!legacyStore) return store
  
  // 复制版本和更新时间
  store.version = legacyStore.version || '0.17.0'
  store.updatedAt = legacyStore.updatedAt || Date.now()
  
  // 迁移各种资源类型
  const resourceTypes = ['cards', 'worldbooks', 'presets', 'styles', 'novels', 'scripts', 'summaries', 'sessions', 'stories']
  
  for (const type of resourceTypes) {
    const legacyItems = legacyStore.resources?.[type] || {}
    const newItems = {}
    
    for (const [id, item] of Object.entries(legacyItems)) {
      // 确保每个项都有必要的字段（kind 与 RESOURCE_KINDS 保持复数一致，便于 validateResource）
      const normalizedItem = {
        id: item.id || id,
        name: item.name || item.title || `Unnamed ${type}`,
        kind: type, // 复数：cards / worldbooks / presets / ...
        version: item.version || 1,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || Date.now(),
        data: item
      }
      
      newItems[id] = normalizedItem
    }
    
    store.resources[type] = newItems
  }
  
  // 迁移资源历史（如果存在）
  if (legacyStore.resourceHistories) {
    for (const [type, history] of Object.entries(legacyStore.resourceHistories)) {
      if (store.resourceHistories[type]) {
        // 合并历史
        Object.assign(store.resourceHistories[type], history)
      } else {
        store.resourceHistories[type] = history
      }
    }
  }
  
  return store
}

/**
 * 从文件迁移存储
 * @param {string} filePath - 存储文件路径
 * @returns {Promise<Object>} 迁移后的存储对象
 */
export async function migrateStoreFromFile(filePath) {
  try {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(filePath, 'utf8')
    const legacyStore = JSON.parse(content)
    return migrateLegacyStore(legacyStore)
  } catch (error) {
    throw new Error(`Failed to migrate store from ${filePath}: ${error.message}`)
  }
}