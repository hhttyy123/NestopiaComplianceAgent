# Nestopia 合规性检查

当前服务范围：美国 Maryland · Montgomery County 县级受理的新建独立 ADU。独立市镇、其他县州及其他产品不在本版范围。表单与服务端双重限制。

输入结构化事实 → 实时查询官方资料 → 保存原文版本 → AI 分析 → 结构、逐字引用、数值与独立语义复核 → 保存报告、反馈与可复用检查结构。

## 本地运行

```powershell
npm ci
npm run setup
npm run build
npm start
```

本地需可用的Poppler `pdftotext`（Windows可用Git自带版本，也可通过PDFTOTEXT_BIN指定完整路径）；VPS镜像已配置安装。

服务端 `.env.local` 配置 `DEEPSEEK_API_KEY`，模型 `deepseek-flash`。访问 http://127.0.0.1:3000 。已有服务时勿重复启动；不能让两个实例共享 DATA_DIR。不要提交密钥。

## 交付资料

- [VPS 上线步骤](docs/VPS上线.md)
- [真实案例填写与比对](docs/马里兰真实案例测试.md)
- [本轮修改与验收](docs/上线验收.md)
- [课题三原文自查](docs/课题三代码与原文自查.md)：历史审查，整改状态以本轮验收为准。

## 功能与保存

报告含20项建筑评价、9类许可及材料、带前提和证据的流程估算。材料勾选保存至报告；支持补充条件、追问、纠错及删除。开发者页面和接口已移除，后台审计仍落库。

数据为 `DATA_DIR/nestopia.sqlite`，默认 `data/nestopia.sqlite`。每次事务原子导出；仅支持单进程单实例。重启自动恢复本版本运行中的任务，已完成证据分析及评价阶段可复用；旧版中断任务标记失败。删除为软删除，可恢复，默认不展示、不复用；不是物理抹除。

`research_runs.payload` 保存输入、报告、已勾材料、阶段断点和复核结果；`research_source_versions.payload` 保存原文及哈希版本；查询缓存6小时、来源缓存24小时、临时失败缓存5分钟（可强制刷新）；`research_feedback` 保存反馈；`research_trace` 保存脱敏请求、输出和验证事件。不保存模型隐藏推理链。

同产品、同县州、同建设方式跨地址参考最近4份报告的检查结构和反馈；被纠错报告不沿用原建议。每次重新用当前证据判断，经验不是法规。

提示词：`src/server/prompts.ts`；复核：`src/server/quality.ts`；结构：`src/domain/evaluation.ts`。AI 不预置法律阈值，已引用的数值限制由程序按用户尺寸复算。官方PDF直接下载并用Poppler提取，网页通过 DeepSeek Fetch 取得并归档，逐字一致不等于法律解释保证，语义复核仍可能出错。

## 检查与备份

```powershell
npm test
npm run typecheck
npm run build
npm run test:http
npm run backup
```

`npm run check:research -- --input docs/cases/01-braeburn-adw2402.json` 发起两次真实联网检查，使用隔离目录验证查询缓存与经验复用，产生真实供应商费用。不会给正式工作空间注入案例。

VPS 使用 HTTPS、共享工作空间密码和持久化卷。该版本适合本人或授权小团队使用；不是多租户账号系统，也不自动提交或跟踪政府许可。公网部署前必须填实际域名、密码与密钥并完成服务器验收。
