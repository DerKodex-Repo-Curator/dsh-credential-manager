# dsh-credential-manager

[English](README.md) | **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的命名凭据插件：让模型**按引用**使用你的 API key、令牌和登录凭据 —— 秘密值绝不进入对话。

一条凭据是一条扁平记录，只保存一个秘密值。模型用 `credential_create` 工具创建空的占位记录；你在 **设置 → 凭据** 页面录入秘密值。每个已配置的秘密值都会以 `DSH_CM_<ID>` 环境变量的形式注入模型的每次 shell 执行（按次解析），值到达命令环境而不会被打印进对话记录。

## 组成

| 部件 | 类型 | 作用 |
|---|---|---|
| `credential-manager` | host 服务插件 | 元数据侧车（storage domain）、秘密值存于 `ctx.credentials` 接缝、`DSH_CM_*` shell 环境变量注入 |
| `tool-credential-manager` | host 工具插件 | 面向模型的 `credential_list` / `credential_create` / `credential_read` / `credential_update_note` 工具 + 系统提示词策略小节 |
| 设置 → 凭据 | web 客户端插件（`dsh.client`） | 录入/管理秘密值的页面；通过自挂载的 Typert Remote 命名空间与 host 通信 |

## 安装

从 GitHub 安装（通过包的 `prepare` 脚本在安装时构建；pnpm 会要求你允许一次构建）：

```sh
dsh plugin --profile web add github:accpowered/dsh-credential-manager
```

如果 pnpm 打印 `allowBuilds` 提示，把打印的键加入 profile 目录 `pnpm-workspace.yaml` 的 `allowBuilds` 下并重跑 `add` —— 这等于授予安装期执行权限，只允许你信任的来源（建议固定 commit：`github:accpowered/dsh-credential-manager#<sha>`）。

本地检出安装：

```sh
dsh plugin --profile web add ./dsh-credential-manager
```

重启 `dsh web`（或对应 profile）并强刷浏览器。

## 与 harness 的协作方式

bundle patch（[cordis.patch.yml](cordis.patch.yml)）插入两个 host 行；`dsh.client` 声明让 web 面自动伺服设置页：

```yaml
- insert:
    - id: credential-manager
      name: dsh-credential-manager
    - id: tool-credential-manager
      name: dsh-credential-manager/tools
```

不修改任何 harness 源码：

- 工具注册进 **host** 工具注册表，所有 agent 预设可见。
- 设置页通过公开的 `ctx.remote.$mount` 接缝自挂载 Typert Remote 贡献，无需改动 `api/remotes`。
- host 服务是 `TypertRemoteService`，网关通过 SRC 标记动态发现其 `@Remote` 方法，部署不需要代码生成步骤。

**原版上游说明：** 上游 `api/remotes` 的事件转发白名单不含 `credential-manager/updated`，因此设置页不会收到来自*其他*界面的实时推送失效；页面仍通过权威的变更应答和连接重置重取收敛。若你的 harness 转发了该事件，页面会自动获得实时刷新。

## 配置

两个 host 行零配置即可工作，所有可调项都有 schema 默认值。需要调整时，在你的 profile 的 `cordis.patch.yml` 中重写该行（patch 会替换整行配置）：

```yaml
- id: credential-manager
  name: dsh-credential-manager
  config:
    maxNoteBytes: 8192        # 单条 user/LLM 备注的 UTF-8 字节上限

- id: tool-credential-manager
  name: dsh-credential-manager/tools
  config:
    promptOrder: 116          # 系统提示词策略小节的排序权重
```

只保留服务和设置页（不给模型工具）时，从 bundle patch 删除 `tool-credential-manager` 行即可。

## 使用

1. 对话中模型需要凭据时，会调用 `credential_create` 只传名称（绝不传值），并请你录入。
2. 打开 **设置 → 凭据**，找到占位记录，录入秘密值（只写不读回，任何页面和对话记录都不会显示它）。
3. 模型在 `bash`/`pwsh` 命令中通过列出的 `DSH_CM_<ID>` 变量使用：`curl -H "Authorization: Bearer $DSH_CM_MYAPI" ...`。
4. `credential_read` 是刻意保留的最后手段逃生口（非 shell 场景）；harness 会指示模型优先走变量路径。

过期凭据不会被阻断（过期日仅为提示），但会在页面和 `credential_list` 中标记，便于模型提醒你轮换。

## 卸载

```sh
dsh plugin --profile web remove dsh-credential-manager
```

服务、工具、系统提示词小节、设置页和 Remote 命名空间都随插件 fiber 一并卸载。已持久化的元数据（harness home 的 `storages/credential_manager.json`）与已存储的秘密值不受影响。

## 开发

```sh
pnpm install
pnpm build       # tsc 声明 + tsdown（node 库 + 浏览器客户端 bundle）
pnpm test        # vitest：服务 CRUD / 接缝隔离 / 工具映射
```

目录：`src/index.ts`（host 服务，默认导出）、`src/tools.ts`（工具插件）、`src/types.ts` + `src/spec.ts`（线缆类型 + 存储域）、`src/client/`（设置页；`remote.ts` 是手工维护的 Typert Remote 贡献 —— 服务的 `@Remote` 方法变更时需同步）。

## 许可证

MIT
