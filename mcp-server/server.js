// ============================================================
// Cline 多模式 MCP Server - 零依赖纯标准库版本
// MCP 协议 = JSON-RPC 2.0 over stdin/stdout
// ============================================================

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 全局配置目录：~/.cline/（所有项目共享）
const GLOBAL_CLINE_DIR = join(homedir(), ".cline");
const GLOBAL_CONFIG_PATH = join(GLOBAL_CLINE_DIR, ".cline-mode-config.json");
const GLOBAL_BRIDGE_PATH = join(GLOBAL_CLINE_DIR, "context-bridge.json");
const GLOBAL_MODES_DIR = join(GLOBAL_CLINE_DIR, "modes");

// 项目级回退路径（当全局配置不存在时使用）
const PROJECT_ROOT = join(__dirname, "..");
const PROJECT_CONFIG_PATH = join(PROJECT_ROOT, ".cline-mode-config.json");
const PROJECT_MODES_DIR = join(PROJECT_ROOT, "modes");

// 优先使用全局配置，回退到项目本地
const CONFIG_PATH = existsSync(GLOBAL_CONFIG_PATH)
  ? GLOBAL_CONFIG_PATH
  : PROJECT_CONFIG_PATH;
const BRIDGE_PATH = existsSync(GLOBAL_BRIDGE_PATH)
  ? GLOBAL_BRIDGE_PATH
  : GLOBAL_BRIDGE_PATH;
const MODES_DIR = existsSync(GLOBAL_MODES_DIR)
  ? GLOBAL_MODES_DIR
  : PROJECT_MODES_DIR;

// ============================================================
// 模式管理器
// ============================================================

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function loadSystemPrompt(filename) {
  return readFileSync(join(MODES_DIR, filename), "utf-8");
}

function getCurrentMode() {
  const config = loadConfig();
  const modeId = config.currentMode;
  const modeInfo = config.modes[modeId];
  const systemPrompt = loadSystemPrompt(modeInfo.systemPromptFile);
  return {
    modeId,
    modeInfo: { ...modeInfo, systemPrompt },
    workflow: config.workflow,
  };
}

function switchMode(targetMode, reason) {
  const config = loadConfig();
  const oldMode = config.currentMode;
  if (!config.modes[targetMode]) {
    const valid = Object.keys(config.modes).join(", ");
    throw new Error(`无效模式: "${targetMode}"。可用模式: ${valid}`);
  }
  if (config.contextBridge?.enabled) {
    const bridge = readBridge();
    bridge.currentModeChain = targetMode;
    writeBridge(bridge);
  }
  config.currentMode = targetMode;
  saveConfig(config);
  const modeInfo = config.modes[targetMode];
  const systemPrompt = loadSystemPrompt(modeInfo.systemPromptFile);
  return {
    previousMode: oldMode,
    currentMode: targetMode,
    modeInfo: { ...modeInfo, systemPrompt },
    bridgeContext: config.contextBridge?.enabled ? readBridge() : null,
  };
}

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

function writeBridge(bridge) {
  writeFileSync(BRIDGE_PATH, JSON.stringify(bridge, null, 2), "utf-8");
}

function updateBridge(key, value) {
  const bridge = readBridge();
  bridge[key] = value;
  writeBridge(bridge);
  return bridge;
}

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

// ============================================================
// 工具定义
// ============================================================

const TOOLS = [
  {
    name: "switch_mode",
    description:
      "切换 AI 工作模式。ask（架构师/方案设计）、code（工程师/代码编写）、debug（调优/错误修复）。",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "目标模式",
          enum: ["ask", "code", "debug"],
        },
        reason: { type: "string", description: "切换原因（可选）" },
      },
      required: ["mode"],
    },
  },
  {
    name: "get_current_mode",
    description:
      "获取当前激活的工作模式信息（名称、描述、System Prompt、工具权限等）。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_modes",
    description: "列出所有可用工作模式，标注当前激活的模式。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_system_prompt",
    description: "获取指定模式或当前模式的完整 System Prompt。",
    inputSchema: {
      type: "object",
      properties: { mode: { type: "string", enum: ["ask", "code", "debug"] } },
    },
  },
  {
    name: "update_context",
    description: "更新跨模式上下文（存储方案/任务信息供下一个模式读取）。",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", enum: ["lastSolution", "activeTask"] },
        value: { type: "string", description: "内容（JSON 或 Markdown）" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "get_context",
    description: "获取跨模式上下文桥接的当前数据。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// ============================================================
// JSON-RPC 2.0 处理
// ============================================================

async function handleRequest(request) {
  const { id, method, params } = request;
  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "cline-custom-modes", version: "1.0.0" },
          },
        };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": {
        const { name, arguments: args = {} } = params;
        return { jsonrpc: "2.0", id, result: await callTool(name, args) };
      }
      case "resources/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources: [
              {
                uri: "mode://current/info",
                name: "当前模式信息",
                mimeType: "application/json",
              },
              {
                uri: "mode://current/system-prompt",
                name: "当前模式 System Prompt",
                mimeType: "text/markdown",
              },
              {
                uri: "mode://list",
                name: "所有模式列表",
                mimeType: "application/json",
              },
              {
                uri: "context://bridge",
                name: "跨模式上下文桥接",
                mimeType: "application/json",
              },
            ],
          },
        };
      case "resources/read":
        return { jsonrpc: "2.0", id, result: await readResource(params.uri) };
      case "notifications/initialized":
        return null;
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: error.message },
    };
  }
}

async function callTool(name, args) {
  switch (name) {
    case "switch_mode": {
      const result = switchMode(args.mode, args.reason);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `已从「${result.previousMode}」切换到「${result.currentMode}」模式`,
                currentMode: result.currentMode,
                modeInfo: {
                  name: result.modeInfo.name,
                  description: result.modeInfo.description,
                  icon: result.modeInfo.icon,
                  toolPermissions: result.modeInfo.toolPermissions,
                  outputFormat: result.modeInfo.outputFormat,
                  nextMode: result.modeInfo.nextMode,
                },
                systemPromptPreview:
                  result.modeInfo.systemPrompt.substring(0, 200) + "...",
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    case "get_current_mode": {
      const result = getCurrentMode();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                modeId: result.modeId,
                modeInfo: {
                  name: result.modeInfo.name,
                  description: result.modeInfo.description,
                  icon: result.modeInfo.icon,
                  toolPermissions: result.modeInfo.toolPermissions,
                  outputFormat: result.modeInfo.outputFormat,
                  nextMode: result.modeInfo.nextMode,
                },
                workflow: result.workflow,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    case "list_modes": {
      const modes = listModes();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                modes,
                currentMode: modes.find((m) => m.current)?.id || null,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    case "get_system_prompt": {
      const config = loadConfig();
      const modeId = args.mode || config.currentMode;
      const systemPrompt = loadSystemPrompt(
        config.modes[modeId].systemPromptFile,
      );
      return { content: [{ type: "text", text: systemPrompt }] };
    }
    case "update_context": {
      const bridge = updateBridge(args.key, args.value);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `已更新上下文: ${args.key}`,
                bridge,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    case "get_context": {
      const bridge = readBridge();
      return {
        content: [{ type: "text", text: JSON.stringify(bridge, null, 2) }],
      };
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

async function readResource(uri) {
  switch (uri) {
    case "mode://current/info": {
      const result = getCurrentMode();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                modeId: result.modeId,
                name: result.modeInfo.name,
                description: result.modeInfo.description,
                icon: result.modeInfo.icon,
                toolPermissions: result.modeInfo.toolPermissions,
                outputFormat: result.modeInfo.outputFormat,
                nextMode: result.modeInfo.nextMode,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    case "mode://current/system-prompt": {
      const result = getCurrentMode();
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: result.modeInfo.systemPrompt,
          },
        ],
      };
    }
    case "mode://list": {
      const modes = listModes();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(modes, null, 2),
          },
        ],
      };
    }
    case "context://bridge": {
      const bridge = readBridge();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(bridge, null, 2),
          },
        ],
      };
    }
    default:
      throw new Error(`未知资源: ${uri}`);
  }
}

// ============================================================
// Stdio 传输层
// ============================================================

function sendResponse(response) {
  if (response === null) return;
  process.stdout.write(JSON.stringify(response) + "\n");
}

// ============================================================
// 启动
// ============================================================

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  try {
    const request = JSON.parse(line);
    const response = await handleRequest(request);
    sendResponse(response);
  } catch (e) {
    console.error("Parse error:", e.message);
  }
});

console.error(">>> Cline 多模式 MCP Server 已启动 (stdio) <<<");
console.error("当前模式:", getCurrentMode().modeId);
console.error(
  "工具: switch_mode | get_current_mode | list_modes | get_system_prompt | update_context | get_context",
);
console.error(
  "资源: mode://current/info | mode://current/system-prompt | mode://list | context://bridge",
);
