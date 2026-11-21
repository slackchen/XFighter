# 《绯月星刃 / CRIMSON ASTRAL BLADE》 (XFighter)

A classic 2D side-view console-style anime fighting game demo built from scratch with React 18, TypeScript, Vite, a 60Hz deterministic Canvas2D combat engine, procedural/raster sprite animation pipelines, and Web Audio API layered sound & music.

---

## 游戏特色 · Features

- **2 位二次元女主角色（含 1P / 2P 异色配色与奥义 Cut-in 特写）**
  - **绯樱 · 凛 (Hizakura Rin)**：绯月居合剑姬 — 高速近战、居合突进、无敌升龙与超必杀「千本绯樱葬」。
  - **苍月 · 莉亚 (Sogetsu Lia)**：星穹光枪咏唱者 — 长距枪术、星落光矢弹幕、苍穹螺旋钻与超必杀「苍穹星陨破」。
- **1 座 2.5D 视差战斗舞台**
  - **绯月星穹神社 · 樱落天台**：远景满月星空、中景朱红神社与樱花飘落、透视石板反光地面与动态相机缩放追随。
- **3 种对战模式 + 暂停招式表 & 判定框调试**
  - **街机挑战 (Arcade VS CPU)**：带角色专属理想立回间距（凛近中距 / 莉亚中远牵制）、防贴脸脱身、微步拉扯、差合反击与视觉延迟格挡的人性化 AI。
  - **本地双人 (2P Versus)**：支持同屏双键盘或双游戏手柄（Gamepad）。
  - **道场修行 (Training Mode)**：木桩自动回血、满气槽无限奥义练习及实时 Hitbox/Hurtbox 判定框开关。
- **经典 2D 格斗系统**
  - 60Hz 固定步长格斗物理、接地步态锁步、起跳蓄力（4f）、三段式空中冲刺、高防/蹲防、连段取消（轻→中→重→必杀→奥义）、Break/Counter 破招暴击、两段式受击闪白、浮空砸地弹跳与平躺/单膝无敌起身。
  - **全招式大/中/小 (L / M / H) 三档递进**：站/蹲/空通常技齐全（含 `2M`、`jL`），必杀技在起手速度、高度、弹速及光效体型上逐级拉开差距。

---

## 操作指南 · Controls

### 1P（单人模式兼容方向键移动）
| 操作 | 按键 |
| --- | --- |
| 移动 / 跳跃 / 下蹲 / 拉后防御 | `W` `A` `S` `D` |
| 轻 / 中 / 重 攻击 | `J` / `K` / `L` |
| 必杀技（中档 / 按住 `J+U` 轻 / `L+U` 重） | `U`（可配合 `→` / `↓`） |
| 经典搓招必杀（轻 / 中 / 重） | `↓↘→` / `→↓↘` / `↓↙←` + `J` / `K` / `L` |
| 超必杀奥义（100% 气槽） | `I` |
| 疾进 / 后撤步 / 空中冲刺 | `O`（或双击前/后） |
| 暂停 / 出招表 / 混音设置 / 判定框 | `Esc` |

### 2P（本地双人）
| 操作 | 按键 |
| --- | --- |
| 移动 / 跳跃 / 下蹲 | `↑` `←` `↓` `→` |
| 轻 / 中 / 重 / 必杀 / 奥义 / 冲刺 | 小键盘 `1`~`6`（或 `,` `.` `/` `;` `'` `[`） |

---

## 技术栈 · Tech Stack

- **Frontend / UI**: React 18, TypeScript 5.6, Vite 6, `lucide-react`
- **Engine (`src/engine/`)**: Custom 60Hz `CombatEngine`, `Fighter`, `AIController`, `Camera`, `StageRenderer`, `FighterRenderer`, `VFXManager`, `InputManager`, `AudioManager`
- **Asset Pipelines (`scripts/`)**: Python (`PIL` + `numpy` + `ffmpeg` + Windows SAPI) 生成战斗与运动关键帧、2P 异色、原声 BGM、分层打击音效与竞技场播报语音。

---

## 本地运行 · Getting Started

```bash
pnpm install
pnpm dev
```

打开浏览器访问 `http://localhost:5173/`。

生产构建：

```bash
pnpm run build
```
