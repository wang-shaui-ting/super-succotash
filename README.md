# 多模式 AI 编程助手系统

基于 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 的多模式 AI 编程助手框架，支持在 **Ask（架构师）→ Code（工程师）→ Debug（调优）** 三种工作模式之间无缝切换，并通过上下文桥接实现模式间信息传递。

## ✨ 特性

- 🔍 **Ask 模式** — 资深系统架构师，负责需求分析、技术方案设计、任务拆分
- 💻 **Code 模式** — 高级全栈工程师，严格按方案实现可运行的高质量代码
- 🐛 **Debug 模式** — 调试专家 / SRE，快速定位根因，最小化修复
- 🔄 **上下文桥接** — 模式切换时自动传递方案和任务信息，避免上下文丢失
- 📦 **零外部依赖** — MCP Server 使用 Node.js 纯标准库（`server.js` 无需安装任何 npm 包）
- 🔌 **标准 MCP 协议** — JSON-RPC 2.0 over stdio，兼容 Cline 及其他 MCP 客户端

## 📁 项目结构

```
├── .cline-mode-config.json    # 三模式配置（权限、System Prompt、输出格式）
├── context-bridge.json        # 跨模式上下文桥接数据
├── mcp-server/
│   ├── server.js              # MCP Server 主程序（零依赖，标准库实现）
│   ├── mode-manager.js        # 模式管理器模块
│   └── package.json           # 包信息
├── modes/
│   ├── ask-system-prompt.md   # Ask 模式 System Prompt 模板
│   ├── code-system-prompt.md  # Code 模式 System Prompt 模板
│   └── debug-system-prompt.md # Debug 模式 System Prompt 模板
├── .gitignore
└── README.md
```

## 🚀 快速开始

### 前置条件

- Node.js >= 18

### 安装与运行

```bash
# 启动 MCP Server（stdio 模式）
cd mcp-server
node server.js
```

### 配置到 Cline

将以下配置添加到 Cline 的 MCP 配置文件中：

```json
{
  "mcpServers": {
    "cline-custom-modes": {
      "command": "node",
      "args": ["path/to/mcp-server/server.js"]
    }
  }
}
```

## 🛠️ MCP 工具与资源

### 工具

| 工具名              | 描述                                   |
| ------------------- | -------------------------------------- |
| `switch_mode`       | 切换 AI 工作模式（ask / code / debug） |
| `get_current_mode`  | 获取当前激活的工作模式信息             |
| `list_modes`        | 列出所有可用工作模式                   |
| `get_system_prompt` | 获取指定模式的完整 System Prompt       |
| `update_context`    | 更新跨模式上下文（存储方案/任务信息）  |
| `get_context`       | 获取跨模式上下文桥接的当前数据         |

### 资源

| 资源 URI                       | 描述                   |
| ------------------------------ | ---------------------- |
| `mode://current/info`          | 当前模式信息           |
| `mode://current/system-prompt` | 当前模式 System Prompt |
| `mode://list`                  | 所有模式列表           |
| `context://bridge`             | 跨模式上下文桥接       |

## 🔄 工作流程

```
Ask 模式（方案设计）→ Code 模式（编码实现）→ Debug 模式（错误修复）
        ↑                                              |
        └──────────────────────────────────────────────┘
                      上下文桥接自动传递
```

## 📄 许可

MIT
