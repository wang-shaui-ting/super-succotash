import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const CONFIG_PATH = join(PROJECT_ROOT, ".cline-mode-config.json");
const BRIDGE_PATH = join(PROJECT_ROOT, "context-bridge.json");
const MODES_DIR = join(PROJECT_ROOT, "modes");

/**
 * 读取模式配置
 */
function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`配置文件不存在: ${CONFIG_PATH}`);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

/**
 * 保存模式配置
 */
function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * 读取 System Prompt 文件
 */
function loadSystemPrompt(filename) {
  const promptPath = join(MODES_DIR, filename);
  if (!existsSync(promptPath)) {
    throw new Error(`System Prompt 文件不存在: ${promptPath}`);
  }
  return readFileSync(promptPath, "utf-8");
}

/**
 * 获取当前模式信息
 */
function getCurrentMode() {
  const config = loadConfig();
  const modeId = config.currentMode;
  const modeInfo = config.modes[modeId];
  if (!modeInfo) {
    throw new Error(`未知模式: ${modeId}`);
  }

  // 加载 system prompt
  const systemPrompt = loadSystemPrompt(modeInfo.systemPromptFile);

  return {
    modeId,
    modeInfo: {
      ...modeInfo,
      systemPrompt,
    },
    workflow: config.workflow,
  };
}

/**
 * 切换模式
 * @param {string} targetMode - 目标模式: 'ask' | 'code' | 'debug'
 * @param {string} reason - 切换原因（可选，写入上下文桥接）
 * @returns {object} 新模式的完整信息
 */
function switchMode(targetMode, reason) {
  const config = loadConfig();
  const oldMode = config.currentMode;

  // 验证目标模式存在
  if (!config.modes[targetMode]) {
    throw new Error(
      `无效模式: "${targetMode}"。可用模式: ${Object.keys(config.modes).join(", ")}`,
    );
  }

  // 保存旧模式上下文
  if (config.contextBridge?.enabled) {
    const bridge = readBridge();
    bridge.currentModeChain = targetMode;
    bridge.modeHistory = bridge.modeHistory || [];
    bridge.modeHistory.push({
      from: oldMode,
      to: targetMode,
      reason: reason || "",
      timestamp: new Date().toISOString(),
      // 保留最后一次 ask 产生的方案
      solution:
        config.currentMode === "ask"
          ? bridge.lastSolution
          : bridge.lastSolution,
    });
    writeBridge(bridge);
  }

  // 切换模式
  config.currentMode = targetMode;
  saveConfig(config);

  // 返回新模式信息
  const modeInfo = config.modes[targetMode];
  const systemPrompt = loadSystemPrompt(modeInfo.systemPromptFile);

  return {
    previousMode: oldMode,
    currentMode: targetMode,
    modeInfo: {
      ...modeInfo,
      systemPrompt,
    },
    bridgeContext: config.contextBridge?.enabled ? readBridge() : null,
  };
}

/**
 * 读取上下文桥接
 */
function readBridge() {
  if (!existsSync(BRIDGE_PATH)) {
    return {
      currentModeChain: "ask",
      modeHistory: [],
      lastSolution: null,
      activeTask: null,
    };
  }
  try {
    return JSON.parse(readFileSync(BRIDGE_PATH, "utf-8"));
  } catch {
    return {
      currentModeChain: "ask",
      modeHistory: [],
      lastSolution: null,
      activeTask: null,
    };
  }
}

/**
 * 写入上下文桥接
 */
function writeBridge(bridge) {
  writeFileSync(BRIDGE_PATH, JSON.stringify(bridge, null, 2), "utf-8");
}

/**
 * 更新上下文桥接中的方案/任务数据
 * @param {string} key - 'lastSolution' | 'activeTask'
 * @param {any} value - 值
 */
function updateBridge(key, value) {
  const bridge = readBridge();
  bridge[key] = value;
  writeBridge(bridge);
  return bridge;
}

/**
 * 列出所有可用模式
 */
function listModes() {
  const config = loadConfig();
  return Object.entries(config.modes).map(([id, info]) => ({
    id,
    name: info.name,
    description: info.description,
    icon: info.icon,
    current: id === config.currentMode,
  }));
}

export {
  loadConfig,
  saveConfig,
  loadSystemPrompt,
  getCurrentMode,
  switchMode,
  readBridge,
  writeBridge,
  updateBridge,
  listModes,
};
