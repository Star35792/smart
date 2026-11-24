# SMART 本地 3D 仿真

## 启动

需要 Node.js 22 或更高版本。运行 3D 页面还需要支持 WebGL 2 的浏览器。Windows 可双击 `start-smart.cmd`，也可以在项目根目录打开终端运行。macOS 和 Linux 使用同一条命令。

```sh
node sim/server.mjs
```

在浏览器打开 `http://127.0.0.1:8765/`。首次进入会计算并播放随机障碍地图的 50 台机器人。端口被占用时，可加 `--port 8766`。关闭终端或按 `Ctrl+C` 停止服务。Node 与浏览器通过本机回环地址通信，Rapier 和 Three.js 的运行文件随项目提供，运行时可离线使用。

### Docker

```sh
docker build -t smart-3d .
docker run --rm -p 127.0.0.1:8765:8765 smart-3d
```

访问地址相同。构建需要 Docker 能获取 Node 基础镜像。Windows 如果使用 Docker Desktop 来运行此 Linux 镜像，其虚拟化由 Docker Desktop 提供。Windows 直接用 Node 启动时只需要原生 Node 运行时和浏览器。

## 仿真与回放

- 随机障碍场景包含 50 条路径，仓库场景包含 1,000 条路径。可选择前 N 台机器人执行。
- 自定义场景可导入 Moving AI `.map`、`.scen` 和 `Agent N:(x,y)->…` 路径文本。也支持 `Agent N:(x,y,t)->…`，时间戳用于动作优先级，每个机器人的时间戳须严格递增。无时间戳时从 0 开始按步递增。路径按 `.scen` 文件的行排序，编号从 0 开始，允许原地等待。移动限于四邻接的可通行格。`@ O T W S #` 在本仿真中按实体障碍处理。导入 YX 路径时需选择 YX，地图与 `.scen` 的列顺序仍是 XY。
- 3D 视图支持旋转、缩放、平移、俯视、机器人选择和所选路线显示。可以暂停、调整速度、跳到任意回放时间，或从事件记录跳到碰撞及外力发生时刻。
- 可设置驱动速度、加速度、转速和地面摩擦，也可对指定机器人施加水平冲量。结果可导出为 JSON，其中包含地图、路线、时间序列、事件和统计。接触统计记录两个物体开始接触的次数，持续接触只计一次，分开后再次接触会重新计数。地板支撑接触不计入统计。
- “已到达”表示该机器人已完成计划动作。之后仍能受碰撞或外力影响，实际位置可在回放中查看。大规模回放会降低采样频率，导出的 `sampleSeconds` 记录该间隔。物理步长始终为 1/60 秒。

### 命令行运行

```sh
node sim/server.mjs run --example warehouse --agents 1000 --output warehouse-trace.json
node sim/server.mjs run --map examples/random/random-32-32-20.map --scenario examples/random/random-32-32-20-random-1.scen --paths examples/random/example_paths_yx.txt --order yx --agents 50
node sim/server.mjs --help
node --test sim/smoke.test.mjs
```

命令行退出码 `0` 表示动作全部完成，`1` 表示输入或执行错误，`2` 表示依赖阻塞或达到仿真时限。超时时仍可保存已生成的回放。

## 实现结构

- `input.mjs` 读取并校验场景、坐标、路径和物理参数。
- `adg.mjs` 将 SMART 的转向、半格移动和 ADG 跨机器人依赖规则移植到 JavaScript。节点完成后释放其后继依赖。
- `physics.mjs` 在 Rapier 3D 中用重力、质量、摩擦、连续碰撞检测、驱动力和转向扭矩推进刚体。地图一格约定为一米。机器人是直立圆柱，限制横滚和俯仰以表达平面轮式底盘。该控制器用纵向驱动力和侧向抓地近似车辆运动。
- `server.mjs` 是 Node 本地 HTTP 服务及命令行入口。服务在工作线程中运行物理计算。`public/` 使用 Three.js 渲染物理采样结果。
- `vendor/` 保存固定版本的运行模块和许可证。ARGoS 的 Foot-bot 传感器、独立轮胎动力学、插件和原有分布式 RPC 实验由项目原版入口提供。

本地仿真面向已有 MAPF 路径的执行。路径规划由外部规划器负责。可用性验证涵盖 Windows；Linux、macOS 和 Docker 可按各自的启动方式运行，当前工作区未提供这些环境供实机验证。
