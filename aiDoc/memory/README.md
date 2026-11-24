# 项目记忆

本次从现有 README、实现和配置整理以下长期约定。表中日期为本次登记日期。

| 日期 | 决策 | 适用范围与原因 | 相关 Spec 或记录 |
| --- | --- | --- | --- |
| 2026-11-24 | SMART 消费已生成的 MAPF 路径 | 新增仿真入口沿用地图、场景和路径作为输入。规划器负责生成路径 | [运行与开发关系](../relations/README.md) |
| 2026-11-24 | 本地 3D 支持离线运行 | Rapier 和 Three.js 随项目提供，本地 Node.js 服务提供仿真和浏览器资源 | [本地仿真指南](../../sim/README.md)、[依赖清单](../../sim/vendor/README.md) |
| 2026-11-24 | 本地 3D 与原版 ARGoS 各自运行和验收 | 本地入口使用 JavaScript ADG 与 Rapier，原版入口使用 C++ ADG、Foot-bot 与 RPC | [本地仿真 Spec](../specs/2026-11-24-本地仿真-路径执行与回放.md)、[ARGoS Spec](../specs/2026-11-24-argos-实验启动与统计.md) |

跨任务的需求变化和验收进展按 [业务记录规则](business/README.md) 维护。
