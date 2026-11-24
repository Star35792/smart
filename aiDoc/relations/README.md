# 运行与开发关系

## 项目概况

SMART 消费已有 MAPF 路径，通过动作依赖图（ADG）协调多机器人执行，并记录物理仿真和执行结果。路径由外部规划器生成。仓库包含两套仿真入口，它们可复用示例数据，分别维护各自的运行状态。

| 组件或入口 | 运行方式 | 状态与数据来源 | 外部依赖 |
| --- | --- | --- | --- |
| 本地 3D 网页 | `node sim/server.mjs`，浏览器打开 `http://127.0.0.1:8765/` | 服务读取内置样例或接收导入的文件内容，工作线程返回回放 JSON，浏览器负责渲染 | Node.js 22+，浏览器支持 WebGL 2。Rapier 和 Three.js 随仓库提供 |
| 本地 3D CLI | `node sim/server.mjs run` | 从样例或本地文件读取输入，向终端输出统计，可写回放 JSON | Node.js 22+ 与仓库自带的 Rapier |
| 原版 ARGoS | 按 [README 的原版运行指南](../../README.md#running-guide-for-entire-pipeline) 调用 `run_sim.py` | Python 生成 `.argos`，C++ 服务维护 ADG，Foot-bot 控制器通过 RPC 交换动作和进度 | 根 README 给出 Ubuntu 22.04 环境。需 Python 3、CMake 3.16+、支持 C++20 的编译器、Boost、rpclib 和 ARGoS 3 |
| 项目网站 | GitHub Actions 调用 `docs/build_docs.sh` | Sphinx 将 `docs/source/` 构建到 `docs/build/html/`，Pages 工作流上传并部署 | Python 3.11 与 [docs/requirements.txt](../../docs/requirements.txt) |

本地执行顺序为场景校验、构建 ADG、Rapier 推进、输出回放。网页通过 `POST /api/simulate` 提交，CLI 在同一进程调用相同的仿真逻辑。原版 ARGoS 先由脚本配置场景，再启动 ADG 服务和 `argos3`，由控制器回报每个机器人的执行进度。

## 开发与验证

以下命令从仓库根目录执行。浏览器和平台验收状态见 [已知缺口](../specs/known-gaps.md)。

| 操作 | 命令或入口 | 前置条件与预期结果 |
| --- | --- | --- |
| 启动本地 3D | `node sim/server.mjs`。Windows 可运行 [start-smart.cmd](../../start-smart.cmd) | 默认监听 `127.0.0.1:8765`。可用 `--host`、`--port` 或 `SMART_HOST`、`SMART_PORT` 指定地址和端口 |
| 运行本地冒烟测试 | `node --test sim/smoke.test.mjs` | Node.js 22+。本次 Windows / Node.js 24.22.3 实测 4 项通过 |
| 运行仓库规模样例 | `node sim/server.mjs run --example warehouse --agents 1000` | 本次实测 `outcome=completed`、`finished=1000`。可加 `--output warehouse-trace.json` 保存回放 |
| 查看 CLI 参数 | `node sim/server.mjs --help` | 可查看自定义三文件导入和物理参数，完整示例见 [本地仿真指南](../../sim/README.md) |
| 构建并运行 Docker | `docker build -t smart-3d .` / `docker run --rm -p 127.0.0.1:8765:8765 smart-3d` | Docker 需能获取 Node 基础镜像。镜像启动本地 3D 服务，宿主机可访问默认回环地址 |
| 构建原版 ARGoS | `git submodule update --init`、`cmake -S . -B build`、`cmake --build build --parallel` | 需要完整的原版工具链。目标产物包括 `build/server/ADG_server` 和 Foot-bot 控制器插件 |
| 运行原版 ARGoS | 使用 [原版样例命令](../specs/2026-11-24-argos-实验启动与统计.md#验收条件) | 需要上一步产物和 `argos3`。脚本默认生成 `output.argos`，服务成功保存时会追加 `stats.csv` |
| 构建和发布项目网站 | 在 Bash 中运行 `python -m pip install -r docs/requirements.txt` 和 `DOCS_DEV=1 CI=1 bash docs/build_docs.sh` | 预期生成 `docs/build/html/index.html`。[Pages 工作流](../../.github/workflows/docs.yml) 响应 `master` 上的网站或工作流改动，也支持手动触发 |
