/* ============================================================
 * 页面：AI辅助分析（智能问答） / 基础配置（本地配置）
 * AI 仅基于现有模拟数据作答；无数据则说明无法判断；
 * 不将关联当因果，不提供控制/审批/外部操作。
 * ============================================================ */
(function () {
  'use strict';
  const D = window.DB, P = window.Pages, U = window.UI;
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const sum = a => a.reduce((x, y) => x + y, 0);
  const catName = k => (D.costCats.find(c => c.key === k) || {}).name || k;

  /* ================= 8.17 AI辅助分析 ================= */
  const PRESETS = [
    { q: '当前有哪些隧道设备离线？', tag: '离线排查' },
    { q: '摄像机集体离线可能是什么原因？', tag: '诊断关联' },
    { q: '本月维修费用为什么偏高？', tag: '成本归因' },
    { q: '风机运行还有多少优化空间？', tag: '节能评估' }
  ];
  function offlineAnswer() {
    const off = D.devices.filter(d => d.status === 'offline');
    const byCat = {};
    off.forEach(d => { byCat[d.cat] = (byCat[d.cat] || 0) + 1; });
    const hero = off.filter(d => /^CAM-0[1-4]$/.test(d.code));
    return {
      summary: `当前模拟台账中有 <b>${off.length}</b> 台设备离线。青岭隧道北洞事件 EV-1123-01 涉及四路摄像机，目前仍有 <b>${hero.length}</b> 路离线，事件状态为${D.events.find(e => e.id === 'EV-1123-01').status}。`,
      data: Object.keys(byCat).map(c => ({ label: D.CATS[c].name + '离线', value: byCat[c] + ' 台' })).concat([{ label: '离线占比', value: (off.length / D.devices.length * 100).toFixed(1) + '%' }]),
      basis: [
        `设备台账状态统计：在线 ${D.stats().online} / 异常 ${D.stats().warn} / 离线 ${off.length}。`,
        `集体离线设备：${hero.map(d => d.code + '（' + d.place + '）').join('、') || '无'}。`,
        `青岭北洞事发时的四路摄像机共用接入交换机 SW-12 与机柜 CAB-03。`
      ],
      limits: ['离线状态来自数据快照，非真实设备实时状态。', '空间集中仅为关联线索，根因需结合拓扑与现场确认。'],
      links: [{ label: '摄像机离线场景', page: 'scene-camera', params: { id: 'EV-1123-01' } }, { label: '设备关系拓扑', page: 'topology' }, { label: '设备监测·离线', page: 'devices', params: { status: 'offline' } }],
      refs: hero.map(d => d.code).concat(['SW-12', 'FIBER-07'])
    };
  }
  function cameraAnswer() {
    const ev = D.events.find(e => e.id === 'EV-1123-01');
    return {
      summary: `4 台摄像机（CAM-01~04）于 ${D.fmtTime(ev.time, 'full')} 集体离线。事发时的首要排查对象为 SW-12 上联光链路 FIBER-07（关联评分 86）。当前状态为<b>${ev.status}</b>。${ev.recoverySummary || '等待现场核查。'}`,
      data: [{ label: '影响设备', value: ev.affected.length + ' 台' }, { label: '最高候选评分', value: '86（关联评分）' }, { label: '故障源候选', value: '4 项' }, { label: '事件状态', value: ev.status }],
      basis: [
        `事发时拓扑记录为 CAM-01~04 经 SW-12 的 1 至 4 号端口上联 FIBER-07，当时端口与上联链路均报告中断。`,
        `时间对齐：4 台摄像机离线时刻高度一致，且与 SW-12 上联光功率下降同步。`,
        `供电核查：CAB-03 输出电压/电流在离线时段无同步异常（模拟数据），故供电候选评分较低。`,
        `光功率：FIBER-07 接收光功率较基线下降，误码率上升（DS-02 通信网管）。`
      ],
      limits: ['评分为“关联评分”，非真实故障概率。', '结论为“可能原因/建议优先检查”，未确认故障；需现场核查光链路后确认。', '关联不等于因果，供电正常不排除其他并发因素。'],
      links: [{ label: '摄像机离线诊断', page: 'scene-camera', params: { id: 'EV-1123-01' } }, { label: '查看拓扑', page: 'topology' }, { label: 'FIBER-07 档案', code: 'FIBER-07' }],
      refs: ['CAM-01', 'SW-12', 'FIBER-07', 'OTN-02', 'CAB-03']
    };
  }
  function costAnswer() {
    const cur = D.costMonthly[D.costMonthly.length - 1];
    const repair = +(cur.parts + cur.service + cur.field + cur.emergency).toFixed(1);
    const total = +sum(D.costCats.map(c => cur[c.key])).toFixed(1);
    const top = D.deviceCostRank.slice().sort((a, b) => b.total - a.total).slice(0, 3);
    const repeat = D.deviceCostRank.filter(d => /重复|多次|3次|2次/.test(d.note));
    return {
      summary: `${cur.month} 运维总成本 <b>${total} 万元</b>，其中维修相关（备件+服务+现场+应急）<b>${repair} 万元</b>。偏高主因是 <b>${top[0].name}</b> 等设备的重复维修与应急支出，而非单一偶发故障。`,
      data: [{ label: '当月总成本', value: total + ' 万' }, { label: '维修相关', value: repair + ' 万' }, { label: '应急支出', value: cur.emergency + ' 万' }, { label: '重复维修设备', value: repeat.length + ' 台' }],
      basis: [
        `高成本设备：${top.map(d => d.name + ' ' + d.total + '万（' + d.note + '）').join('；')}。`,
        `重复维修预警：${repeat.map(d => d.name + '—' + d.note).join('；')}。`,
        `成本结构：能源 ${cur.energy} / 备件 ${cur.parts} / 服务 ${cur.service} / 现场 ${cur.field} / 应急 ${cur.emergency}（万元，示例测算）。`,
        `BAT-01 近12月单体更换3次，持续维修经济性差，建议纳入更新决策评估。`
      ],
      limits: ['成本为统计口径示例测算，非真实财务数据。', '“偏高”为相对基线的归因分析，含模型假设。', '更新建议需结合核对性测试与现场核查，不构成采购/审批依据。'],
      links: [{ label: '成本分析', page: 'cost' }, { label: 'UPS更新决策', page: 'ups' }, { label: '重点设备·BAT-01', page: 'keydev', params: { focus: 'BAT-01' } }],
      refs: top.map(d => d.code)
    };
  }
  function fanAnswer() {
    const fans = ['JF-01', 'JF-02', 'JF-03', 'JF-04'].map(c => D.byCode[c]).filter(Boolean);
    const rated = fans[0] ? fans[0].ratedPower : 30;
    return {
      summary: `青岭隧道射流风机 JF-01~04（单台额定 ${rated}kW）。在正常模拟工况下，按 CO/VI 与交通量联动，<b>模拟策略评估</b>建议运行台数可由当前 4 台优化至 2~3 台，节能率为模拟工况估算（约 20%~40%），非固定承诺。`,
      data: [{ label: '风机数量', value: fans.length + ' 台' }, { label: '单台额定', value: rated + ' kW' }, { label: '建议运行', value: '2~3 台（视工况）' }, { label: '节能率', value: '模拟估算 20%~40%' }],
      basis: [
        `控制逻辑：CO≥25ppm 或 VI≥35% 时全开；CO≤10 且 VI≤15 时可降至2台（模拟阈值）。`,
        `工况影响： dawn/夜间交通量低，CO/VI 基线低，优化空间大；拥堵/应急工况按预案执行，不参与节能优化。`,
        `能耗按交通量、运行时长归一化，剔除交通/天气/季节影响后对比。`,
        `安全约束：保留备用风机、最小通风量、消防联动优先等6项约束。`
      ],
      limits: ['节能率为模拟工况估算，非真实节能承诺。', '本页为模拟策略评估，不提供风机启停/下发控制按钮。', '应急工况由原控制系统按预案执行，AI不建议干预。'],
      links: [{ label: '风机优化策略', page: 'fan' }, { label: '成效评价·能耗', page: 'kpi' }],
      refs: fans.map(f => f.code)
    };
  }
  function deviceAnswer(code) {
    const d = D.byCode[code];
    if (!d) return null;
    const al = (d.alarms || []).filter(a => D.NOW - a.start < 30 * 86400000);
    const active = al.filter(a => a.status === 'active');
    return {
      summary: al.length
        ? `设备 <b>${code}（${d.name}）</b> 近30天模拟数据中记录 <b>${al.length}</b> 条异常，其中未解除 <b>${active.length}</b> 条。当前状态：${D.STATUS[d.status].name}。`
        : `设备 <b>${code}（${d.name}）</b> 近30天模拟数据中<b>未记录异常</b>，当前状态：${D.STATUS[d.status].name}。数据不足以支持进一步故障判断。`,
      data: [{ label: '设备状态', value: D.STATUS[d.status].name }, { label: '近30天异常', value: al.length + ' 条' }, { label: '未解除', value: active.length + ' 条' }, { label: '重要性', value: d.importance }],
      basis: al.length
        ? al.slice(0, 6).map(a => `${D.fmtTime(a.start, 'md')} ${D.LEVELS[a.level] || a.level}：${a.desc}（${a.status === 'active' ? '未解除' : '已恢复'}）`)
        : ['台账与告警库近30天无该设备异常记录。', '无异常不代表无隐患，建议结合参数趋势与现场巡检。'],
      limits: ['异常记录来自模拟数据，非真实设备历史。', '无数据时不做推断；状态判断仅基于现有数据快照。'],
      links: [{ label: '设备档案', code }, { label: '重点设备分析', page: 'keydev', params: { focus: code } }, { label: '孪生定位', page: 'gis', params: { focus: code } }],
      refs: [code]
    };
  }
  function eventAnswer(id) {
    const e = D.events.find(x => x.id === id);
    if (!e) return null;
    return {
      summary: `诊断事件 <b>${e.id}（${e.name}）</b>，级别 ${e.level}，状态 ${e.status}，影响 ${e.affected.length} 台设备。${e.summary || ''}`,
      data: [{ label: '事件级别', value: e.level }, { label: '影响设备', value: e.affected.length + ' 台' }, { label: '关联评分', value: e.score != null ? e.score + '' : '—' }, { label: '状态', value: e.status }],
      basis: [`候选故障源：${e.candidate || '见诊断页'}。`, `发生位置：${e.place}（${e.km}）。`, `关联设备：${e.related.slice(0, 6).join('、')}。`],
      limits: ['事件与评分为模拟数据，关联非确认因果。', '处置结论以诊断页与现场确认为准。'],
      links: [{ label: '查看诊断详情', page: e.page, params: { id: e.id } }],
      refs: e.affected.slice(0, 4).concat(e.related.slice(0, 3))
    };
  }
  /* ---------- 页面上下文问答（全局小机器人复用） ---------- */
  const A = (summary, data, basis, limits, links, refs) => ({ summary, data, basis, limits, links, refs });
  const LIM = ['以上为内置模拟数据分析，非真实系统结论。', '关联不等于因果；结论需现场核查确认。'];
  function dashboardAnswer() {
    const s = D.stats();
    const major = D.events.filter(D.isOpenMajor).length;
    const cm = D.costMonthly[D.costMonthly.length - 1];
    return A(`当前运行态势：纳管 <b>${s.total.toLocaleString()}</b> 台设备，在线 <b>${s.online.toLocaleString()}</b> 台（在线率 ${s.onlineRate.toFixed(2)}%），异常 ${s.warn} 台、离线 ${s.offline} 台；近24小时告警 <b>${D.recentAlarms.length}</b> 条，未解除严重事件 <b>${major}</b> 起。本月运维成本示例测算 <b>${(cm.energy + cm.parts + cm.service + cm.field + cm.emergency).toFixed(1)} 万元</b>。`,
      [{ label: '在线率', value: s.onlineRate.toFixed(2) + '%' }, { label: '异常/离线', value: s.warn + ' / ' + s.offline }, { label: '近24小时告警', value: D.recentAlarms.length + ' 条' }, { label: '未解除严重', value: major + ' 起' }],
      ['设备状态为数据快照统计（在线 ' + s.online + ' / 异常 ' + s.warn + ' / 离线 ' + s.offline + '）。', '未解除严重事件按当前现场核验结果统计。', '成本为统计口径示例测算，能源费用占比最高。'],
      LIM.concat(['态势数据不连接真实设备与业主系统。']),
      [{ label: '设备监测', page: 'devices' }, { label: '诊断中心', page: 'diagnosis' }, { label: '成本分析', page: 'cost' }], []);
  }
  function gisAnswer() {
    return A(`数字孪生一张图提供四级视角：<b>宏观路网</b>（全线 58km、${D.TUNNELS.length} 座隧道、${D.TOLLS.length} 处收费站、${D.ROOMS.length} 处机房）→ <b>重点路段</b>（情报板/摄像机/车流光轨）→ <b>隧道洞内</b>（射流风机/照明分区/CO·VI）→ <b>机房</b>（机柜/UPS/精密空调/动环）。点击宏观热区即可下钻，控制台可调节昼夜/车流/图层与机房模拟参数（仅评估、不下发）。`,
      [{ label: '隧道', value: D.TUNNELS.length + ' 座' }, { label: '收费站', value: D.TOLLS.length + ' 处' }, { label: '机房', value: D.ROOMS.length + ' 处' }, { label: '孪生视角', value: '4 级' }],
      ['宏观路网热区：隧道/路段/机房均可点击下钻（交互）。', '隧道孪生映射 JF-01~04 风机与 Z-01~06 照明分区状态。', '机房孪生映射动环温度/UPS 负载/电池健康度，并给出预警推算。'],
      LIM.concat(['孪生场景为示意建模，非真实 BIM 竣工模型。']),
      [{ label: '进入数字孪生', page: 'gis' }, { label: '机房孪生', page: 'gis', params: { mode: 'room', scene: 'MR-01' } }], []);
  }
  function devicesAnswer() {
    const s = D.stats();
    const worst = Object.keys(D.CATS).map(c => ({ c, n: D.CATS[c].name, bad: D.catStats[c].warn + D.catStats[c].offline }))
      .sort((a, b) => b.bad - a.bad)[0];
    return A(`设备总体：在线 <b>${s.online.toLocaleString()}</b> / 异常 <b>${s.warn}</b> / 离线 <b>${s.offline}</b>，在线率 ${s.onlineRate.toFixed(2)}%。异常+离线最多的专业为 <b>${worst.n}</b>（${worst.bad} 台），主要为青岭隧道摄像机集体离线与 Z-03 照明分区异常。`,
      Object.keys(D.CATS).slice(0, 4).map(c => ({ label: D.CATS[c].name, value: D.catStats[c].total + ' 台 · 异常' + D.catStats[c].warn + '/离线' + D.catStats[c].offline })),
      Object.keys(D.CATS).map(c => `${D.CATS[c].name}：总 ${D.catStats[c].total} / 在线 ${D.catStats[c].online} / 异常 ${D.catStats[c].warn} / 离线 ${D.catStats[c].offline}。`),
      LIM, [{ label: '设备监测', page: 'devices' }, { label: '离线设备', page: 'devices', params: { status: 'offline' } }], []);
  }
  function sourcesAnswer() {
    const hits = D.qualityIssues.reduce((x, q) => x + q.hits, 0);
    const top = D.qualityIssues.slice().sort((a, b) => b.hits - a.hits)[0];
    return A(`共 <b>${D.sources.length}</b> 个数据源（模拟接入），字段映射 ${D.fieldMappings.length} 条；数据质量规则累计命中 <b>${hits}</b> 次，命中最多的是 <b>${top.rule}</b>（${top.hits} 次）。质量命中仅标记与提示治理，不代表真实系统故障。`,
      [{ label: '数据源', value: D.sources.length + ' 个' }, { label: '字段映射', value: D.fieldMappings.length + ' 条' }, { label: '质量命中', value: hits + ' 次' }, { label: '最高规则', value: top.rule }],
      D.sources.map(s => `${s.id} ${s.name}：${s.status}，${s.access}，时延 ${s.latency}s。`),
      LIM.concat(['接入状态为模拟，不连接真实厂家平台。']),
      [{ label: '数据接入', page: 'sources' }, { label: '质量规则配置', page: 'config' }], []);
  }
  function diagnosisAnswer() {
    const act = D.events.filter(e => !e.status.includes('已恢复'));
    const by = l => D.events.filter(e => e.level === l).length;
    return A(`诊断事件共 <b>${D.events.length}</b> 起，其中未恢复 <b>${act.length}</b> 起，未恢复重大事件 ${act.filter(D.isOpenMajor).length} 起。`,
      [{ label: '事件总数', value: D.events.length + ' 起' }, { label: '未恢复', value: act.length + ' 起' }, { label: '严重', value: by('严重') + ' 起' }, { label: '评分口径', value: '关联评分' }],
      act.slice(0, 5).map(e => `${e.id} ${e.name}：${e.status}，候选 ${e.candidate || '见诊断页'}。`),
      LIM.concat(['措辞规范：可能原因/故障源候选/建议优先检查。']),
      [{ label: '诊断中心', page: 'diagnosis' }, { label: '摄像机离线场景', page: 'scene-camera' }], act.slice(0, 3).map(e => e.id));
  }
  function lightingAnswer() {
    const ev = D.events.find(e => e.page === 'scene-lighting' && /Z-03|区域/.test(e.name)) || D.events.find(e => e.page === 'scene-lighting');
    return A(`Z-03 照明分区 <b>${ev ? ev.affected.length : 18}</b> 盏灯异常。判断树按“供电回路 → 控制链路 → 灯具本体”分层：回路电压/电流同步异常优先指向供电侧；控制指令无响应指向控制链路；单灯离散异常才考虑灯具本体。当前模拟数据支持<b>供电/控制侧共性因素</b>为优先检查方向，非已确认故障。`,
      [{ label: '异常灯具', value: (ev ? ev.affected.length : 18) + ' 盏' }, { label: '分区', value: 'Z-03' }, { label: '检查顺序', value: '供电→控制→灯具' }, { label: '事件状态', value: ev ? ev.status : '现场待确认' }],
      ['分层检查可减少盲目排查：先共性回路、再控制链路、最后单灯。', '事件 ' + (ev ? ev.id : '') + ' 状态为“' + (ev ? ev.status : '') + '”，需现场确认。'],
      LIM.concat(['判断树输出为建议优先检查顺序，非确认结论。']),
      [{ label: '照明异常场景', page: 'scene-lighting' }, { label: '照明调光优化', page: 'light' }], ev ? ev.affected.slice(0, 4) : []);
  }
  function lightAnswer() {
    return A(`隧道照明调光为<b>模拟策略评估</b>：以洞外亮度 L20 与交通量为输入，对入口/过渡/中间/出口分区给出亮度方案。模拟工况下模拟节能估算约 <b>20%~35%</b>（随洞外亮度与车流变化），非固定节能承诺；方案可保存为本地方案，不提供调光下发。`,
      [{ label: '调光分区', value: '6 区' }, { label: '输入', value: 'L20 + 交通量' }, { label: '节能估算', value: '模拟 20%~35%' }, { label: '下发能力', value: '无（仅评估）' }],
      ['洞外亮度越高，入口段加强照明需求越大，节能空间相应变化。', '夜间/低车流工况中间段可降档，保留安全最小亮度。', '节能率为模拟工况估算，剔除交通/天气影响后对比。'],
      LIM.concat(['本页不提供“立即下发调光”等真实控制操作。']),
      [{ label: '照明调光', page: 'light' }, { label: '成效评价', page: 'kpi' }], []);
  }
  function tasksAnswer() {
    const groups = {};
    D.tasks.forEach(t => { groups[t.group] = (groups[t.group] || 0) + 1; });
    return A(`当前 <b>${D.tasks.length}</b> 项现场任务、<b>${D.teams.length}</b> 支班组。按“同隧道/同专业 + 排班窗口”组合为 ${Object.keys(groups).length} 个作业组，可减少重复上路与趟次；组合前校验资质/仪器/作业窗口，不满足则提示拆组。里程与趟次对比为示例测算。`,
      [{ label: '任务', value: D.tasks.length + ' 项' }, { label: '班组', value: D.teams.length + ' 支' }, { label: '作业组', value: Object.keys(groups).length + ' 组' }, { label: '校验', value: '资质/仪器/窗口' }],
      D.tasks.slice(0, 5).map(t => `${t.id} ${t.type}（${t.tunnel}）：${t.window}，需 ${t.skill}。`),
      LIM.concat(['组合与里程对比为示例测算，非真实派工。']),
      [{ label: '任务统筹', page: 'tasks' }], []);
  }
  function upsAnswer() {
    const bad = D.cells.filter(c => c.capacity < 80).length;
    const avg = (D.cells.reduce((x, c) => x + c.capacity, 0) / D.cells.length).toFixed(1);
    return A(`UPS 蓄电池组共 <b>${D.cells.length}</b> 节单体，平均健康度 <b>${avg}%</b>，低于 80% 的 <b>${bad}</b> 节；BAT-01 近 12 月单体更换 3 次，重复维修经济性差。四方案全生命周期成本<b>示例测算</b>结合健康度离散度、重复维修与成本综合推荐，而非仅按使用年限；推荐结论需核对性测试与现场核查确认。`,
      [{ label: '单体数', value: D.cells.length + ' 节' }, { label: '平均健康度', value: avg + '%' }, { label: '健康度<80%', value: bad + ' 节' }, { label: '重复维修', value: 'BAT-01 · 3次/12月' }],
      ['健康度离散度大提示组内一致性差，整组更新经济性可能优于持续单体更换。', '四方案 LCC 含采购/施工/停机风险/残值假设（示例测算）。', '事件 EV-1121-03 记录电池健康度离散告警。'],
      LIM.concat(['不构成采购/审批依据；无真实下发操作。']),
      [{ label: 'UPS更新决策', page: 'ups' }, { label: '重点设备·BAT-01', page: 'keydev', params: { focus: 'BAT-01' } }], ['BAT-01', 'UPS-01']);
  }
  function kpiAnswer() {
    return A(`成效评价共 <b>${D.kpis.length}</b> 项指标（统计口径），覆盖诊断时效、排查效率、能耗、成本与作业统筹等。能耗类成效按交通量/运行时长/天气归一化后对比，节能率为<b>模拟工况估算</b>；所有指标标注统计口径，非真实考核数据。`,
      D.kpis.slice(0, 4).map(k => ({ label: k.name, value: k.current + (k.unit || '') })),
      D.kpis.slice(0, 6).map(k => `${k.name}：基线 ${k.baseline == null ? '—' : k.baseline} → 当前 ${k.current}${k.unit || ''}（${k.src}，统计口径）。`),
      LIM.concat(['成效为模拟估算与统计，非承诺值。']),
      [{ label: '成效评价', page: 'kpi' }], []);
  }
  function topoAnswer() {
    const rel = D.relations.filter(r => r.source === 'SW-12' || r.target === 'SW-12');
    return A(`设备关系拓扑共 <b>${D.relations.length}</b> 条关系。SW-12 下联 CAM-01 至 CAM-04，经 FIBER-07 上联 OTN-02。下方列出各链路当前状态。`,
      [{ label: '关系总数', value: D.relations.length + ' 条' }, { label: 'SW-12 关联', value: rel.length + ' 条' }, { label: '用途', value: '故障源候选线索' }],
      rel.slice(0, 6).map(r => `${r.source} → ${r.target}：${r.type}（${r.status}）。`),
      LIM, [{ label: '关系拓扑', page: 'topology' }, { label: '摄像机离线诊断', page: 'scene-camera' }], ['SW-12', 'FIBER-07']);
  }
  function roomAnswer() {
    const roomDevs = D.devices.filter(d => d.cat === 'room');
    const off = roomDevs.filter(d => d.status === 'offline').length;
    return A(`内场机房共 <b>${D.ROOMS.length}</b> 处、<b>${roomDevs.length}</b> 台设备，离线 ${off} 台。机房孪生实时映射动环温度/湿度、UPS 负载、电池健康度、PUE 与机柜负载；模拟调控（空调设定/负载/照明/气流/热力图）<b>仅评估、不下发</b>；预警预测含温度超阈时间、电池容量到期、滤网堵塞与 CPU 趋势推算。`,
      [{ label: '机房', value: D.ROOMS.length + ' 处' }, { label: '机房设备', value: roomDevs.length + ' 台' }, { label: '离线', value: off + ' 台' }, { label: '调控边界', value: '仅评估不下发' }],
      D.ROOMS.map(r => `${r.id} ${r.name}（${D.kmText(r.km)}）。`),
      LIM.concat(['映射指标为模拟遥测，非真实动环系统。']),
      [{ label: '机房孪生', page: 'gis', params: { mode: 'room', scene: 'MR-01' } }, { label: 'UPS更新决策', page: 'ups' }], ['UPS-01', 'BAT-01', 'ENV-01']);
  }
  function configAnswer() {
    return A(`基础配置含 <b>${D.configs.length}</b> 项配置（统一编码/类别字典/厂家映射/字段映射/关系/质量规则），字段映射 ${D.fieldMappings.length} 条、设备关系 ${D.relations.length} 条。编辑仅保存于浏览器 localStorage（本地），无审批流程，不影响真实系统；可一键恢复默认。`,
      [{ label: '配置项', value: D.configs.length + ' 项' }, { label: '字段映射', value: D.fieldMappings.length + ' 条' }, { label: '设备关系', value: D.relations.length + ' 条' }, { label: '存储', value: 'localStorage' }],
      D.configs.slice(0, 6).map(c => `${c.id} ${c.name}（${c.type}）。`),
      LIM.concat(['本地编辑，无审批、不影响真实系统。']),
      [{ label: '基础配置', page: 'config' }], []);
  }
  const PAGE_ANSWER = {
    dashboard: dashboardAnswer, gis: gisAnswer, devices: devicesAnswer, sources: sourcesAnswer,
    diagnosis: diagnosisAnswer, 'scene-camera': cameraAnswer, 'scene-lighting': lightingAnswer,
    keydev: costAnswer, topology: topoAnswer, fan: fanAnswer, light: lightAnswer, tasks: tasksAnswer,
    cost: costAnswer, ups: upsAnswer, kpi: kpiAnswer, config: configAnswer, ai: dashboardAnswer
  };
  const PAGE_PRESETS = {
    dashboard: ['当前整体运行态势如何？', '当前有哪些设备离线？', '摄像机集体离线可能是什么原因？', '本月维修费用为什么偏高？'],
    gis: ['数字孪生一张图可以看什么？', '机房动环与负载情况如何？', '风机运行还有多少优化空间？', '当前诊断事件总体情况？'],
    devices: ['当前设备在线率与状态分布？', '哪些设备离线？', '异常最多的专业是哪个？'],
    sources: ['数据源接入与质量情况如何？', '哪些质量规则命中最多？', '字段映射有多少条？'],
    diagnosis: ['当前诊断事件总体情况？', '摄像机集体离线可能是什么原因？', 'Z-03 照明异常的可能原因？'],
    'scene-camera': ['摄像机集体离线可能是什么原因？', 'SW-12 的上联关系是什么？', 'FIBER-07 近30天有哪些异常？'],
    'scene-lighting': ['Z-03 照明异常的可能原因？', '照明调光方案能节能多少？', '当前有哪些隧道设备离线？'],
    keydev: ['BAT-01 近30天有哪些异常？', 'UPS蓄电池更新如何决策？', '哪些设备重复维修最多？'],
    topology: ['设备关系拓扑能分析什么？', 'SW-12 的上联关系是什么？', '摄像机集体离线可能是什么原因？'],
    fan: ['风机运行还有多少优化空间？', '当前 CO/VI 工况下建议运行几台？', '节能率是承诺值吗？'],
    light: ['照明调光方案能节能多少？', '洞外亮度如何影响调光？', 'Z-03 照明异常的可能原因？'],
    tasks: ['现场任务如何组合更省？', '当前任务与班组情况？', '资质与仪器校验关注什么？'],
    cost: ['本月维修费用为什么偏高？', '哪些设备重复维修最多？', '能源费用占比多少？'],
    ups: ['UPS蓄电池更新如何决策？', 'BAT-01 近30天有哪些异常？', '电池健康度离散说明什么？'],
    kpi: ['成效评价指标有哪些？', '能耗成效如何归一化？', '风机运行还有多少优化空间？'],
    config: ['基础配置包含哪些内容？', '数据质量规则命中情况？', '字段映射有多少条？']
  };
  function presetsFor(page) {
    return PAGE_PRESETS[page] || PRESETS.map(p => p.q);
  }

  function answer(q, ctx) {
    const s = (q || '').trim();
    const codeM = s.match(/\b([A-Z]{2,4}-?\d{1,3}(?:-\d{1,2})?)\b/);
    const evM = s.match(/EV-\d{4}-\d{2}/);
    if (evM) { const a = eventAnswer(evM[0]); if (a) return a; }
    if (/上联|拓扑|上下游/.test(s)) return topoAnswer();
    if (codeM && D.byCode[codeM[1]]) return deviceAnswer(codeM[1]);
    if (/摄像机|摄像头|CAM|视频/.test(s) && /原因|为什么|离线|故障/.test(s)) return cameraAnswer();
    if (/离线|掉线|offline/.test(s)) return offlineAnswer();
    if (/调光|L20|洞外亮度/.test(s)) return lightAnswer();
    if (/照明|灯具|Z-03/.test(s)) return lightingAnswer();
    if (/费用|成本|维修|花钱|支出/.test(s)) return costAnswer();
    if (/UPS|蓄电池|电池|健康度/.test(s)) return upsAnswer();
    if (/成效|归一化|KPI/.test(s)) return kpiAnswer();
    if (/风机|节能|优化|通风|JF|工况|CO|VI/.test(s)) return fanAnswer();
    if (/摄像机|摄像头|CAM/.test(s)) return cameraAnswer();
    if (/任务|班组|统筹|资质|仪器/.test(s)) return tasksAnswer();
    if (/数据源|接入|质量|映射/.test(s)) return sourcesAnswer();
    if (/机房|动环|负载|PUE/.test(s)) return roomAnswer();
    if (/在线率|状态分布|专业/.test(s)) return devicesAnswer();
    if (/诊断事件|事件总体/.test(s)) return diagnosisAnswer();
    if (/一张图|孪生/.test(s)) return gisAnswer();
    if (/配置|编码/.test(s)) return configAnswer();
    if (/态势|总览/.test(s)) return dashboardAnswer();
    if (ctx && ctx.device && /异常|故障|近30天|历史/.test(s)) return deviceAnswer(ctx.device);
    if (ctx && ctx.page && PAGE_ANSWER[ctx.page]) return PAGE_ANSWER[ctx.page]();
    return {
      summary: '当前模拟数据未覆盖该问题，<b>无法给出判断</b>。可尝试下方预设问题，或输入设备编码（如 CAM-01、BAT-01、JF-01）/ 事件编号（如 EV-1123-01）查询。',
      data: [], basis: ['AI 仅基于本原型内置模拟数据作答，不联网、不接入真实系统。', '未匹配到相关数据时不做推断或编造。'],
      limits: ['不提供设备控制、审批或外部操作。', '无数据即说明无法判断，不将关联当因果。'],
      links: [], refs: []
    };
  }

  P.ai = {
    title: 'AI辅助分析 · 智能问答', group: 'AI辅助分析', crumb: true,
    render(el, params) {
      const ctx = { device: params.device || params.focus || null, event: params.id || null };
      let messages = [];
      let lastRefs = [];
      const initialQ = params.q || (ctx.device ? '这台设备近30天有哪些异常？' : null);
      el.innerHTML = U.pageHead('AI辅助分析 · 运维数据问答',
        '基于本原型内置模拟数据的辅助分析问答。回答含结论摘要、关键数据、分析依据、限制条件与跳转链接；仅就现有数据作答，无数据则说明无法判断，不将关联当因果，不提供控制/审批/外部操作。',
        `<button class="btn" id="ai-reset">${U.icon('reset', 14)} 重置对话</button>
         <button class="btn" id="ai-limit">${U.icon('warn', 14)} 使用限制说明</button>`, U.demoBadge('模拟数据')) +
        `<div class="flex">
          <div class="grow">
            <div class="card" style="display:flex;flex-direction:column;height:660px">
              <div class="card-h"><span class="card-t">分析对话</span><span class="sub">仅基于模拟数据</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="ai-thread" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:14px"></div>
              <div style="border-top:1px solid var(--line);padding:10px 14px">
                <div class="chip-row mb" id="ai-presets">${PRESETS.map((p, i) => `<span class="ref-chip" data-preset="${i}" style="cursor:pointer">${p.q}</span>`).join('')}</div>
                <div class="flex" style="gap:8px">
                  <input class="inp" id="ai-input" style="flex:1" placeholder="输入问题，或设备编码（CAM-01）/事件编号（EV-1123-01）…" autocomplete="off">
                  <button class="btn primary" id="ai-send">${U.icon('ai', 15)} 分析</button>
                </div>
              </div>
            </div>
          </div>
          <div style="width:320px;flex:0 0 320px">
            <div class="card"><div class="card-h"><span class="card-t">引用数据</span><span class="sub">点击跳转</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="ai-refs"><div class="empty small">提问后展示引用的设备/事件</div></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">当前上下文</span></div>
              <div class="card-b" id="ai-ctx"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">使用边界</span></div>
              <div class="card-b"><div class="note-box gray" style="margin:0">
                <div class="small" style="line-height:1.8">${window.PersonalQwen ? '· 千问云端分析相关演示数据' : '· 仅基于内置模拟数据，不联网'}<br>· 无数据 → 说明无法判断<br>· 关联 ≠ 因果，评分为关联评分<br>· 不提供控制/审批/外部操作<br>· 结论需现场核查确认</div>
              </div></div></div>
          </div>
        </div>`;
      const thread = el.querySelector('#ai-thread');
      function drawCtx() {
        const c = el.querySelector('#ai-ctx');
        if (ctx.device && D.byCode[ctx.device]) {
          const d = D.byCode[ctx.device];
          c.innerHTML = `<div class="flex ai-center mb">${U.statusTag(d.status)} <b>${d.code}</b></div><div class="small muted mb">${d.name} · ${d.place}</div>
            <button class="btn sm" onclick="UI.openDevice('${d.code}')">${U.icon('dev', 13)} 设备档案</button>
            <button class="btn sm" onclick="UI.go('keydev',{focus:'${d.code}'})">${U.icon('diag', 13)} 重点分析</button>`;
        } else if (ctx.event) {
          const e = D.events.find(x => x.id === ctx.event);
          c.innerHTML = e ? `<div class="flex ai-center mb">${U.levelTag(e.level)} <b>${e.id}</b></div><div class="small muted mb">${e.name}</div><button class="btn sm" onclick="UI.go('${e.page}',{id:'${e.id}'})">${U.icon('diag', 13)} 诊断详情</button>` : '<div class="empty small">无上下文</div>';
        } else c.innerHTML = '<div class="empty small">从设备/事件页跳转可携带上下文</div>';
      }
      function drawRefs(refs) {
        lastRefs = refs || [];
        const box = el.querySelector('#ai-refs');
        if (!lastRefs.length) { box.innerHTML = '<div class="empty small">本次回答未引用具体设备/事件</div>'; return; }
        const uniq = [...new Set(lastRefs)];
        box.innerHTML = uniq.map(code => {
          const d = D.byCode[code];
          const ev = D.events.find(e => e.id === code);
          if (ev) return `<div class="evi" style="cursor:pointer;padding:7px 10px" onclick="UI.go('${ev.page}',{id:'${ev.id}'})"><div class="evi-t small">${U.levelTag(ev.level)} ${ev.id}</div><div class="src">${ev.name} ›</div></div>`;
          if (d) return `<div class="evi" style="cursor:pointer;padding:7px 10px" onclick="UI.openDevice('${code}')"><div class="evi-t small">${U.statusTag(d.status)} <span class="mono">${code}</span></div><div class="src">${d.name} · ${d.place} ›</div></div>`;
          return `<div class="evi" style="padding:7px 10px"><div class="evi-t small mono">${code}</div><div class="src muted">关联节点</div></div>`;
        }).join('');
      }
      function userMsg(text) {
        const div = document.createElement('div');
        div.style.cssText = 'align-self:flex-end;max-width:78%;background:var(--navy-800);color:#eaf2fb;padding:9px 13px;border-radius:10px 10px 2px 10px;font-size:13px;line-height:1.6';
        div.textContent = text;
        thread.appendChild(div);
      }
      function aiMsg(a, q) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'align-self:flex-start;max-width:92%;width:92%';
        const links = a.links.map(l => l.code
          ? `<button class="btn sm" onclick="UI.openDevice('${l.code}')">${U.icon('dev', 12)} ${l.label}</button>`
          : `<button class="btn sm" onclick="UI.go('${l.page}'${l.params ? ',' + JSON.stringify(l.params).replace(/"/g, '&quot;') : ''})">${U.icon('link', 12)} ${l.label}</button>`).join('');
        wrap.innerHTML = `<div class="card" style="margin:0;border-color:#cfe0f5">
          <div class="card-h" style="background:#f0f6ff"><span class="card-t" style="font-size:12.5px">${U.icon('ai', 14)} 分析结论</span><span class="spacer"></span>${U.demoBadge('模拟数据')}</div>
          <div class="card-b">
            <p style="font-size:13px;line-height:1.8;color:var(--text);margin:0 0 10px">${a.summary}</p>
            ${a.data.length ? `<div class="grid g-4 mb" style="gap:7px">${a.data.map(x => `<div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">${x.label}</div><div class="v" style="font-size:15px;color:var(--navy-800)">${x.value}</div></div>`).join('')}</div>` : ''}
            <div class="sec-t" style="cursor:pointer" data-toggle>分析依据 <span class="muted small">（点击展开/收起）</span></div>
            <div data-basis style="display:none">${a.basis.map(b => `<div class="evi" style="padding:6px 10px"><div class="evi-d small" style="margin:0">${b}</div></div>`).join('')}</div>
            <div class="sec-t">限制条件</div>
            <div class="note-box gray" style="margin:0 0 10px"><div class="small" style="line-height:1.75">${a.limits.map(l => '· ' + l).join('<br>')}</div></div>
            ${links ? `<div class="flex" style="gap:7px;flex-wrap:wrap">${links}</div>` : ''}
          </div></div>`;
        thread.appendChild(wrap);
        wrap.querySelector('[data-toggle]').addEventListener('click', () => {
          const b = wrap.querySelector('[data-basis]');
          b.style.display = b.style.display === 'none' ? 'block' : 'none';
        });
        drawRefs(a.refs);
        thread.scrollTop = thread.scrollHeight;
      }
      function ask(q) {
        if (!q || !q.trim() || window.PersonalQwen?.busy(thread)) return;
        userMsg(q);
        if (window.PersonalQwen) PersonalQwen.answer(q, ctx, thread, el.querySelector('#ai-send'), drawRefs);
        else aiMsg(answer(q, ctx), q);
        el.querySelector('#ai-input').value = '';
      }
      function welcome() {
        if (window.PersonalQwen) {
          PersonalQwen.reset(thread, el.querySelector('#ai-send'));
          thread.innerHTML = '<div class="note-box blue"><b>千问运维助手</b><p>提问和相关演示数据将发送至阿里云。可以查询设备、事件和现场任务。</p></div>';
          drawRefs([]);
          return;
        }
        thread.innerHTML = '';
        const w = document.createElement('div');
        w.style.cssText = 'align-self:flex-start;max-width:92%';
        w.innerHTML = `<div class="note-box blue" style="margin:0"><b>${U.icon('ai', 14)} 运维分析助手</b><div class="small mt" style="line-height:1.8">我可以基于本原型的模拟数据回答离线排查、诊断关联、成本归因、节能评估等问题，也可查询指定设备/事件。请选择下方预设问题，或直接输入。<br><span class="muted">所有回答均为模拟数据分析，非真实系统结论。</span></div></div>`;
        thread.appendChild(w);
        drawRefs([]);
      }
      welcome(); drawCtx();
      el.querySelectorAll('[data-preset]').forEach(x => x.addEventListener('click', () => ask(PRESETS[+x.dataset.preset].q)));
      el.querySelector('#ai-send').addEventListener('click', () => ask(el.querySelector('#ai-input').value));
      el.querySelector('#ai-input').addEventListener('keydown', ev => { if (ev.key === 'Enter') ask(ev.target.value); });
      el.querySelector('#ai-reset').addEventListener('click', () => { welcome(); U.toast('对话已重置', 'ok'); });
      el.querySelector('#ai-limit').addEventListener('click', () => {
        U.modal('AI辅助分析 · 使用限制说明', `
          <div class="note-box blue mb">${window.PersonalQwen ? '本机通过千问个人会话分析平台演示数据。' : '本功能为辅助分析问答，仅基于内置模拟数据，不接入真实系统、不联网。'}</div>
          <div class="kv"><span class="k">数据范围</span><span class="v">设备台账/告警/诊断事件/成本/任务/成效等模拟数据</span>
          <span class="k">作答原则</span><span class="v">仅就现有数据作答；无数据则说明无法判断，不编造</span>
          <span class="k">因果边界</span><span class="v">关联不等于因果；评分为“关联评分”，非真实概率</span>
          <span class="k">措辞规范</span><span class="v">可能原因/故障源候选/建议优先检查；非“已确认故障”</span>
          <span class="k">操作边界</span><span class="v">不提供设备控制、审批、下发或任何外部操作</span>
          <span class="k">结论效力</span><span class="v">模拟分析，需现场核查确认，不构成处置/采购依据</span></div>`,
          `<button class="btn" onclick="UI.closeModal()">关闭</button>`);
      });
      if (initialQ) setTimeout(() => ask(initialQ), 60);
    }
  };

  window.AIEngine = { answer, presetsFor };

  /* ================= 8.18 基础配置 ================= */
  const LS_KEY = 'demo-cfg-edits';
  function loadEdits() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveEdits(o) { localStorage.setItem(LS_KEY, JSON.stringify(o)); }
  P.config = {
    title: '基础配置 · 本地配置', group: '基础配置', crumb: true,
    render(el, params) {
      let edits = loadEdits();
      edits.mappings = edits.mappings || D.fieldMappings.map(m => Object.assign({}, m));
      edits.relations = edits.relations || D.relations.slice(0, 12).map(r => Object.assign({}, r));
      edits.cfgMeta = edits.cfgMeta || {};
      edits.extraCfg = edits.extraCfg || [];
      let tab = params.tab || 'all';
      const types = ['all'].concat([...new Set(D.configs.map(c => c.type))]);
      const typeName = t => t === 'all' ? '全部配置' : t;
      function cfgList() {
        const base = D.configs.map(c => Object.assign({}, c, edits.cfgMeta[c.id] || {}));
        return base.concat(edits.extraCfg);
      }
      function filtered() { return tab === 'all' ? cfgList() : cfgList().filter(c => c.type === tab); }
      el.innerHTML = U.pageHead('基础配置 · 编码/映射/关系/质量规则',
        '管理统一设备编码、类别字典、厂家编码映射、数据源字段映射、设备关系与数据质量规则。本页为本地配置，编辑仅保存于浏览器本地（localStorage），无审批流程，不影响真实系统。',
        `<button class="btn" id="cfg-add">${U.icon('cfg', 14)} 新增配置项</button>
         <button class="btn" id="cfg-reset">${U.icon('reset', 14)} 恢复默认配置</button>`, U.demoBadge('模拟数据')) +
        `<div class="card mb"><div class="card-b">
          <div class="filter-bar" style="margin:0">
            <span class="fld" style="font-weight:600;color:var(--navy-800)">配置类别</span>
            <span class="pills" id="cfg-tabs">${types.map(t => `<span class="pill ${t === tab ? 'on' : ''}" data-v="${t}">${typeName(t)}</span>`).join('')}</span>
            <span class="spacer" style="flex:1"></span>
            <span class="tag info" id="cfg-count"></span>
          </div>
        </div></div>
        <div class="flex">
          <div class="grow">
            <div class="card"><div class="card-h"><span class="card-t">配置项列表</span><span class="sub">点击查看详情/编辑</span><span class="spacer"></span>${U.demoBadge('本地')}</div>
              <div class="card-b tight" id="cfg-table"></div></div>
            <div class="grid g-2 mt">
              <div class="card"><div class="card-h"><span class="card-t">字段映射规则</span><span class="sub">可编辑</span><span class="spacer"></span><button class="btn sm" id="cfg-add-map">${U.icon('cfg', 12)} 新增映射</button></div>
                <div class="card-b tight" id="cfg-map"></div></div>
              <div class="card"><div class="card-h"><span class="card-t">数据质量规则命中</span><span class="spacer"></span>${U.demoBadge()}</div>
                <div class="card-b tight" id="cfg-quality"></div></div>
            </div>
          </div>
          <div style="width:300px;flex:0 0 300px">
            <div class="card"><div class="card-h"><span class="card-t">设备关系（节选）</span><span class="sub">可编辑</span><span class="spacer"></span><button class="btn sm" id="cfg-add-rel">${U.icon('topo', 12)} 新增关系</button></div>
              <div class="card-b tight" id="cfg-rel"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">本地编辑状态</span></div>
              <div class="card-b" id="cfg-state"></div></div>
          </div>
        </div>`;
      function drawTable() {
        const rows = filtered();
        el.querySelector('#cfg-count').textContent = rows.length + ' 项';
        U.table(el.querySelector('#cfg-table'), {
          rows, pageSize: 10, sortKey: 'id', sortDir: 1,
          cols: [
            { key: 'id', title: '编号', sortable: true, render: c => `<span class="code">${c.id}</span>` },
            { key: 'name', title: '名称', sortable: true, render: c => `<b>${c.name}</b>${edits.cfgMeta[c.id] ? ' <span class="tag warn">已编辑</span>' : ''}` },
            { key: 'type', title: '类型', sortable: true, render: c => `<span class="tag info">${c.type}</span>` },
            { key: 'cat', title: '专业', sortable: true },
            { key: 'updated', title: '更新时间', sortable: true },
            { key: 'status', title: '状态', render: c => `<span class="tag ${c.status === '启用' ? 'ok' : 'plain'}">${c.status}</span>` },
            { key: 'affected', title: '影响设备', sortable: true, cls: 'num', render: c => c.affected }
          ], onRow: c => openCfg(c)
        });
      }
      function drawMap() {
        U.table(el.querySelector('#cfg-map'), {
          rows: edits.mappings, pageSize: 8,
          cols: [
            { key: 'src', title: '源字段', render: m => `<span class="mono small">${m.src}</span>` },
            { key: 'dst', title: '目标字段', render: m => `<span class="mono small">${m.dst}</span>` },
            { key: 'rule', title: '规则', render: m => `<span class="small">${m.rule}</span>` },
            { key: 'source', title: '数据源', render: m => `<span class="tag plain">${m.source}</span>` },
            { key: 'op', title: '操作', width: '60px', render: (m, i) => `<button class="btn sm" data-edit-map="${i}">编辑</button>` }
          ]
        });
        el.querySelectorAll('[data-edit-map]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); editMap(+b.dataset.editMap); }));
      }
      function drawQuality() {
        U.table(el.querySelector('#cfg-quality'), {
          rows: D.qualityIssues, pageSize: 6, sortKey: 'hits', sortDir: -1,
          cols: [
            { key: 'rule', title: '质量规则', render: q => `<b>${q.rule}</b>` },
            { key: 'hits', title: '命中', sortable: true, cls: 'num', render: q => `<span style="color:${q.hits > 10 ? '#b91c1c' : q.hits > 3 ? '#b45309' : '#15803d'};font-weight:600">${q.hits}</span>` },
            { key: 'source', title: '数据源', render: q => `<span class="tag plain">${q.source}</span>` },
            { key: 'detail', title: '说明', render: q => `<span class="small muted">${q.detail}</span>` }
          ], onRow: q => U.openDrawer('质量规则 · ' + q.rule, `<div class="flex ai-center mb">${U.demoBadge()} <b>${q.rule}</b> <span class="tag warn">命中 ${q.hits}</span></div>
            <div class="kv"><span class="k">数据源</span><span class="v">${q.source}（${(D.sources.find(s => s.id === q.source) || {}).name || ''}）</span>
            <span class="k">最近命中</span><span class="v">${D.fmtTime(q.last, 'full')}</span>
            <span class="k">处理说明</span><span class="v">${q.detail}</span></div>
            <div class="note-box mt">质量规则用于标记异常数据并提示治理，命中数为统计。规则集见 CFG-06。</div>`, true)
        });
      }
      function drawRel() {
        U.table(el.querySelector('#cfg-rel'), {
          rows: edits.relations, pageSize: 16,
          cols: [
            { key: 'source', title: '源', render: r => `<span class="mono small">${r.source}</span>` },
            { key: 'target', title: '目标', render: r => `<span class="mono small">${r.target}</span>` },
            { key: 'type', title: '关系', render: r => `<span class="small">${r.type}</span>` },
            { key: 'op', title: '', width: '50px', render: (r, i) => `<button class="btn sm" data-edit-rel="${i}">编辑</button>` }
          ]
        });
        el.querySelectorAll('[data-edit-rel]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); editRel(+b.dataset.editRel); }));
      }
      function drawState() {
        const nMeta = Object.keys(edits.cfgMeta).length, nExtra = edits.extraCfg.length;
        const mapChanged = JSON.stringify(edits.mappings) !== JSON.stringify(D.fieldMappings);
        const relChanged = edits.relations.length !== 12;
        const dirty = nMeta || nExtra || mapChanged || relChanged;
        el.querySelector('#cfg-state').innerHTML = `
          <div class="kv"><span class="k">配置项编辑</span><span class="v">${nMeta} 项</span>
          <span class="k">新增配置项</span><span class="v">${nExtra} 项</span>
          <span class="k">字段映射</span><span class="v">${edits.mappings.length} 条${mapChanged ? '（已改）' : ''}</span>
          <span class="k">设备关系</span><span class="v">${edits.relations.length} 条${relChanged ? '（已改）' : ''}</span>
          <span class="k">存储位置</span><span class="v mono small">localStorage</span></div>
          <div class="note-box ${dirty ? 'blue' : 'gray'} mt">${dirty ? '存在本地编辑，仅保存于本浏览器，恢复默认可清除。' : '当前为默认配置，无本地编辑。'}</div>`;
      }
      function persist() { saveEdits(edits); drawState(); }
      function openCfg(c) {
        const isMap = c.type === '字段映射', isRel = c.type === '设备关系', isQ = c.type === '质量规则';
        U.openDrawer('配置详情 · ' + c.id, `
          <div class="flex ai-center mb"><span class="tag info">${c.type}</span> <b>${c.name}</b> ${U.demoBadge('本地')}</div>
          <div class="kv mb"><span class="k">编号</span><span class="v mono">${c.id}</span>
          <span class="k">专业</span><span class="v">${c.cat}</span>
          <span class="k">更新时间</span><span class="v">${c.updated}</span>
          <span class="k">影响设备</span><span class="v">${c.affected} 台</span>
          <span class="k">状态</span><span class="v"><span class="tag ${c.status === '启用' ? 'ok' : 'plain'}">${c.status}</span></span></div>
          <div class="sec-t">配置说明</div><p class="small" style="color:var(--text-2);line-height:1.75">${c.detail}</p>
          ${isMap ? '<div class="note-box blue mt">字段映射明细可在下方“字段映射规则”卡片逐条编辑/新增，保存于本地。</div>' : ''}
          ${isRel ? '<div class="note-box blue mt">设备关系可在右侧“设备关系（节选）”卡片编辑/新增；完整拓扑见设备关系拓扑页。</div>' : ''}
          ${isQ ? '<div class="note-box blue mt">质量规则命中见下方“数据质量规则命中”卡片。</div>' : ''}
          <div class="divider"></div>
          <div class="sec-t">编辑配置项（本地）</div>
          <div class="flex" style="gap:8px;flex-wrap:wrap">
            <label class="fld">名称 <input class="inp" id="cfg-name" value="${U.esc(c.name)}" style="width:200px"></label>
            <label class="fld">状态 <select class="sel" id="cfg-status"><option ${c.status === '启用' ? 'selected' : ''}>启用</option><option ${c.status === '停用' ? 'selected' : ''}>停用</option></select></label>
          </div>
          <div class="flex mt" style="gap:8px">
            <button class="btn primary" id="cfg-save">${U.icon('check', 13)} 保存（本地）</button>
            ${isRel ? `<button class="btn" onclick="UI.go('topology')">${U.icon('topo', 13)} 查看完整拓扑</button>` : ''}
            ${isMap ? `<button class="btn" onclick="UI.go('sources',{tab:'map'})">${U.icon('db', 13)} 数据接入·映射</button>` : ''}
          </div>
          <div class="note-box gray mt">编辑仅写入浏览器 localStorage，无审批流程，不影响真实系统；恢复默认可清除。</div>`, true);
        document.getElementById('cfg-save').addEventListener('click', () => {
          const nm = document.getElementById('cfg-name').value.trim();
          const st = document.getElementById('cfg-status').value;
          if (c.id.startsWith('CFG-') && D.configs.find(x => x.id === c.id)) {
            edits.cfgMeta[c.id] = { name: nm || c.name, status: st };
          } else {
            const ex = edits.extraCfg.find(x => x.id === c.id); if (ex) { ex.name = nm || ex.name; ex.status = st; }
          }
          persist(); drawTable(); U.closeDrawer(); U.toast('配置已保存（本地）', 'ok');
        });
      }
      function editMap(i) {
        const m = edits.mappings[i];
        U.modal('编辑字段映射', `
          <div class="note-box blue mb">本地编辑，保存于浏览器，无审批流程。</div>
          <div class="grid g-2">
            <label class="fld">源字段 <input class="inp" id="m-src" value="${U.esc(m.src)}"></label>
            <label class="fld">目标字段 <input class="inp" id="m-dst" value="${U.esc(m.dst)}"></label>
            <label class="fld">转换规则 <input class="inp" id="m-rule" value="${U.esc(m.rule)}"></label>
            <label class="fld">数据源 <select class="sel" id="m-source">${D.sources.map(s => `<option ${s.id === m.source ? 'selected' : ''}>${s.id}</option>`).join('')}</select></label>
          </div>`,
          `<button class="btn" onclick="UI.closeModal()">取消</button><button class="btn primary" id="m-save">${U.icon('check', 13)} 保存</button>`);
        document.getElementById('m-save').addEventListener('click', () => {
          edits.mappings[i] = { src: document.getElementById('m-src').value.trim() || m.src, dst: document.getElementById('m-dst').value.trim() || m.dst, rule: document.getElementById('m-rule').value.trim() || m.rule, source: document.getElementById('m-source').value };
          persist(); drawMap(); U.closeModal(); U.toast('字段映射已保存（本地）', 'ok');
        });
      }
      function editRel(i) {
        const r = edits.relations[i];
        const relTypes = ['网络上联', '光链路', '供电回路', '控制指令', '同机柜'];
        U.modal('编辑设备关系', `
          <div class="note-box blue mb">本地编辑，保存于浏览器；完整拓扑关系见拓扑页。</div>
          <div class="grid g-2">
            <label class="fld">源设备 <input class="inp" id="r-src" value="${U.esc(r.source)}"></label>
            <label class="fld">目标设备 <input class="inp" id="r-dst" value="${U.esc(r.target)}"></label>
            <label class="fld">关系类型 <select class="sel" id="r-type">${relTypes.map(t => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="fld">状态 <select class="sel" id="r-status"><option value="normal" ${r.status === 'normal' ? 'selected' : ''}>正常</option><option value="warn" ${r.status === 'warn' ? 'selected' : ''}>异常</option><option value="down" ${r.status === 'down' ? 'selected' : ''}>中断</option></select></label>
          </div>
          <label class="fld mt">备注 <input class="inp" id="r-note" value="${U.esc(r.note || '')}" style="width:100%"></label>`,
          `<button class="btn" onclick="UI.closeModal()">取消</button><button class="btn primary" id="r-save">${U.icon('check', 13)} 保存</button>`);
        document.getElementById('r-save').addEventListener('click', () => {
          edits.relations[i] = { source: document.getElementById('r-src').value.trim() || r.source, target: document.getElementById('r-dst').value.trim() || r.target, type: document.getElementById('r-type').value, status: document.getElementById('r-status').value, note: document.getElementById('r-note').value.trim() };
          persist(); drawRel(); U.closeModal(); U.toast('设备关系已保存（本地）', 'ok');
        });
      }
      function addMap() {
        U.modal('新增字段映射', `
          <div class="note-box blue mb">本地新增，保存于浏览器。</div>
          <div class="grid g-2">
            <label class="fld">源字段 <input class="inp" id="nm-src" placeholder="如 dev_temp"></label>
            <label class="fld">目标字段 <input class="inp" id="nm-dst" placeholder="如 telemetry.temperature"></label>
            <label class="fld">转换规则 <input class="inp" id="nm-rule" placeholder="如 单位标准化"></label>
            <label class="fld">数据源 <select class="sel" id="nm-source">${D.sources.map(s => `<option>${s.id}</option>`).join('')}</select></label>
          </div>`,
          `<button class="btn" onclick="UI.closeModal()">取消</button><button class="btn primary" id="nm-save">${U.icon('check', 13)} 保存</button>`);
        document.getElementById('nm-save').addEventListener('click', () => {
          const src = document.getElementById('nm-src').value.trim(), dst = document.getElementById('nm-dst').value.trim();
          if (!src || !dst) { U.toast('请填写源字段与目标字段', 'warn'); return; }
          edits.mappings.push({ src, dst, rule: document.getElementById('nm-rule').value.trim() || '字段重命名', source: document.getElementById('nm-source').value });
          persist(); drawMap(); U.closeModal(); U.toast('字段映射已新增（本地）', 'ok');
        });
      }
      function addRel() {
        const relTypes = ['网络上联', '光链路', '供电回路', '控制指令', '同机柜'];
        U.modal('新增设备关系', `
          <div class="note-box blue mb">本地新增，保存于浏览器。</div>
          <div class="grid g-2">
            <label class="fld">源设备 <input class="inp" id="nr-src" placeholder="如 CAM-05"></label>
            <label class="fld">目标设备 <input class="inp" id="nr-dst" placeholder="如 SW-12"></label>
            <label class="fld">关系类型 <select class="sel" id="nr-type">${relTypes.map(t => `<option>${t}</option>`).join('')}</select></label>
            <label class="fld">状态 <select class="sel" id="nr-status"><option value="normal">正常</option><option value="warn">异常</option><option value="down">中断</option></select></label>
          </div>`,
          `<button class="btn" onclick="UI.closeModal()">取消</button><button class="btn primary" id="nr-save">${U.icon('check', 13)} 保存</button>`);
        document.getElementById('nr-save').addEventListener('click', () => {
          const src = document.getElementById('nr-src').value.trim(), dst = document.getElementById('nr-dst').value.trim();
          if (!src || !dst) { U.toast('请填写源设备与目标设备', 'warn'); return; }
          edits.relations.push({ source: src, target: dst, type: document.getElementById('nr-type').value, status: document.getElementById('nr-status').value, note: '本地新增' });
          persist(); drawRel(); U.closeModal(); U.toast('设备关系已新增（本地）', 'ok');
        });
      }
      function addCfg() {
        U.modal('新增配置项', `
          <div class="note-box blue mb">本地新增，保存于浏览器，无审批流程。</div>
          <div class="grid g-2">
            <label class="fld">名称 <input class="inp" id="nc-name" placeholder="如 新增编码映射表"></label>
            <label class="fld">类型 <select class="sel" id="nc-type">${[...new Set(D.configs.map(c => c.type))].map(t => `<option>${t}</option>`).join('')}</select></label>
            <label class="fld">专业 <input class="inp" id="nc-cat" placeholder="如 监控"></label>
            <label class="fld">影响设备数 <input class="inp" id="nc-affected" type="number" value="0"></label>
          </div>
          <label class="fld mt">说明 <input class="inp" id="nc-detail" style="width:100%" placeholder="配置说明"></label>`,
          `<button class="btn" onclick="UI.closeModal()">取消</button><button class="btn primary" id="nc-save">${U.icon('check', 13)} 保存</button>`);
        document.getElementById('nc-save').addEventListener('click', () => {
          const nm = document.getElementById('nc-name').value.trim();
          if (!nm) { U.toast('请填写配置名称', 'warn'); return; }
          const id = 'CFG-L' + pad(edits.extraCfg.length + 1);
          edits.extraCfg.push({ id, name: nm, type: document.getElementById('nc-type').value, cat: document.getElementById('nc-cat').value.trim() || '全专业', updated: D.fmtTime(D.NOW, 'date'), status: '启用', affected: +document.getElementById('nc-affected').value || 0, detail: document.getElementById('nc-detail').value.trim() || '本地新增配置项。' });
          persist(); drawTable(); U.closeModal(); U.toast('配置项已新增（本地）', 'ok');
        });
      }
      function drawAll() { drawTable(); drawMap(); drawQuality(); drawRel(); drawState(); }
      drawAll();
      el.querySelectorAll('#cfg-tabs .pill').forEach(p => p.addEventListener('click', () => {
        el.querySelectorAll('#cfg-tabs .pill').forEach(x => x.classList.remove('on'));
        p.classList.add('on'); tab = p.dataset.v; drawTable();
      }));
      el.querySelector('#cfg-add').addEventListener('click', addCfg);
      el.querySelector('#cfg-add-map').addEventListener('click', addMap);
      el.querySelector('#cfg-add-rel').addEventListener('click', addRel);
      el.querySelector('#cfg-reset').addEventListener('click', () => {
        U.modal('恢复默认配置', `<div class="note-box blue">将清除本浏览器中所有本地编辑（配置项/字段映射/设备关系/新增项），恢复为内置默认配置。此操作不影响真实系统。</div>`,
          `<button class="btn" onclick="UI.closeModal()">取消</button><button class="btn primary" id="cfg-reset-ok">${U.icon('reset', 13)} 确认恢复</button>`);
        document.getElementById('cfg-reset-ok').addEventListener('click', () => {
          localStorage.removeItem(LS_KEY);
          edits = loadEdits();
          edits.mappings = D.fieldMappings.map(m => Object.assign({}, m));
          edits.relations = D.relations.slice(0, 12).map(r => Object.assign({}, r));
          edits.cfgMeta = {}; edits.extraCfg = [];
          drawAll(); U.closeModal(); U.toast('已恢复默认配置', 'ok');
        });
      });
    }
  };
})();
