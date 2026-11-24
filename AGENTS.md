# SMART 项目协作规则

## 阅读入口

1. 阅读 [aiDoc 入口](aiDoc/README.md)，从 [Spec 索引](aiDoc/specs/README.md) 找到本次任务涉及的行为和验收条件。
2. 从 [模块索引](aiDoc/modules/README.md) 定位实现入口，按需查看 [运行与开发关系](aiDoc/relations/README.md) 和 [项目记忆](aiDoc/memory/README.md)。
3. 确认需求、约束和现有实现后再修改。保留工作区中与本次任务无关的改动。

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## 实现与验证

- 按项目现有分层修改。`sim/` 在 Node.js 中执行场景校验、ADG 和物理仿真，浏览器通过 HTTP 获取回放。Python 启动器、`server/` 和 `client/` 对应原版 ARGoS 流程，两条运行链路分别验收。
- 修改接口、数据或配置时，检查已有调用方、存量数据和默认行为。变更路径解析、坐标约定或依赖规则时，核对受影响的入口与样例。
- 改变行为时同步更新相关 Spec 和验收覆盖。优先用稳定、可重复的测试验证关键行为与失败路径。
- 当前实际行为以源码、运行配置和可复现结果为准。发现与 Spec 不一致时，先确认预期，再修复实现或更新 Spec，并记录验证范围及已知缺口。
- 按 [运行与开发关系](aiDoc/relations/README.md) 执行相关验证。交付时说明实测结果和待验证范围。涉及浏览器、Docker 或 ARGoS 的验收须记录实际运行环境。

## 文档与协作

- 已确认的需求变化如果影响后续任务，按 [业务记录规则](aiDoc/memory/business/README.md) 更新记录。对外行为和验收条件维护在相应的 Spec 中。
- 独立 Markdown 的默认标题为 `YYYY-MM-DD（功能）：具体细节`，文件名为 `YYYY-MM-DD-功能-具体细节.md`。日期用成稿日期，固定名称的规则、索引和模板保持其文件名。目标项目已有约定时沿用现有约定。
- 凭证、访问令牌、真实环境密钥和敏感数据应留在授权的环境与密钥管理渠道。示例、日志和测试数据使用占位值或脱敏数据。
- Git 提交沿用项目现有约定。
