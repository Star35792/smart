# 模块索引

| 模块 | 代码入口 | 职责与状态归属 | 依赖边界 | 对应 Spec |
| --- | --- | --- | --- | --- |
| 本地服务与 CLI | [sim/server.mjs](../../sim/server.mjs) | 提供静态页面、仿真 API 和命令行入口，管理 HTTP 工作线程与返回结果 | Node.js 内置模块、场景输入、仿真执行 | [SIM-004、SIM-005](../specs/2026-11-24-本地仿真-路径执行与回放.md) |
| 场景输入 | [sim/input.mjs](../../sim/input.mjs) | 读取样例或用户输入，验证并归一化路径坐标、时间戳和物理参数 | 仓库内置样例与 Node.js 文件读取 | [SIM-001](../specs/2026-11-24-本地仿真-路径执行与回放.md#sim-001-场景导入) |
| JavaScript 动作依赖图 | [sim/adg.mjs](../../sim/adg.mjs) | 将路径拆成转向和半格移动，建立动作依赖和完成确认规则 | 归一化路径，与 C++ ADG 保持规则上的对应 | [SIM-002](../specs/2026-11-24-本地仿真-路径执行与回放.md#sim-002-动作依赖与仿真完成) |
| 物理仿真 | [sim/physics.mjs](../../sim/physics.mjs) | 推进 Rapier 刚体、施加冲量、统计接触、采样并生成回放结果 | JavaScript ADG 与随仓库提供的 Rapier | [SIM-002、SIM-003](../specs/2026-11-24-本地仿真-路径执行与回放.md) |
| 浏览器回放 | [sim/public/index.html](../../sim/public/index.html)、[sim/public/app.mjs](../../sim/public/app.mjs) | 场景选择与导入、仿真提交、相机与时间轴、事件查看和 JSON 导出 | 同源仿真 HTTP 接口、随仓库提供的 Three.js、WebGL 2 | [SIM-006](../specs/2026-11-24-本地仿真-路径执行与回放.md#sim-006-浏览器回放) |
| C++ ADG 服务 | [server/src/ADG_server.cpp](../../server/src/ADG_server.cpp)、[ADG.cpp](../../server/src/ADG.cpp)、[parser.cpp](../../server/src/parser.cpp) | 解析规划路径，维护动作依赖和机器人进度，提供 RPC 并写统计 | Boost、rpclib、输入路径文件 | [ARGOS-001](../specs/2026-11-24-argos-实验启动与统计.md#argos-001-样例实验与结果) |
| ARGoS 控制器 | [footbot_diffusion.cpp](../../client/controllers/footbot_diffusion/footbot_diffusion.cpp) | 从 RPC 获取可执行动作，控制 Foot-bot，并回报完成进度 | ARGoS 3 控制器接口与 C++ ADG 服务 | [ARGOS-001](../specs/2026-11-24-argos-实验启动与统计.md#argos-001-样例实验与结果) |
| ARGoS 启动与配置 | `run_sim.py`、`create_Argos`，见 [README 启动命令](../../README.md#running-guide-for-entire-pipeline) | 从地图和场景生成实验配置，启动 ADG 服务和 ARGoS 并等待两个进程 | Python、输入样例、CMake 构建产物与 `argos3` | [ARGOS-001](../specs/2026-11-24-argos-实验启动与统计.md#argos-001-样例实验与结果) |
| 样例数据与冒烟测试 | [样例清单](../../sim/input.mjs)、[sim/smoke.test.mjs](../../sim/smoke.test.mjs) | 提供地图、场景和路径，覆盖坐标、ADG、物理和输入错误 | Node.js 测试运行器与本地仿真模块 | [本地仿真 Spec](../specs/2026-11-24-本地仿真-路径执行与回放.md) |
| 项目网站 | [docs/source/index.rst](../../docs/source/index.rst)、[docs.yml](../../.github/workflows/docs.yml) | 维护公开项目站点，通过 GitHub Pages 构建发布 | Sphinx 与 GitHub Actions | 见[运行与开发关系](../relations/README.md) |

跨模块的数据流见 [运行与开发关系](../relations/README.md)。
