# dsh-balance

DeepSeek Harness (DSH) 侧边栏插件：在侧边栏底部实时显示 DeepSeek API 余额、今日消费，并提供一键充值跳转。

## 功能

- 实时显示 DeepSeek API 余额（每秒刷新）
- 显示「今日消费」（每日锚点推算，跨天自动重置）
- 点击「充值」按钮跳转到 DeepSeek 充值页（系统默认浏览器打开）
- 持久化：写入 web profile 的 composition，重启后自动加载

## 目录结构

```
@deepseek-ai/dsh-balance/
├── package.json
└── lib/
    ├── index.js      # Host：读密钥 + 查余额 + 注册 HTTP 路由
    └── client.js     # Client：侧边栏组件 + fetch
```

## 安装

### 1. 复制插件包

把本仓库的 `package.json` 和 `lib/` 复制到 DSH 的 profiles node_modules：

```
$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-balance/
```

Windows 上通常是：

```
D:\dsh\profiles\node_modules\@deepseek-ai\dsh-balance\
```

（`$DSH_HOME` 以你的实际配置为准，默认是 `~/.dsh`。）

### 2. 挂载到 composition

编辑 web profile 的用户 patch 层 `$DSH_HOME/profiles/web/cordis.patch.yml`，加入：

```yaml
- insert:
    - id: balance
      name: '@deepseek-ai/dsh-balance'
```

（如果该文件里已有其它 `insert` 列表，把这一条加进去即可。）

### 3. 配置 API Key

插件通过 DSH 的 `credentials` 服务读取 `DEEPSEEK_API_KEY`。如果你还没配，在 `$DSH_HOME/.credentials.yaml` 里加：

```yaml
DEEPSEEK_API_KEY: sk-你的key
```

### 4. 重启 DSH

重启后侧边栏底部即显示余额。

## 说明

- 余额查询走 `https://api.deepseek.com/user/balance`，密钥由 DSH 的 credentials 服务按需解析，不写死在插件里。
- 「今日消费」用「每日锚点」推算：记录当天首次加载时的余额，减去当前余额。锚点存在 `$DSH_HOME/.balance-day.json`，跨天自动重置；若中途充值使余额上涨，锚点也会重置。
- 插件依赖 Node（`node` 在 PATH 中）用于发起 HTTPS 请求（Windows 的 schannel TLS 在沙箱里不可用，所以走 Node 的 OpenSSL 栈）。

## License

MIT
