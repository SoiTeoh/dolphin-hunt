# 海豚干饭冲滩（Dolphin Hunt）— 项目状态

## 1. 项目定位

Idea Lab v2 — Project 04：基于 **Vite + TypeScript (strict) + 原生 HTML5 Canvas 2D + Web Audio API** 的俯视角海岸线物理小游戏。

## 2. 当前开发阶段

- **MVP 核心开发、试玩手感调优与自动化验收已完成**（Task 1～5 对应工程搭建、正弦潮汐与分区物理、逃命鱼 AI 与路人助攻/救援状态机、Canvas 2D 矢量渲染与合成音效、单元测试及三视口 Playwright 检查；已将干沙/湿沙失水窗口调慢至约 `3.5–4.5s`，并把草帽路人散步线移至 `y ≈ 208` 靠近鱼群且救援时冲向搁浅海豚）。
- **已同步至 GitHub 仓库**：`origin`（`https://github.com/SoiTeoh/dolphin-hunt.git`）`main` 分支已完成首提交并推送。

## 3. 已实现功能

- `src/config/tuning.ts`：集中管理 `390×640` 逻辑视口、`1000/60 ms` 固定步长、`4.5s` 潮汐周期与 `82px` 振幅、水/湿沙/干沙阻力与失水/回湿速率、`0.75s` 猛扑冷却与 `60s / 3 心` 规则。
- `src/game/rules.ts`：纯 TypeScript 核心规则（`computeTideY`、`classifySurfaceZone`、`stepMoistureAndRescue`、`stepMatchClockAndCombo`、`applyFishEaten`、`stepFishEntity`、`stepHelperPatrolAndAssist`）。
- `src/game/world.ts`：确定性 2D 物理步进器，驱动海豚分区手感、猛扑突进、鱼群动态补货、路人日常拨鱼助攻与搁浅推回深海。
- `src/game/audio.ts`：零依赖 Web Audio API 合成音效（猛扑破水、干饭咀嚼、低湿警报、救援口哨与路人助攻提示）。
- `src/render/painter.ts`：分层海滩与多层泡沫潮汐线、4 种海豚拟人表情与离水湿润度警示弧、3 种逃命鱼、草帽路人、右下角圆形「冲滩猛扑」冷却环按钮及 `?debug=1` 调试叠层。
- `src/main.ts`：DPR 自适应、+36px 上偏移指针引导与右下角猛扑按钮多指隔离、`WASD`/方向键/`Space`/`R`、`localStorage` 最高分读写。

## 4. 最新自动化验证结果

- `npm.cmd --prefix D:\Codex\idea-lab\dolphin-hunt run typecheck`：通过（0 错误）。
- `npm.cmd --prefix D:\Codex\idea-lab\dolphin-hunt test`：1 个测试文件、18 项 Vitest 单元测试全部通过（`tests/rules.test.ts`）。
- `npm.cmd --prefix D:\Codex\idea-lab\dolphin-hunt run build`：通过（`dist/assets/index-*.js` `28.17 kB` / gzip `9.87 kB`）。
- Playwright Chromium 三视口端到端验证（`360×640`、`390×844` 含 `?debug=1`、`1280×800`）：
  - 均满足 `fitsViewport: true`、`overflow: false`。
  - 模拟点击开局、拖动游向岸边、点击右下角「冲滩猛扑」全程 0 控制台报错、0 页面异常、0 外部网络请求。

## 5. 待真人试玩验证项

- 触屏单指拖动（+36px 上偏移）与右下角「冲滩猛扑」同时操作的手感顺滑度。
- 干沙滩失水节奏与飞鱼二段弹跳逃生的难度平衡。
- 试玩确认后再初始化 Git 仓库并推送至远程仓库。
