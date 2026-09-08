# VIX · VXN 波动率追踪 (PWA)

一个可安装到手机、每天推送 VIX / VXN、带可视化图表和"买卖信号"的应用。

![mobile](preview-mobile.png)

---

## 它是什么

一个 **渐进式网页应用 (PWA)**:

- **可视化 UI**: 实时价格、涨跌幅、今日开/高/低、近 30 日走势图。
- **买卖信号**: 基于规则引擎,每 5 分钟刷新,给出 VIX / VXN 各自的看多 / 看空 /
  中性评分 + 置信度,以及综合信号和 VXN–VIX 溢价说明。
- **每日推送**: 每天定时通过 Web Push 推送到你的手机。
- **可安装**: 添加到主屏幕后像原生 App 一样全屏运行,支持离线缓存。

> ⚠️ 信号引擎是规则模型(历史分位 + 均值回归 + 动量 + 跨指数溢价),**仅供教育
> 与信息参考,不构成投资建议**。波动率产品(VIX 期货/期权、VXX/UVXY 等)风险高。

---

## 快速开始(电脑上运行)

需要 Node.js 18+。

```powershell
cd outputs\vix-vxn-app
npm install
npm start
```

浏览器打开 http://localhost:8788 即可看到桌面版界面。

> 默认端口 `8788`。可用环境变量改: `$env:PORT='9000'; npm start`
> 电脑访问可以用 `http://127.0.0.1:8788`,手机访问用启动时打印的
> `LAN http://<你的局域网IP>:8788`。

---

## 安装到手机 (添加到主屏幕)

### Android (推荐,推送无需证书信任)

1. 让手机和电脑连**同一个 Wi-Fi**。
2. 电脑上运行 `npm start`,记下输出的 LAN 地址,例如 `http://10.22.2.198:8788`。
3. 手机浏览器(Chrome)打开该地址。
4. 底部会弹出"添加到主屏幕/安装应用",点击即可;或在菜单里选
   **添加到主屏幕 → 安装**。
5. 打开后即为全屏 App,并在顶部显示"安装到主屏幕"提示条。

### iPhone (Safari)

1. 同一 Wi-Fi 下,手机 Safari 打开 `http://<你的局域网IP>:8788`。
2. 点击**分享按钮** → **添加到主屏幕**。
3. 桌面上即出现 App 图标,全屏运行。

> iPhone 的 Web Push(通知)要求网页必须运行在 **HTTPS + 用户已在 Safari
> 中把该站点"添加到主屏幕"**。详见下方"如何让推送真正生效"。

---

## 开启每日推送

打开 App 后,点击底部的 **"开启每日推送"**(或顶部的 🔔)。浏览器会请求通知权限,
允许即可。默认每天 **08:30** 推送一次日报(VIX + VXN 最新值 + 综合信号)。

修改推送时间: 在 `server/index.js` 中改 `DAILY_CRON`,或启动时设环境变量:

```powershell
$env:DAILY_CRON='0 9 * * *'   # 每天 9:00
npm start
```

> cron 格式:`分 时 日 月 周`。用 `*/5 * * * *` 表示每 5 分钟(调试用)。

推送内容示例(Android 通知):

> **波动率日报 2026/9/9**
> VIX 15.26 ▼-0.26% · VXN 21.41 ▲+6.89%
> 综合: 看多波动率 (57)

---

## 让推送真正生效 (重要)

Web Push 在手机上要求 **HTTPS**。两种方式,任选其一:

### 方式 A: 局域网 HTTPS(Android 可用,需信任证书)

```powershell
cd outputs\vix-vxn-app
.\scripts\gen-cert.ps1          # 生成自签名证书到 ./certs
$env:HTTPS='1'
npm start
```

手机打开 `https://<你的局域网IP>:8788`。若浏览器提示证书不受信任,选择"继续/
高级 → 继续访问"。然后照常安装 + 开启推送。

> 需要本机装有 OpenSSL(`openssl`)。若没有,改用方式 B。

### 方式 B: 公网隧道(推荐,手机无需证书信任,支持 iPhone)

用一条命令把本地服务暴露成公网 HTTPS 地址:

```powershell
npx localtunnel --port 8788
```

它会打印一个形如 `https://xxxx.loca.lt` 的公网地址。用手机浏览器打开它,
安装到主屏幕 + 开启推送即可。iPhone 上 Web Push 也以此方式最省事。

> 注意: `localtunnel` 免费,但地址会在重启后变化;且每天首次打开会有一个
> "点击继续"的确认页,点一下即可。

### 方式 C: Cloudflare Quick Tunnel(推荐,无需账号)

需安装 cloudflared:

```powershell
winget install --id Cloudflare.cloudflared
```

启动公网隧道:

```powershell
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8788 --no-autoupdate
```

它会打印一个形如 `https://carlos-brush-parks-parliamentary.trycloudflare.com`
的稳定公网 HTTPS 地址。首次部署后,**用手机浏览器打开该地址** → 添加到主屏幕 →
允许通知,即可收到每日推送。

> 一键脚本: 项目根目录运行 `start.bat`,它会同时拉起本地服务与 Cloudflare 隧道
> 并打印当前公网地址。注意该终端窗口必须保持打开。

---

## 完整链路: 手机如何收到每日推送

1. 电脑上跑着这个服务(方式 A 或 B),并保持运行。
2. 手机打开页面 → 安装到主屏幕 → 允许通知。
3. 浏览器把订阅信息(Push Subscription)发给服务端 `/api/subscribe`。
4. 服务端每天 08:30 用定时任务拉取最新 VIX / VXN,计算信号,把消息推给所有订阅。
5. 手机收到通知,点开即跳回 App 对应页面。

> 若想让"电脑关机也能推送",需把这套服务部署到一台 24 小时在线的服务器
>(如 VPS / Railway / Render)。本项目代码可直接部署,另见下节。

---

## 部署到公网(可选,长期运行)

项目是纯 Node + Express,可部署到任意平台:

1. 上传 `server/ public/ package.json`(以及 `.env`)。
2. 设环境变量 `PORT`、`HTTPS=1`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`。
3. 跑 `npm install && npm start`。

生成持久 VAPID 密钥:

```powershell
node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"
```

把输出填到环境变量,避免换服务器后推送失效。

### Docker 部署(推荐,云平台通用)

项目已带 `Dockerfile`:

```bash
docker build -t vix-vxn-app .
docker run -d -p 8788:8788 \
  -e VAPID_PUBLIC_KEY=xxx \
  -e VAPID_PRIVATE_KEY=yyy \
  -e DAILY_CRON="30 8 * * *" \
  -e DATA_DIR=/data \
  -v vixdata:/data \
  vix-vxn-app
```

`DATA_DIR` 指向一个**持久卷**,让推送订阅和 VAPID 密钥在容器重建后依然保留。
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 建议用环境变量固定(不依赖卷),这样最稳。

> 若平台给了内置 `PORT`(如 Render/Railway),不设也行,平台会注入。
> **务必固定 VAPID 密钥**,否则换域名/重启后,手机上已订阅的推送会失效,需要重新
> 打开 App 再点一次"开启推送"。

---

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/snapshot` | 当前 VIX/VXN 数据 + 信号(加 `?force=1` 强制刷新) |
| GET | `/api/history/:code` | 历史收盘价 (`VIX` / `VXN`) |
| GET | `/api/meta` | 服务元信息(VAPID 公钥、端口、订阅数) |
| POST | `/api/subscribe` | 注册推送订阅 |
| POST | `/api/unsubscribe` | 取消推送订阅 |
| POST | `/api/test-push` | 手动向所有订阅发一条测试推送 |
| GET | `/api/health` | 健康检查 |

---

## 信号模型说明

评分范围 **-100(强烈看空波动率)到 +100(强烈看多波动率)**,分 |100|>30 为
有效信号,落入中性区则观望。四项驱动因子:

1. **历史分位** — 波动率处于极低分位时预期"反向回升"(看多);极端恐慌时预期回落(看空)。
2. **Z 值** — 价格相对自身近 40 日均值的偏离,偏离越大回归引力越强。
3. **5 日动量** — 短期趋势方向的顺势加成(权重较轻)。
4. **VXN/VIX 溢价** — 衡量科技股相对大盘的风险溢价,过高/过低时对综合信号做小幅修正。

置信度结合了信号强度(距中性距离)与各因子方向的一致性。

---

## 项目结构

```
vix-vxn-app/
├─ server/
│  ├─ index.js      # Express + Web Push + 定时任务
│  ├─ data.js       # 拉取 Cboe 历史 + CNBC 实时行情
│  └─ signal.js     # 买卖信号引擎
├─ public/
│  ├─ index.html    # 界面
│  ├─ app.js        # 图表/信号渲染 + 推送/安装逻辑
│  ├─ styles.css    # 深色响应式样式(含浅色模式)
│  ├─ sw.js         # Service Worker(离线缓存 + 通知)
│  ├─ manifest.webmanifest
│  ├─ vendor/chart.umd.js   # Chart.js(本地,离线可用)
│  └─ icons/icon-192.png, icon-512.png
├─ scripts/
│  ├─ make_icons.py # 生成图标
│  └─ gen-cert.ps1  # 生成自签名 HTTPS 证书
└─ package.json
```

## 故障排查

- **手机打不开 LAN 地址**: 确认同一 Wi-Fi、Windows 防火墙允许 `node` 或端口
  `8788` 入站。
- **推送按钮无反应**: 必须 HTTPS(或用 localtunnel / localhost)。非安全上下文
  下浏览器会禁用 Push API。
- **收不到每日推送**: 确认服务端一直运行、通知权限已允许、且是"添加到主屏幕"
  后打开(而非普通标签页)。
- **信号不变**: 每 5 分钟自动刷新;手动点右上角 ⟳ 强制刷新。
