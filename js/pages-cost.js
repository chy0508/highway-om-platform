/* ============================================================
 * 页面：成本分析 / UPS蓄电池更新决策 / 成效评价
 * 经济类页面统一标注“示例测算”，成效类标注“统计口径”
 * ============================================================ */
(function () {
  'use strict';
  const D = window.DB, P = window.Pages, U = window.UI;
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sum = a => a.reduce((x, y) => x + y, 0);
  function summaryModal(title, text) {
    U.modal(title, `<div class="note-box blue mb">以下为基于模拟数据生成的示例测算摘要，可复制用于汇报。测算含模型假设，非真实财务结论，不构成采购/审批依据。</div>
      <pre id="sum-text" style="white-space:pre-wrap;font-family:var(--font);font-size:12px;line-height:1.85;background:#f6f8fa;border:1px solid var(--line);border-radius:7px;padding:12px 14px;color:var(--text)">${U.esc(text)}</pre>`,
      `<button class="btn" onclick="UI.closeModal()">关闭</button><button class="btn primary" onclick="UI.copy(document.getElementById('sum-text').textContent)">${U.icon('copy', 14)} 复制摘要</button>`);
  }
  function segBind(el, sel, cb) {
    el.querySelectorAll(sel + ' .seg').forEach(b => b.addEventListener('click', () => {
      el.querySelectorAll(sel + ' .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); cb(b.dataset.v);
    }));
  }
  const catName = k => (D.costCats.find(c => c.key === k) || {}).name || k;
  const catColor = k => (D.costCats.find(c => c.key === k) || {}).color || '#94a3b8';

  /* ================= 8.14 成本分析 ================= */
  P.cost = {
    title: '成本分析 · 运维成本结构', group: '成本与决策', crumb: true,
    render(el, params) {
      let range = 6, cat = 'all', dim = 'time';
      const months = () => D.costMonths.slice(-range);
      const monthly = () => D.costMonthly.filter(m => months().includes(m.month));
      const records = () => D.costRecords.filter(r => months().includes(r.month) && (cat === 'all' || r.cat === cat));
      function totals() {
        const ms = monthly();
        const byCat = {}; D.costCats.forEach(c => byCat[c.key] = +sum(ms.map(m => m[c.key])).toFixed(1));
        const grand = +sum(Object.values(byCat)).toFixed(1);
        return { byCat, grand, energy: byCat.energy, repair: +(byCat.parts + byCat.service + byCat.field + byCat.emergency).toFixed(1), avg: +(grand / ms.length).toFixed(1) };
      }
      el.innerHTML = U.pageHead('成本分析 · 机电运维成本结构',
        '按设备、路段、故障类型与时间维度归集运维成本，识别高成本与重复维修设备。本页为示例测算，成本数据为统计口径，含能源/备件/服务/现场/应急五类，不含基建投资。',
        `<button class="btn" id="cost-caliber">${U.icon('diag', 14)} 统计口径说明</button>
         <button class="btn primary" id="cost-export">${U.icon('export', 14)} 导出明细摘要</button>`, U.demoBadge('示例测算')) +
        `<div class="grid g-6 mb" id="cost-kpis"></div>
        <div class="card mb"><div class="card-b">
          <div class="filter-bar" style="margin:0">
            <span class="fld" style="font-weight:600;color:var(--navy-800)">时间范围</span>
            <span class="btn-group" id="cost-range"><button class="seg" data-v="3">近3月</button><button class="seg on" data-v="6">近6月</button></span>
            <label class="fld">成本类别 <select class="sel" id="cost-cat"><option value="all">全部类别</option>${D.costCats.map(c => `<option value="${c.key}">${c.name}</option>`).join('')}</select></label>
            <span class="spacer" style="flex:1"></span>
            <span class="fld" style="font-weight:600;color:var(--navy-800)">分析维度</span>
            <span class="btn-group" id="cost-dim"><button class="seg on" data-v="time">时间</button><button class="seg" data-v="device">设备</button><button class="seg" data-v="section">路段</button><button class="seg" data-v="fault">故障</button></span>
          </div>
        </div></div>
        <div class="flex">
          <div style="width:340px;flex:0 0 340px">
            <div class="card"><div class="card-h"><span class="card-t">成本结构</span><span class="sub">点击类别查看明细</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b"><div id="cost-donut"></div><div class="sec-t">月度构成（堆叠）</div><div id="cost-stack"></div></div></div>
          </div>
          <div class="grow">
            <div class="card"><div class="card-h"><span class="card-t" id="cost-dim-title">时间维度</span><span class="sub" id="cost-dim-sub"></span><span class="spacer"></span>${U.demoBadge('示例测算')}</div>
              <div class="card-b" id="cost-dim-body"></div></div>
          </div>
          <div style="width:300px;flex:0 0 300px">
            <div class="card"><div class="card-h"><span class="card-t">高成本设备排行</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="cost-rank"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">重复维修预警</span></div>
              <div class="card-b" id="cost-repeat"></div></div>
          </div>
        </div>`;
      function drawKpis() {
        const t = totals();
        const repeat = D.deviceCostRank.filter(d => /重复|多次|3次|2次/.test(d.note)).length;
        el.querySelector('#cost-kpis').innerHTML =
          U.kpi('运维总成本', t.grand, '近' + range + '月 · 示例测算', '#2f7bff', null, 'cost', '万元') +
          U.kpi('能源费用', t.energy, '占比 ' + (t.energy / t.grand * 100).toFixed(1) + '%', '#00b8d9', "UI.go('fan')", 'fan', '万元') +
          U.kpi('维修相关', t.repair, '备件+服务+现场+应急', '#f59e0b', null, 'dev', '万元') +
          U.kpi('月均成本', t.avg, '近' + range + '月均值', '#8b5cf6', null, 'cost', '万元') +
          U.kpi('高成本设备', D.deviceCostRank.length, '点击查看排行', '#ef4444', null, 'warn', '台') +
          U.kpi('重复维修', repeat, '近12月多次维修', '#ef4444', null, 'reset', '台');
      }
      function drawStructure() {
        const t = totals();
        Charts.donut(el.querySelector('#cost-donut'), {
          size: 160, thick: .64, center: t.grand, centerSub: '万元', unit: '万',
          items: D.costCats.map(c => ({ name: c.name, value: t.byCat[c.key], color: c.color, key: c.key })),
          onClick: it => openRecords(it.key, it.name)
        });
        const ms = monthly();
        Charts.bar(el.querySelector('#cost-stack'), {
          labels: ms.map(m => m.month.slice(5) + '月'), height: 200, yUnit: '万元',
          series: D.costCats.map(c => ({ name: c.name, color: c.color, data: ms.map(m => +m[c.key].toFixed(1)) })),
          onClick: (i, lb) => openMonth(ms[i].month)
        });
      }
      function openRecords(key, name) {
        const rs = D.costRecords.filter(r => r.cat === key && months().includes(r.month));
        U.openDrawer('成本明细 · ' + name, `
          <div class="flex ai-center mb">${U.demoBadge('示例测算')} <b>${name}</b> <span class="tag info">${rs.length} 条</span> <span class="spacer" style="flex:1"></span><b>合计 ${sum(rs.map(r => r.amount)).toFixed(1)} 万元</b></div>
          ${rs.length ? rs.map(r => `<div class="evi" style="cursor:pointer" onclick="UI.openDevice('${r.asset}')"><div class="evi-t"><span class="mono">${r.id}</span><span class="spacer" style="flex:1"></span><b>${r.amount} 万元</b></div><div class="evi-d">${r.desc}</div><div class="src">${r.asset} · ${r.location} · ${r.month} · ${r.supplier}</div></div>`).join('') : '<div class="empty">该类别在当前时间范围内无明细记录</div>'}`, true);
      }
      function openMonth(m) {
        const rs = D.costRecords.filter(r => r.month === m);
        const mt = D.costMonthly.find(x => x.month === m);
        U.openDrawer('月度成本 · ' + m, `
          <div class="flex ai-center mb">${U.demoBadge('示例测算')} <b>${m}</b> <span class="spacer" style="flex:1"></span><b>合计 ${sum(D.costCats.map(c => mt[c.key])).toFixed(1)} 万元</b></div>
          <div class="kv mb">${D.costCats.map(c => `<span class="k">${c.name}</span><span class="v">${mt[c.key].toFixed(1)} 万元</span>`).join('')}</div>
          <div class="sec-t">当月明细（${rs.length}）</div>
          ${rs.map(r => `<div class="evi" style="cursor:pointer" onclick="UI.openDevice('${r.asset}')"><div class="evi-t"><span class="tag" style="background:${catColor(r.cat)}18;color:${catColor(r.cat)}">${catName(r.cat)}</span><span class="mono">${r.asset}</span><span class="spacer" style="flex:1"></span><b>${r.amount} 万</b></div><div class="src">${r.desc} · ${r.supplier}</div></div>`).join('')}`, true);
      }
      function drawDim() {
        const body = el.querySelector('#cost-dim-body');
        const titles = { time: '时间维度', device: '设备维度', section: '路段维度', fault: '故障维度' };
        el.querySelector('#cost-dim-title').textContent = titles[dim];
        const rs = records();
        if (dim === 'time') {
          el.querySelector('#cost-dim-sub').textContent = '月度成本趋势与类别构成';
          const ms = monthly();
          body.innerHTML = '<div id="cost-trend"></div><div class="sec-t">月度明细表</div><div id="cost-month-tbl"></div>';
          Charts.line(body.querySelector('#cost-trend'), {
            labels: ms.map(m => m.month), height: 220, yUnit: '万元', area: true, legendToggle: true, type: 'line',
            series: D.costCats.map(c => ({ name: c.name, color: c.color, data: ms.map(m => +m[c.key].toFixed(1)), unit: '万' })).concat([{ name: '合计', color: '#0b2242', data: ms.map(m => +sum(D.costCats.map(c => m[c.key])).toFixed(1)), unit: '万', dash: '5,4' }])
          });
          U.table(body.querySelector('#cost-month-tbl'), {
            rows: ms, pageSize: 6, sortKey: 'month', sortDir: 1,
            cols: [{ key: 'month', title: '月份', sortable: true }].concat(D.costCats.map(c => ({ key: c.key, title: c.name, sortable: true, cls: 'num', render: r => r[c.key].toFixed(1) }))).concat([{ key: 'total', title: '合计', cls: 'num', sortVal: r => sum(D.costCats.map(c => r[c.key])), render: r => '<b>' + sum(D.costCats.map(c => r[c.key])).toFixed(1) + '</b>' }]),
            onRow: r => openMonth(r.month)
          });
        } else if (dim === 'device') {
          el.querySelector('#cost-dim-sub').textContent = '按设备归集成本（点击查看详情）';
          const byDev = {};
          rs.forEach(r => { byDev[r.asset] = (byDev[r.asset] || 0) + r.amount; });
          const items = Object.keys(byDev).map(k => ({ name: k, value: +byDev[k].toFixed(1), color: catColor('service'), sub: (D.byCode[k] || {}).name || '' })).sort((a, b) => b.value - a.value);
          body.innerHTML = '<div id="cost-dev-bar"></div><div class="sec-t">设备成本明细</div><div id="cost-dev-tbl"></div>';
          Charts.hbar(body.querySelector('#cost-dev-bar'), { items, unit: ' 万', labelW: 110, onClick: it => openDeviceCost(it.name) });
          U.table(body.querySelector('#cost-dev-tbl'), {
            rows: rs, pageSize: 8, sortKey: 'amount', sortDir: -1,
            cols: [
              { key: 'asset', title: '设备', sortable: true, render: r => `<span class="code">${r.asset}</span>` },
              { key: 'cat', title: '类别', render: r => `<span class="tag" style="background:${catColor(r.cat)}18;color:${catColor(r.cat)}">${catName(r.cat)}</span>` },
              { key: 'amount', title: '金额(万)', sortable: true, cls: 'num', render: r => r.amount.toFixed(1) },
              { key: 'desc', title: '说明', render: r => `<span class="small">${r.desc}</span>` },
              { key: 'month', title: '月份', sortable: true }
            ], onRow: r => openDeviceCost(r.asset)
          });
        } else if (dim === 'section') {
          el.querySelector('#cost-dim-sub').textContent = '按路段/位置归集成本';
          const byLoc = {};
          rs.forEach(r => { byLoc[r.location] = (byLoc[r.location] || 0) + r.amount; });
          const items = Object.keys(byLoc).map(k => ({ name: k, value: +byLoc[k].toFixed(1), color: '#2f7bff' })).sort((a, b) => b.value - a.value);
          body.innerHTML = '<div id="cost-sec-bar"></div><div class="note-box blue mt">路段维度按成本记录的发生位置归集（统计口径）。隧道机电成本集中在青岭/南岭隧道，机房成本集中在监控中心。</div>';
          Charts.bar(body.querySelector('#cost-sec-bar'), { labels: items.map(i => i.name), height: 260, yUnit: '万元', series: [{ name: '成本', color: '#2f7bff', data: items.map(i => i.value) }], showTotal: true, legend: false, onClick: (i, lb) => openLocation(lb) });
        } else {
          el.querySelector('#cost-dim-sub').textContent = '按故障/支出类型归集，关联诊断事件';
          const byCat = {};
          rs.forEach(r => { byCat[r.cat] = (byCat[r.cat] || 0) + r.amount; });
          body.innerHTML = '<div class="grid g-2"><div id="cost-fault-donut"></div><div id="cost-fault-ev"></div></div><div class="sec-t">故障相关支出明细</div><div id="cost-fault-tbl"></div>';
          Charts.donut(body.querySelector('#cost-fault-donut'), { size: 170, thick: .64, center: sum(rs.map(r => r.amount)).toFixed(0), centerSub: '万元', items: D.costCats.map(c => ({ name: c.name, value: +(byCat[c.key] || 0).toFixed(1), color: c.color, key: c.key })).filter(x => x.value > 0), onClick: it => openRecords(it.key, it.name) });
          const evs = D.events.filter(e => e.level === '严重' || e.level === '重要');
          body.querySelector('#cost-fault-ev').innerHTML = '<div class="sec-t" style="margin-top:0">关联诊断事件</div>' + evs.map(e => `<div class="evi" style="cursor:pointer;padding:7px 10px" onclick="UI.go('${e.page}',{id:'${e.id}'})"><div class="evi-t small">${U.levelTag(e.level)} ${e.name}</div><div class="src">${e.id} · ${e.type} · 查看诊断与处置支出 ›</div></div>`).join('');
          U.table(body.querySelector('#cost-fault-tbl'), {
            rows: rs.filter(r => r.cat === 'emergency' || r.cat === 'service' || r.cat === 'parts'), pageSize: 8, sortKey: 'amount', sortDir: -1,
            cols: [
              { key: 'cat', title: '类型', render: r => `<span class="tag" style="background:${catColor(r.cat)}18;color:${catColor(r.cat)}">${catName(r.cat)}</span>` },
              { key: 'asset', title: '设备', render: r => `<span class="code">${r.asset}</span>` },
              { key: 'amount', title: '金额(万)', sortable: true, cls: 'num', render: r => r.amount.toFixed(1) },
              { key: 'desc', title: '故障/支出说明', render: r => `<span class="small">${r.desc}</span>` },
              { key: 'month', title: '月份', sortable: true }
            ], onRow: r => openDeviceCost(r.asset)
          });
        }
      }
      function openLocation(loc) {
        const rs = records().filter(r => r.location === loc);
        U.openDrawer('路段成本 · ' + loc, `<div class="flex ai-center mb">${U.demoBadge('示例测算')} <b>${loc}</b> <span class="spacer" style="flex:1"></span><b>${sum(rs.map(r => r.amount)).toFixed(1)} 万元</b></div>
          ${rs.map(r => `<div class="evi" style="cursor:pointer" onclick="UI.openDevice('${r.asset}')"><div class="evi-t"><span class="tag" style="background:${catColor(r.cat)}18;color:${catColor(r.cat)}">${catName(r.cat)}</span><span class="mono">${r.asset}</span><span class="spacer" style="flex:1"></span><b>${r.amount} 万</b></div><div class="src">${r.desc} · ${r.month}</div></div>`).join('')}`, true);
      }
      function openDeviceCost(code) {
        const d = D.byCode[code];
        const rs = D.costRecords.filter(r => r.asset === code);
        const rank = D.deviceCostRank.find(x => x.code === code);
        U.openDrawer('设备成本档案 · ' + code, `
          <div class="flex ai-center mb">${U.statusTag(d ? d.status : 'online')} <b>${d ? d.name : code}</b> ${U.demoBadge('示例测算')}</div>
          <div class="kv mb"><span class="k">设备编码</span><span class="v mono">${code}</span><span class="k">近6月成本</span><span class="v"><b>${sum(rs.map(r => r.amount)).toFixed(1)} 万元</b></span>${rank ? `<span class="k">排行备注</span><span class="v">${rank.note}</span>` : ''}</div>
          <div class="sec-t">成本明细（${rs.length}）</div>
          ${rs.length ? rs.map(r => `<div class="evi"><div class="evi-t"><span class="tag" style="background:${catColor(r.cat)}18;color:${catColor(r.cat)}">${catName(r.cat)}</span><span class="spacer" style="flex:1"></span><b>${r.amount} 万</b></div><div class="evi-d">${r.desc}</div><div class="src">${r.month} · ${r.supplier}</div></div>`).join('') : '<div class="muted small">无直接成本记录</div>'}
          <div class="divider"></div>
          <button class="btn primary" onclick="UI.openDevice('${code}')">${U.icon('dev', 13)} 设备档案</button>
          <button class="btn" onclick="UI.go('keydev',{focus:'${code}'})">${U.icon('diag', 13)} 重点设备分析</button>
          ${code === 'BAT-01' ? `<button class="btn" onclick="UI.go('ups')">${U.icon('batt', 13)} UPS更新决策</button>` : ''}`, true);
      }
      function drawRank() {
        const items = D.deviceCostRank.slice().sort((a, b) => b.total - a.total).map(d => ({ name: d.name, value: d.total, color: '#ef4444', sub: d.code + ' · ' + d.note, code: d.code }));
        Charts.hbar(el.querySelector('#cost-rank'), { items, unit: ' 万', labelW: 130, onClick: it => openDeviceCost(it.code) });
        const repeat = D.deviceCostRank.filter(d => /重复|多次|3次|2次/.test(d.note));
        el.querySelector('#cost-repeat').innerHTML = repeat.map(d => `<div class="evi" style="cursor:pointer;border-color:#f3c0c0" onclick="UI.go('${d.code === 'BAT-01' ? 'ups' : 'keydev'}',{focus:'${d.code}'})"><div class="evi-t small">${U.icon('warn', 13)} ${d.name}</div><div class="src">${d.note} · 累计 ${d.total} 万元 ›</div></div>`).join('') +
          '<div class="note-box mt">重复维修设备建议结合重点设备分析与更新决策评估，而非持续投入维修。</div>';
      }
      function drawAll() { drawKpis(); drawStructure(); drawDim(); drawRank(); }
      drawAll();
      segBind(el, '#cost-range', v => { range = +v; drawAll(); });
      el.querySelector('#cost-cat').addEventListener('change', ev => { cat = ev.target.value; drawDim(); });
      segBind(el, '#cost-dim', v => { dim = v; drawDim(); });
      el.querySelector('#cost-caliber').addEventListener('click', () => {
        U.modal('成本统计口径说明', `
          <div class="note-box blue mb">本页成本为统计口径示例测算，用于展示分析维度与方法，非真实财务数据。</div>
          <div class="kv"><span class="k">统计范围</span><span class="v">A高速示范路段机电运维，近6月（2026-06—11）</span>
          <span class="k">成本类别</span><span class="v">能源费用 / 备品备件 / 维修服务 / 现场作业 / 应急支出</span>
          <span class="k">能源口径</span><span class="v">风机/照明/机房电费分摊，含交通量与季节影响</span>
          <span class="k">归集维度</span><span class="v">设备 / 路段（发生位置）/ 故障类型 / 时间（月）</span>
          <span class="k">不含项</span><span class="v">基建投资、设备购置原值、人工固定工资</span>
          <span class="k">重复维修</span><span class="v">近12月同一设备多次维修/备件更换</span></div>
          <div class="note-box mt">成本数据与设备台账、诊断事件、现场任务跨页一致；金额为模拟值，单位万元。</div>`,
          `<button class="btn" onclick="UI.closeModal()">关闭</button>`);
      });
      el.querySelector('#cost-export').addEventListener('click', () => {
        const t = totals();
        summaryModal('成本分析 · 明细摘要', `【范围】A高速示范路段 · 近${range}月（${months()[0]}—${months()[months().length - 1]}）
【总成本】${t.grand} 万元（月均 ${t.avg} 万元）
【类别构成】${D.costCats.map(c => c.name + ' ' + t.byCat[c.key] + '万').join('，')}
【能源占比】${(t.energy / t.grand * 100).toFixed(1)}%
【高成本设备】${D.deviceCostRank.slice().sort((a, b) => b.total - a.total).map(d => d.name + '(' + d.total + '万)').join('，')}
【重复维修预警】${D.deviceCostRank.filter(d => /重复|多次|3次|2次/.test(d.note)).map(d => d.name + '：' + d.note).join('；')}
【统计口径】能源/备件/服务/现场/应急五类，按设备/路段/故障/时间归集；不含基建投资与设备原值。
【边界说明】本页为示例测算，成本为统计口径数据，非真实财务结论。`);
      });
    }
  };

  /* ================= 8.15 UPS蓄电池更新决策 ================= */
  P.ups = {
    title: 'UPS蓄电池更新决策 · 示例测算', group: '成本与决策', crumb: true,
    render(el, params) {
      const bat = D.byCode['BAT-01'];
      const cells = D.cells;
      const badCells = cells.filter(c => c.status === 'warn');
      const health = Math.round(sum(cells.map(c => c.capacity)) / cells.length);
      const ageYears = 7;
      let years = 5, replCost = 6.5, maintK = 1.0, healthAdj = health, plan = 'C';
      const PLANS = {
        A: { name: '继续维护', initial: 0, maint: 1.2, parts: 1.5, test: 0.4, risk: 2.0, life: 2, desc: '维持现状，定期容量测试与单体更换。短期投入低，但老化风险高，约2年后需整组更换。' },
        B: { name: '更换异常单体', initial: 1.8, maint: 0.8, parts: 0.6, test: 0.5, risk: 1.2, life: 3, desc: '更换#07/#12/#19等异常单体，恢复组端一致性。投入适中，延缓整组老化，约3年后需更新。' },
        C: { name: '分批更新', initial: 3.2, maint: 0.6, parts: 0.4, test: 0.5, risk: 0.7, life: 5, desc: '分批次更换老化单体/模块，平衡投入与可靠性，5年周期内综合成本与风险较优。' },
        D: { name: '整组更换', initial: 6.5, maint: 0.4, parts: 0.2, test: 0.5, risk: 0.3, life: 8, desc: '整组32节全新更换，可靠性最高、维护最少，初始投入大，适合长期持有。' }
      };
      function planTotal(k) {
        const p = PLANS[k];
        const riskK = clamp((100 - healthAdj) / 25, 0.4, 2.2);
        const annual = (p.maint * maintK + p.parts + p.test + p.risk * riskK);
        const init = k === 'D' ? replCost : p.initial * (k === 'A' ? 1 : replCost / 6.5);
        const repls = Math.max(0, Math.ceil(years / p.life) - 1);
        const replEach = k === 'D' ? replCost : k === 'A' ? replCost : replCost * 0.6;
        return { init: +init.toFixed(2), annual: +annual.toFixed(2), repls, replCost: +(repls * replEach).toFixed(2), total: +(init + annual * years + repls * replEach).toFixed(2), risk: +(p.risk * riskK).toFixed(2) };
      }
      function recommend() {
        const ok = Object.keys(PLANS).filter(k => planTotal(k).risk <= 1.0);
        const pool = ok.length ? ok : Object.keys(PLANS);
        return pool.sort((a, b) => planTotal(a).total - planTotal(b).total)[0];
      }
      el.innerHTML = U.pageHead('UPS蓄电池更新决策 · 全生命周期成本',
        '监控中心 UPS 蓄电池组 BAT-01（32节，2019-06投运）出现单体离散。结合健康度、重复维修历史与全生命周期成本模型，对比四种更新方案。本页为示例测算，含模型假设，非仅按使用年限决策。',
        `<button class="btn" onclick="UI.go('keydev',{focus:'BAT-01'})">${U.icon('diag', 14)} 重点设备分析</button>
         <button class="btn" id="ups-data">${U.icon('db', 14)} 查看数据依据</button>
         <button class="btn primary" id="ups-summary">${U.icon('copy', 14)} 生成决策摘要</button>`, U.demoBadge('示例测算')) +
        `<div class="card dark-panel mb"><div class="card-b">
          <div class="grid g-6" style="gap:9px">
            <div class="dp-kpi"><div class="l">电池组</div><div class="v cy" style="font-size:16px">BAT-01</div></div>
            <div class="dp-kpi"><div class="l">单体数量</div><div class="v">32<small> 节</small></div></div>
            <div class="dp-kpi"><div class="l">投运年限</div><div class="v am">${ageYears}<small> 年</small></div></div>
            <div class="dp-kpi"><div class="l">异常单体</div><div class="v rd">${badCells.length}<small> 节</small></div></div>
            <div class="dp-kpi"><div class="l">平均容量健康度</div><div class="v ${health < 80 ? 'am' : 'gn'}">${health}<small> %</small></div></div>
            <div class="dp-kpi"><div class="l">近12月维修</div><div class="v am">3<small> 次</small></div></div>
          </div>
        </div></div>
        <div class="flex">
          <div style="width:320px;flex:0 0 320px">
            <div class="card"><div class="card-h"><span class="card-t">单体电池分布</span><span class="sub">点击单体查看参数</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="ups-cells"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">单体电压分布</span></div>
              <div class="card-b" id="ups-volt"></div></div>
          </div>
          <div class="grow">
            <div class="card"><div class="card-h"><span class="card-t">更新方案对比</span><span class="sub">点击选择方案</span><span class="spacer"></span>${U.demoBadge('示例测算')}</div>
              <div class="card-b" id="ups-plans"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">全生命周期成本模型</span><span class="sub" id="ups-years-sub"></span><span class="spacer"></span>${U.demoBadge('示例测算')}</div>
              <div class="card-b"><div id="ups-cost-chart"></div><div id="ups-cost-detail"></div></div></div>
          </div>
          <div style="width:320px;flex:0 0 320px">
            <div class="card"><div class="card-h"><span class="card-t">推荐与假设</span><span class="spacer"></span>${U.demoBadge('示例测算')}</div>
              <div class="card-b" id="ups-reco"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">测算参数（可调）</span></div>
              <div class="card-b" id="ups-params"></div></div>
          </div>
        </div>`;
      function drawCells() {
        el.querySelector('#ups-cells').innerHTML = `<div class="small muted mb">32节单体 · 红=异常（#07/#12/#19）· 绿=正常</div>
          <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px">
          ${cells.map(c => `<div data-cell="${c.no}" title="#${c.no} ${c.voltage}V" style="cursor:pointer;aspect-ratio:1;border-radius:4px;background:${c.status === 'warn' ? 'rgba(239,68,68,.2)' : 'rgba(22,163,74,.16)'};border:1.5px solid ${c.status === 'warn' ? '#ef4444' : '#16a34a'};display:flex;align-items:center;justify-content:center;font-size:9px;color:${c.status === 'warn' ? '#f87171' : '#86efac'};font-weight:600">${c.no}</div>`).join('')}</div>
          <div class="legend mt"><span class="li"><span class="cd" style="background:#ef4444"></span>异常单体 ${badCells.length}</span><span class="li"><span class="cd" style="background:#16a34a"></span>正常 ${cells.length - badCells.length}</span></div>`;
        el.querySelectorAll('[data-cell]').forEach(x => x.addEventListener('click', () => openCell(+x.dataset.cell)));
        Charts.bar(el.querySelector('#ups-volt'), {
          labels: cells.map(c => '#' + c.no), height: 180, yUnit: 'V', legend: false,
          series: [{ name: '浮充电压', color: '#2f7bff', data: cells.map(c => c.voltage) }],
          onClick: i => openCell(i + 1)
        });
      }
      function openCell(no) {
        const c = cells.find(x => x.no === no);
        U.openDrawer('单体电池 #' + pad(no), `
          <div class="flex ai-center mb">${U.statusTag(c.status, true)} <b>单体 #${pad(no)}</b> ${U.demoBadge()}</div>
          <div class="kv"><span class="k">浮充电压</span><span class="v"><b style="color:${c.status === 'warn' ? '#b91c1c' : '#15803d'}">${c.voltage} V</b>（正常13.5—13.6V）</span>
          <span class="k">内阻</span><span class="v">${c.resistance} mΩ ${c.status === 'warn' ? '（较基线↑35%）' : ''}</span>
          <span class="k">温度</span><span class="v">${c.temp} ℃</span>
          <span class="k">容量</span><span class="v">${c.capacity} %</span>
          <span class="k">状态</span><span class="v">${c.status === 'warn' ? '电压偏低/内阻上升/温度偏高' : '正常'}</span></div>
          <div class="sec-t">电压趋势（近30天）</div><div id="cell-trend"></div>
          ${c.status === 'warn' ? '<div class="note-box mt">该单体呈现老化特征，建议核对性放电测试核查容量，纳入更新方案评估。</div>' : ''}`, true);
        Charts.line(document.getElementById('cell-trend'), { labels: D.hoursAxis(30, 24), series: [{ name: '浮充电压', color: c.status === 'warn' ? '#ef4444' : '#16a34a', data: D.series('cell' + no, 30, c.voltage, 0.06, { drift: c.status === 'warn' ? -0.15 : 0 }), unit: 'V' }], height: 170, yUnit: 'V', area: true, legend: false });
      }
      function drawPlans() {
        const rec = recommend();
        el.querySelector('#ups-plans').innerHTML = `<div class="grid g-2">${Object.keys(PLANS).map(k => {
          const p = PLANS[k], t = planTotal(k);
          return `<div class="evi" data-plan="${k}" style="cursor:pointer;${k === plan ? 'border-color:var(--cyan);background:#f0fbfd' : ''}">
            <div class="evi-t"><span class="tag ${k === rec ? 'ok' : 'plain'}">${k}</span>${p.name}${k === rec ? ' <span class="tag ok">推荐</span>' : ''}<span class="spacer" style="flex:1"></span><b>${t.total} 万</b></div>
            <div class="evi-d small">${p.desc}</div>
            <div class="src">初始 ${t.init}万 · 年均 ${t.annual}万 · 风险成本 ${t.risk}万/年 · 周期 ${p.life}年</div>
          </div>`;
        }).join('')}</div>`;
        el.querySelectorAll('[data-plan]').forEach(x => x.addEventListener('click', () => { plan = x.dataset.plan; drawPlans(); drawCost(); drawReco(); }));
      }
      function drawCost() {
        el.querySelector('#ups-years-sub').textContent = years + '年周期 · 含模型假设';
        const keys = Object.keys(PLANS);
        Charts.bar(el.querySelector('#ups-cost-chart'), {
          labels: keys.map(k => PLANS[k].name), height: 220, yUnit: '万元', showTotal: true,
          series: [
            { name: '初始投入', color: '#2f7bff', data: keys.map(k => planTotal(k).init) },
            { name: '维护(累计)', color: '#00b8d9', data: keys.map(k => +(PLANS[k].maint * maintK * years).toFixed(2)) },
            { name: '备件+测试', color: '#f59e0b', data: keys.map(k => +((PLANS[k].parts + PLANS[k].test) * years).toFixed(2)) },
            { name: '风险成本', color: '#ef4444', data: keys.map(k => +(planTotal(k).risk * years).toFixed(2)) },
            { name: '周期更换', color: '#8b5cf6', data: keys.map(k => planTotal(k).replCost) }
          ], onClick: i => { plan = keys[i]; drawPlans(); drawCost(); drawReco(); }
        });
        const t = planTotal(plan), p = PLANS[plan];
        el.querySelector('#ups-cost-detail').innerHTML = `<div class="sec-t">方案${plan} · ${p.name} 成本构成（${years}年）</div>
          <div class="grid g-3">
            ${[['初始投入', t.init, '#2f7bff'], ['维护累计', +(p.maint * maintK * years).toFixed(2), '#00b8d9'], ['备件累计', +(p.parts * years).toFixed(2), '#f59e0b'], ['测试累计', +(p.test * years).toFixed(2), '#8b5cf6'], ['风险成本', +(t.risk * years).toFixed(2), '#ef4444'], ['周期更换', t.replCost, '#64748b']].map(([n, v, c]) => `<div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line);cursor:pointer" data-assump="${n}"><div class="l" style="color:var(--text-3)">${n}</div><div class="v" style="font-size:16px;color:${c}">${v}<small style="color:var(--text-3)"> 万</small></div></div>`).join('')}
          </div>
          <div class="note-box mt">点击成本构成查看假设。风险成本为模型假设的故障期望损失（随健康度变化），非实际发生费用。周期更换按方案寿命在${years}年内触发次数计。</div>`;
        el.querySelectorAll('[data-assump]').forEach(x => x.addEventListener('click', () => {
          U.modal('成本假设 · ' + x.dataset.assump, `<div class="note-box blue mb">该项为示例测算的模型假设，可在右侧“测算参数”调整相关系数。</div>
            <div class="kv"><span class="k">成本项</span><span class="v">${x.dataset.assump}</span>
            <span class="k">方案</span><span class="v">${plan} · ${p.name}</span>
            <span class="k">评估年限</span><span class="v">${years} 年</span>
            <span class="k">维护系数</span><span class="v">${maintK}</span>
            <span class="k">健康度</span><span class="v">${healthAdj}%（影响风险成本）</span>
            <span class="k">整组更换成本</span><span class="v">${replCost} 万元</span></div>
            <div class="note-box mt">全生命周期成本 = 初始投入 + (维护+备件+测试+风险)×年限 + 周期更换。模型为假设参数，非真实财务测算。</div>`, `<button class="btn" onclick="UI.closeModal()">关闭</button>`);
        }));
      }
      function drawReco() {
        const rec = recommend(), t = planTotal(rec), p = PLANS[rec];
        const all = Object.keys(PLANS).map(k => ({ k, total: planTotal(k).total, risk: planTotal(k).risk }));
        el.querySelector('#ups-reco').innerHTML = `
          <div class="concl"><h4>推荐方案 ${rec} · ${p.name}</h4>
            <p>在满足可靠性约束（风险成本≤1.0万/年）的方案中，${years}年全生命周期成本最低：<b>${t.total} 万元</b>。</p></div>
          <div class="sec-t">推荐理由（非仅按年限）</div>
          <div class="evi"><div class="evi-t small">${U.icon('check', 13)} 健康度</div><div class="evi-d small">平均容量健康度 ${health}%${healthAdj !== health ? '（本次评估取值 ' + healthAdj + '%）' : ''}，${badCells.length}节单体老化（#07/#12/#19），继续维护风险高。</div></div>
          <div class="evi"><div class="evi-t small">${U.icon('check', 13)} 重复维修</div><div class="evi-d small">近12月单体更换3次、累计维修成本9.6万元，持续维修经济性差。</div></div>
          <div class="evi"><div class="evi-t small">${U.icon('check', 13)} 成本与风险</div><div class="evi-d small">方案${rec}风险成本${t.risk}万/年，${years}年总成本${t.total}万，优于继续维护(A)的长期高风险。</div></div>
          <div class="sec-t">各方案总成本</div>
          ${all.sort((a, b) => a.total - b.total).map(x => `<div class="flex ai-center" style="padding:3px 0;font-size:12px"><span style="width:90px">${x.k} ${PLANS[x.k].name}</span><span style="flex:1;height:8px;background:var(--gray-bg);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${x.total / Math.max(...all.map(y => y.total)) * 100}%;background:${x.k === rec ? 'linear-gradient(90deg,#16a34a,#00b8d9)' : '#cbd5e1'}"></i></span><b style="width:64px;text-align:right" class="mono small">${x.total}万</b></div>`).join('')}
          <div class="note-box mt">本结论为示例测算，含模型假设，需结合核对性放电测试与现场核查确认，不构成采购/审批依据。</div>`;
      }
      function drawParams() {
        el.querySelector('#ups-params').innerHTML = `
          <div class="sec-t" style="margin-top:0">评估年限</div>
          <span class="btn-group" id="ups-years"><button class="seg ${years === 3 ? 'on' : ''}" data-v="3">3年</button><button class="seg ${years === 5 ? 'on' : ''}" data-v="5">5年</button><button class="seg ${years === 8 ? 'on' : ''}" data-v="8">8年</button></span>
          <div class="sec-t">整组更换成本 <b class="mono" id="ups-repl-v">${replCost}</b> 万</div>
          <input type="range" id="ups-repl" min="4" max="10" step="0.5" value="${replCost}" style="width:100%">
          <div class="sec-t">年维护成本系数 <b class="mono" id="ups-maint-v">${maintK}</b></div>
          <input type="range" id="ups-maint" min="0.5" max="2" step="0.1" value="${maintK}" style="width:100%">
          <div class="sec-t">健康度评估 <b class="mono" id="ups-health-v">${healthAdj}</b> %</div>
          <input type="range" id="ups-health" min="60" max="95" step="1" value="${healthAdj}" style="width:100%">
          <div class="note-box mt">调整参数实时联动成本模型与推荐。健康度越低，风险成本越高；维护系数影响年均维护支出。</div>`;
        segBind(el, '#ups-years', v => { years = +v; drawPlans(); drawCost(); drawReco(); });
        el.querySelector('#ups-repl').addEventListener('input', ev => { replCost = +ev.target.value; el.querySelector('#ups-repl-v').textContent = replCost; drawPlans(); drawCost(); drawReco(); });
        el.querySelector('#ups-maint').addEventListener('input', ev => { maintK = +ev.target.value; el.querySelector('#ups-maint-v').textContent = maintK; drawPlans(); drawCost(); drawReco(); });
        el.querySelector('#ups-health').addEventListener('input', ev => { healthAdj = +ev.target.value; el.querySelector('#ups-health-v').textContent = healthAdj; drawPlans(); drawCost(); drawReco(); });
      }
      function drawAll() { drawCells(); drawPlans(); drawCost(); drawReco(); drawParams(); }
      drawAll();
      el.querySelector('#ups-data').addEventListener('click', () => {
        const rs = D.costRecords.filter(r => r.asset === 'BAT-01');
        U.openDrawer('数据依据 · BAT-01', `
          <div class="flex ai-center mb">${U.demoBadge()} <b>蓄电池组数据依据</b></div>
          <div class="sec-t" style="margin-top:0">异常单体参数</div>
          <table class="tbl"><thead><tr><th>单体</th><th>电压V</th><th>内阻mΩ</th><th>温度℃</th><th>容量%</th></tr></thead><tbody>
          ${badCells.map(c => `<tr><td><b>#${pad(c.no)}</b></td><td style="color:#b91c1c">${c.voltage}</td><td>${c.resistance}</td><td>${c.temp}</td><td>${c.capacity}</td></tr>`).join('')}</tbody></table>
          <div class="sec-t">维修/成本历史</div>
          ${rs.map(r => `<div class="evi"><div class="evi-t"><span class="tag" style="background:${catColor(r.cat)}18;color:${catColor(r.cat)}">${catName(r.cat)}</span><span class="spacer" style="flex:1"></span><b>${r.amount} 万</b></div><div class="src">${r.desc} · ${r.month} · ${r.supplier}</div></div>`).join('')}
          <div class="note-box mt">数据来源：DS-04 电力监控系统（电池参数）+ DS-07 养护台账（维修记录）。近12月单体更换3次。</div>
          <button class="btn primary mt" onclick="UI.openDevice('BAT-01')">${U.icon('dev', 13)} 设备档案</button>`, true);
      });
      el.querySelector('#ups-summary').addEventListener('click', () => {
        const rec = recommend(), t = planTotal(rec);
        summaryModal('UPS蓄电池更新决策 · 摘要', `【设备】BAT-01 监控中心UPS蓄电池组（32节，2019-06投运，约${ageYears}年）
【健康状态】平均容量健康度${health}%，异常单体${badCells.length}节（#07/#12/#19：电压偏低/内阻↑35%/温度偏高）
【维修历史】近12月单体更换3次，累计维修成本9.6万元（重复维修预警）
【评估年限】${years}年 【整组更换成本】${replCost}万 【维护系数】${maintK} 【健康度】${healthAdj}%
【方案对比（全生命周期成本）】
${Object.keys(PLANS).map(k => '  ' + k + ' ' + PLANS[k].name + '：' + planTotal(k).total + '万（风险' + planTotal(k).risk + '万/年）').join('\n')}
【推荐方案】${rec} · ${PLANS[rec].name}，${years}年总成本${t.total}万元
【推荐理由】健康度下降+重复维修使继续维护风险高；推荐方案在满足可靠性约束（风险≤1.0万/年）下全生命周期成本最优。决策综合健康度/维修历史/成本，非仅按使用年限。
【边界说明】本页为示例测算，含模型假设（风险成本为故障期望损失），需结合核对性放电测试与现场核查确认，不构成采购/审批依据。`);
      });
    }
  };

  /* ================= 8.16 成效评价 ================= */
  P.kpi = {
    title: '成效评价 · 指标对比', group: '成本与决策', crumb: true,
    render(el, params) {
      const GROUPS = { all: '全部指标', data: '数据质量', diag: '诊断效率', field: '作业效率', cost: '能耗成本' };
      const GKEYS = { data: ['coverage', 'integrity'], diag: ['locate', 'accuracy'], field: ['mileage', 'perTrip'], cost: ['energy', 'cost'] };
      let group = 'all', period = 'month', sel = 'coverage';
      const kpis = () => group === 'all' ? D.kpis : D.kpis.filter(k => GKEYS[group].includes(k.key));
      const periodLabels = { month: D.costMonths, quarter: ['2025Q1', '2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q2'], year: ['2021', '2022', '2023', '2024', '2025', '2026'] };
      function change(k) {
        if (k.baseline == null) return { val: null, rate: null, improved: true };
        const val = +(k.current - k.baseline).toFixed(2);
        const rate = +(val / k.baseline * 100).toFixed(1);
        const improved = k.better === 'up' ? val > 0 : val < 0;
        return { val, rate, improved };
      }
      el.innerHTML = U.pageHead('成效评价 · 运维成效指标对比',
        '对比系统应用前后的关键运维指标，展示基线值与模拟变化值。指标含明确定义、口径与数据来源；能耗类指标按交通量/天气/季节归一化。本页为统计口径，不虚构考核目标。',
        `<button class="btn" id="kpi-caliber">${U.icon('diag', 14)} 指标口径说明</button>`, U.demoBadge('统计口径')) +
        `<div class="card mb"><div class="card-b">
          <div class="filter-bar" style="margin:0">
            <span class="fld" style="font-weight:600;color:var(--navy-800)">指标分组</span>
            <span class="pills" id="kpi-group">${Object.keys(GROUPS).map(g => `<span class="pill ${g === group ? 'on' : ''}" data-v="${g}">${GROUPS[g]}</span>`).join('')}</span>
            <span style="width:1px;height:24px;background:var(--line);margin:0 6px"></span>
            <span class="fld" style="font-weight:600;color:var(--navy-800)">统计周期</span>
            <span class="btn-group" id="kpi-period"><button class="seg on" data-v="month">月度</button><button class="seg" data-v="quarter">季度</button><button class="seg" data-v="year">年度</button></span>
          </div>
        </div></div>
        <div class="grid g-4 mb" id="kpi-cards"></div>
        <div class="flex">
          <div class="grow">
            <div class="card"><div class="card-h"><span class="card-t" id="kpi-trend-title">指标趋势</span><span class="sub" id="kpi-trend-sub"></span><span class="spacer"></span>${U.demoBadge('统计口径')}</div>
              <div class="card-b" id="kpi-trend"></div></div>
          </div>
          <div style="width:340px;flex:0 0 340px">
            <div class="card"><div class="card-h"><span class="card-t">指标定义与口径</span></div>
              <div class="card-b" id="kpi-def"></div></div>
          </div>
        </div>
        <div class="card mt"><div class="card-h"><span class="card-t">指标定义 / 数据来源 / 统计周期一览</span><span class="spacer"></span>${U.demoBadge()}</div>
          <div class="card-b tight" id="kpi-table"></div></div>`;
      function drawCards() {
        el.querySelector('#kpi-cards').innerHTML = kpis().map(k => {
          const c = change(k);
          const arrow = k.better === 'up' ? '↑' : '↓';
          const col = c.improved ? '#16a34a' : '#ef4444';
          return `<div class="card kpi" style="--kc:${col};cursor:pointer" data-kpi="${k.key}">
            <div class="kpi-label">${k.name}</div>
            <div class="kpi-val">${k.current}<small>${k.unit}</small></div>
            <div class="kpi-sub">${k.baseline == null ? '基线：—（新增指标）' : '基线 ' + k.baseline + k.unit} <b style="color:${col}">${c.val == null ? '' : arrow + Math.abs(c.val) + (c.rate != null ? ' (' + (c.rate > 0 ? '+' : '') + c.rate + '%)' : '')}</b></div>
            <div class="kpi-icon">${U.icon(k.key === 'energy' ? 'fan' : k.key === 'cost' ? 'cost' : k.key === 'mileage' || k.key === 'perTrip' ? 'task' : k.key === 'locate' || k.key === 'accuracy' ? 'diag' : 'db')}</div>
          </div>`;
        }).join('');
        el.querySelectorAll('[data-kpi]').forEach(x => x.addEventListener('click', () => { sel = x.dataset.kpi; drawTrend(); drawDef(); }));
      }
      function drawTrend() {
        const k = D.kpis.find(x => x.key === sel) || kpis()[0];
        sel = k.key;
        el.querySelector('#kpi-trend-title').textContent = k.name + ' · 趋势';
        el.querySelector('#kpi-trend-sub').textContent = GROUPS[group] + ' · ' + (period === 'month' ? '月度' : period === 'quarter' ? '季度' : '年度') + '';
        const labels = periodLabels[period];
        const series = [{ name: k.name, color: '#2f7bff', data: k.trend, unit: k.unit }];
        if (k.baseline != null) series.push({ name: '基线值', color: '#94a3b8', data: labels.map(() => k.baseline), unit: k.unit, dash: '6,4' });
        Charts.line(el.querySelector('#kpi-trend'), { labels, series, height: 280, yUnit: k.unit, area: true, legend: true, zero: k.better === 'down' });
        const c = change(k);
        el.querySelector('#kpi-trend').insertAdjacentHTML('beforeend', `<div class="note-box ${c.improved ? 'blue' : 'gray'} mt">${k.baseline == null ? '该指标为系统应用后新增统计，无历史基线，样本28例。' : '相对基线 ' + k.baseline + k.unit + '，模拟变化值 ' + k.current + k.unit + '（' + (c.val > 0 ? '+' : '') + c.val + '，' + (c.rate > 0 ? '+' : '') + c.rate + '%），' + (c.improved ? '成效向好' : '需关注') + '。'}${k.key === 'energy' ? ' 能耗按交通量、环境参数与运行时长归一化，剔除交通/天气/季节影响。' : ''}</div>`);
      }
      function drawDef() {
        const k = D.kpis.find(x => x.key === sel);
        const c = change(k);
        el.querySelector('#kpi-def').innerHTML = `
          <div class="flex ai-center mb"><b>${k.name}</b> <span class="tag ${c.improved ? 'ok' : 'warn'}">${k.better === 'up' ? '越高越好' : '越低越好'}</span></div>
          <div class="kv"><span class="k">当前值</span><span class="v"><b>${k.current} ${k.unit}</b></span>
          <span class="k">基线值</span><span class="v">${k.baseline == null ? '—（新增）' : k.baseline + ' ' + k.unit}</span>
          <span class="k">变化</span><span class="v" style="color:${c.improved ? '#15803d' : '#b91c1c'}">${c.val == null ? '—' : (c.val > 0 ? '+' : '') + c.val + ' ' + k.unit + '（' + (c.rate > 0 ? '+' : '') + c.rate + '%）'}</span>
          <span class="k">统计周期</span><span class="v">${period === 'month' ? '月度' : period === 'quarter' ? '季度' : '年度'}</span></div>
          <div class="sec-t">指标定义</div><p class="small" style="color:var(--text-2);line-height:1.75">${k.def}</p>
          <div class="sec-t">数据来源</div><p class="small" style="color:var(--text-2)">${k.src}</p>
          ${k.key === 'energy' ? '<div class="note-box blue mt">能耗指标控制交通量、天气、季节变量，按工况归一化后对比，避免单纯归因于系统。</div>' : ''}
          ${k.key === 'accuracy' ? '<div class="note-box mt">准确率基于现场确认正确的诊断案例（样本28例），非真实概率承诺。</div>' : ''}`;
      }
      function drawTable() {
        U.table(el.querySelector('#kpi-table'), {
          rows: kpis(), pageSize: 8, sortKey: 'name', sortDir: 1,
          cols: [
            { key: 'name', title: '指标', sortable: true, render: k => `<b>${k.name}</b>` },
            { key: 'unit', title: '单位' },
            { key: 'baseline', title: '基线值', cls: 'num', render: k => k.baseline == null ? '—' : k.baseline },
            { key: 'current', title: '模拟值', cls: 'num', render: k => '<b>' + k.current + '</b>' },
            { key: 'change', title: '变化率', cls: 'num', sortVal: k => change(k).rate || 0, render: k => { const c = change(k); return c.rate == null ? '—' : `<span style="color:${c.improved ? '#15803d' : '#b91c1c'}">${c.rate > 0 ? '+' : ''}${c.rate}%</span>`; } },
            { key: 'def', title: '定义/口径', render: k => `<span class="small muted">${k.def}</span>` },
            { key: 'src', title: '数据来源', render: k => `<span class="small">${k.src}</span>` }
          ], onRow: k => { sel = k.key; drawTrend(); drawDef(); }
        });
      }
      function drawAll() { drawCards(); drawTrend(); drawDef(); drawTable(); }
      drawAll();
      el.querySelectorAll('#kpi-group .pill').forEach(p => p.addEventListener('click', () => {
        el.querySelectorAll('#kpi-group .pill').forEach(x => x.classList.remove('on'));
        p.classList.add('on'); group = p.dataset.v;
        if (!kpis().find(k => k.key === sel)) sel = kpis()[0].key;
        drawAll();
      }));
      segBind(el, '#kpi-period', v => { period = v; drawTrend(); drawDef(); });
      el.querySelector('#kpi-caliber').addEventListener('click', () => {
        U.modal('成效指标口径说明', `
          <div class="note-box blue mb">本页指标为统计口径，展示系统应用前后的对比方法，不虚构考核目标值。基线为应用前模拟值，当前为应用后模拟值。</div>
          <table class="tbl"><thead><tr><th>指标</th><th>定义</th><th>来源</th></tr></thead><tbody>
          ${D.kpis.map(k => `<tr><td><b>${k.name}</b></td><td class="small">${k.def}</td><td class="small muted">${k.src}</td></tr>`).join('')}</tbody></table>
          <div class="note-box mt">能耗类指标按交通量/天气/季节归一化；诊断准确率基于现场确认案例（样本）；效率类指标口径与任务统筹页一致。统计周期支持月/季/年（模拟重采样）。</div>`,
          `<button class="btn" onclick="UI.closeModal()">关闭</button>`);
      });
    }
  };
})();