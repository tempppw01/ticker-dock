# TickerDock 行情小组件

[English](README.md) | 简体中文

项目英文名为 **TickerDock**,建议 GitHub 仓库名为 `ticker-dock`。

一个常驻桌面的 A 股 / 美股迷你行情面板，基于 Tauri 2 + React 19 + TypeScript + Rust。

## 功能

- 提供完整视图(388 x 106)和紧凑胶囊(244 x 52)两种尺寸，无边框透明窗口默认置顶，可拖动、最小化、关闭。
- 完整视图右上角点击收起图标进入紧凑胶囊；紧凑胶囊只显示名称、分时走势和涨跌幅，悬停后点击右侧展开图标即可恢复。
- 自动模式：北京时间 09:15 - 15:05 显示 A 股，其余时间显示美股。
- 也可手动切换「A股 / 板块 / 美股」，交易中每 5 秒刷新，休市时每 60 秒刷新，请求失败时 15 秒后重试。
- 「板块」页展示 A 股行业与概念涨幅榜前 12，并支持搜索、添加自选板块（例如银行、券商），自选板块排在涨幅榜前面。
- 一只股票占一屏，可用左右箭头或键盘方向键切换；多只自选时每 7 秒自动轮播，鼠标悬停或编辑时暂停。
- 每屏展示最新价、涨跌幅、分时曲线和日内区间位置，红涨绿跌。
- 分时曲线交易中每 30 秒刷新，休市时每 120 秒刷新；分时数据不可用时降级为日内高低区间条。
- 顶部显示当前市场状态和刷新间隔，悬停可查看下次开盘倒计时。
- 美股已接入法定节假日和半日市日历，半日市按美东时间 13:00 收盘。
- A 股与美股行情通过 Rust 后端批量请求腾讯行情接口，避免浏览器跨域限制。
- A 股板块行情来自东方财富行业与概念板块接口，交易中每 5 秒刷新，板块分时每 30 秒刷新。

## 本地开发

```powershell
npm install
npm run desktop
```

只预览网页版（使用内置演示行情）：

```powershell
npm run dev
```

## 构建 Windows 安装包

```powershell
npm run desktop:build
```

产物位于 `src-tauri/target/release/bundle/`。

## 自动发布

当前版本为 `0.1.0`。推送与项目版本一致的 SemVer 标签后,GitHub Actions
会自动运行检查、构建 Windows 安装包并创建 GitHub Release:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

发布工作流会校验标签版本与 `package.json`、`src-tauri/Cargo.toml`、
`src-tauri/tauri.conf.json` 完全一致。任何一处不一致都会终止发布,避免上传
错误版本。

## 测试

```powershell
npm run lint
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored
```

最后一条命令会访问真实行情接口。

## 自选股管理

- 点击右上角 `+` 打开输入框，输入代码后回车或点「添加」。
- A 股支持 `600519`、`000001`、`300750`、`430047`、`sh600519` 等写法。
- 美股支持 `AAPL`、`usAAPL`、`TSLA` 等写法。
- 添加后会自动切换到对应市场；每个市场最多 20 只。
- 点击右上角列表图标打开「自选管理」，可看到当前市场的全部自选股。
- 点击某一行可切换到该股票；点击行尾垃圾桶后还需再点「移除」确认，避免误删，至少保留一只。
- 自选列表保存在本地 `stock-widget.watchlists.v1`，重启应用后保留。

## 自选板块

- 在「板块」页点击右上角 `+`，输入板块名称或代码后回车，例如 `银行`、`券商`、`BK1283`。
- 搜索结果中点击某一行或行尾 `+` 即可加入自选；已加入的板块会显示对勾。
- 点击右上角列表图标，自选板块排在涨幅榜前面，并带有「自选」标记。
- 点击自选板块行尾垃圾桶，再点「移除」确认，可取消监控；涨幅榜中的板块可直接点 `+` 加入自选。
- 最多可固定 12 个板块，自选列表保存在本地 `stock-widget.sectors.v1`，重启应用后保留。
- 板块目录首次搜索时从东方财富拉取并缓存 10 分钟，只搜索本地缓存，不会反复请求全量列表。

## 目录

- `src/lib/market.ts`：交易时段、自动市场切换、下次开盘倒计时。
- `src/lib/view.ts`：完整视图 / 紧凑胶囊的尺寸与本地状态持久化。
- `src/lib/quotes.ts`：自选列表、Tauri 调用与浏览器演示数据。
- `src/components/QuoteRow.tsx`：单只行情展示与左右切换。
- `src/components/Sparkline.tsx`：分时曲线与昨收基线。
- `src-tauri/src/quotes.rs`：腾讯行情请求、GBK 解码与字段解析。
- `src-tauri/src/intraday.rs`：分时数据请求与解析。
- `src-tauri/src/sectors.rs`：A 股板块目录搜索、自选板块行情与涨幅榜请求解析。
- `src-tauri/tauri.conf.json`：桌面窗口尺寸、透明、置顶等配置。
- `docs/GITHUB.md`:GitHub 仓库信息、发布前检查和 Release 模板。
- `.github/workflows/release.yml`:推送版本标签后自动测试、构建并发布 Windows 安装包。

## 说明

行情来自腾讯公开接口，可能有数秒延迟，仅适合日常查看，不构成投资建议。美股交易日已排除法定节假日并处理半日市，A 股目前仍只排除周末，尚未接入法定节假日日历。

## 许可证

项目尚未选择开源许可证。在添加 `LICENSE` 文件之前，源代码不授权在本仓库之外进行再分发或复用。
