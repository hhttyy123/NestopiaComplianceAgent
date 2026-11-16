# 历史资料（不参与当前运行）

本目录为首版研发存档，旧命令和固定规则描述不再适用。当前程序实时检索并在数据库保存获取的原文版本；Docker发布包不包含本目录。当前说明见[项目README](../README.md)。

# 首版来源与审查记录

核对日：2026-11-15。核对层级：研发公开资料阅读，未经过企业合规人员或PE签认。

| 来源 | 使用方式 | 重要限制 |
|---|---|---|
| [Council Ordinance 20-36 / ZTA 26-06](https://assets.montgomerycountymd.gov/files/2026-09/Ordinance%2020-36%20%28ZTA%2026-06%29.pdf) | 第5–9页修订文本，封面记录2026-10-05生效；自动核查有限明确条件 | 必须区分新增、保留及删除文字；size计量、分区、专业标准不自动推断 |
| [DHCA Class 3指南](https://www.montgomerycountymd.gov/DHCA/Resources/Files/Class%203%20ADU%20Info.pdf) | 第1–2页申请准备及新建筑许可入口参考 | 后续要求仍含旧版面积和停车规定，不整份用于现行判断；流程、费用和周期需重新确认 |
| [Bill 41-26官方状态](https://apps.montgomerycountymd.gov/ccllims/BillDetailsPage?RecordId=2930) | 显示2026-11-10已通过，提醒许可改革需要核实 | 生效日期未明确，不能将改革直接视为当前生效要求 |

自动判断包含：一般75%面积比例（先确认相同计量口径）、一地块一套ADU、短租限制、主住宅类型、一般许可路径相同地址及成人数量。其他条件均保留人工事项。

旧的Planning说明和在线汇编仍可能包含修订前文本。首版不把它们用于现行数值条件；没有为每个分区硬编码退界或高度。

已保存官方签署修订PDF：`sources/Ordinance-20-36-ZTA-26-06.pdf`。

SHA-256：`BF450AE1AF2DFFCDA453FF8A7B7F85B754087A8B42893EDAB941BA657FE2DDED`。

应用内保存的是人工整理摘要、短摘录、定位、链接及版本哈希。该哈希证明快照一致，不证明法律有效或专业确认。完整PDF哈希与摘要哈希用途不同。

## 知识维护流程

已支持结构化JSON知识包和数据库中的不可覆盖版本。维护顺序为：报告提出建议 → 人工核实 → 导出当前版本 → 修改副本 → 验证 → 发布新编号 → 重启并重新预审。涉及新规则种类、产品或辖区的变化仍须开发引擎，不能仅修改参数扩展范围。

维护工具共享数据库进程锁。导出、核实及发布前先停止应用；`validate`只读文件，可独立运行。默认使用data目录；维护其他实例时必须指定相同DATA_DIR。先运行`npm run backup`保存备份。

```powershell
npm run knowledge -- export --file tmp/current-knowledge.json
Copy-Item tmp/current-knowledge.json tmp/next-knowledge.json
# 编辑next-knowledge.json：新id、核实的来源、参数、引用、核实记录及模拟案例
npm run knowledge -- validate --file tmp/next-knowledge.json
npm run knowledge -- verify-change --id 建议ID --actor 核实人 --evidence "原文定位、核实结论及凭据"
npm run knowledge -- publish --file tmp/next-knowledge.json --expected-release MC-ADU-2026.11.15-r1 --actor 发布人 --evidence "本次发布依据" --change 建议ID
npm start
```

`--expected-release`应填写导出时的当前版本；`--change`可省略，用于没有原建议的维护更新。导出不会覆盖已有文件。所有人名和凭据是维护记录，工具不验证操作者身份或专业资质。

知识包必须包含正常、冲突、缺失、范围外、人工审核和边界六类模拟案例。发布检查结构、官方来源地址、引用完整性、关键来源生效时间及复核窗口，并实际执行案例比较预期结果。验证失败、版本重复、当前版本已变化、关联建议未经核实均拒绝发布。版本、验证结果、指纹与发布记录保存到SQLite。

案例预期结果需要根据真实依据人工确认；自动验证只能检查内部一致性，不能证明法律准确性。`verification.level`表示整理者声明的核实层级，不能当作已验证的专业签名。不要为通过检查伪造核实日期或改变案例预期。

新报告使用当前版本并保存参数与来源快照。发布后旧报告提示复核，旧输入、结论、来源和意见保持原样；须发起一次新的预审才能使用新版本。发布不会自动解除此前的规则集停用；核实后可在原界面单独启用。资料复核窗口最多30天，超期不会继续自动判断。原始PDF及新获取的原文凭据仍需单独归档。
