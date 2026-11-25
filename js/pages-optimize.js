/* ============================================================
 * 页面：风机运行优化 / 照明调光优化 / 现场作业统筹
 * 全部为模拟策略评估，仅做对比与估算，不下发任何真实控制指令
 * ============================================================ */
(function () {
  'use strict';
  const D = window.DB, P = window.Pages, U = window.UI;
  const NS = 'http://www.w3.org/2000/svg';
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function summaryModal(title, text) {
    U.modal(title, `<div class="note-box blue mb">以下为根据当前数据生成的策略分析摘要，可复制用于汇报。节能/效率为设定工况下的估算，非承诺值，不下发控制指令。</div>
      <pre id="sum-text" style="white-space:pre-wrap;font-family:var(--font);font-size:12px;line-height:1.85;background:#f6f8fa;border:1px solid var(--line);border-radius:7px;padding:12px 14px;color:var(--text)">${U.esc(text)}</pre>`,
      `<button class="btn" onclick="UI.closeModal()">关闭</button><button class="btn primary" onclick="UI.copy(document.getElementById('sum-text').textContent)">${U.icon('copy', 14)} 复制摘要</button>`);
  }
  function segBind(el, sel, cb) {
    el.querySelectorAll(sel + ' .seg').forEach(b => b.addEventListener('click', () => {
      el.querySelectorAll(sel + ' .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); cb(b.dataset.v);
    }));
  }

  /* ================= 8.11 场景8｜风机运行优化 ================= */
  P.fan = {
    title: '隧道风机运行优化', group: '运行优化', crumb: true,
    render(el, params) {
      if (params?.case === 'yunling-fan') return window.FanInvestment.render(el, false, params);
      const fans = ['JF-01', 'JF-02', 'JF-03', 'JF-04'];
      const PER = 30 * 0.86;
      const COND = {
        normal: { name: '正常通行', co: 12, vi: 18, traffic: 1400, cur: 4, desc: '交通量平稳，CO/VI 处于正常区间，存在风机运行组合优化空间。' },
        jam: { name: '交通阻滞', co: 30, vi: 38, traffic: 600, cur: 4, desc: '车辆怠速排队，CO/VI 上升，通风需求增大，安全优先，不建议减少运行风机。' },
        maint: { name: '养护维修', co: 8, vi: 12, traffic: 300, cur: 4, desc: '交通量低、检修道作业，通风需求小，可在保障安全前提下减少运行风机。' },
        emergency: { name: '应急工况', co: 55, vi: 60, traffic: 200, cur: 4, lock: true, desc: '火灾/应急工况由原控制系统按预案执行，本系统仅展示状态，不参与优化、不下发指令。' }
      };
      const HOURS = { dawn: { name: '凌晨', mult: 0.4 }, am: { name: '早高峰', mult: 1.3 }, day: { name: '日间', mult: 1.0 }, pm: { name: '晚高峰', mult: 1.4 }, night: { name: '夜间', mult: 0.6 } };
      let cond = 'normal', hour = 'day', strategy = 'sug';
      el.innerHTML = U.pageHead('青岭隧道北洞风机运行优化',
        '结合 CO/VI、交通量与风机功率，评估不同工况下的风机运行组合。对比当前策略与建议策略的用电量，设备启停由现场控制系统执行。',
        `<button class="btn" onclick="UI.go('gis',{mode:'bim'})">${U.icon('cube', 14)} BIM定位</button>
         <button class="btn" id="fan-investment" onclick="UI.go('fan',{case:'yunling-fan'})">风机改造投资测算</button>
         <button class="btn" id="fan-cons">${U.icon('check', 14)} 查看约束条件</button>
         <button class="btn primary" id="fan-summary">${U.icon('copy', 14)} 生成策略分析摘要</button>`, U.demoBadge('策略评估')) +
        `<div class="card mb"><div class="card-b">
          <div class="filter-bar" style="margin:0">
            <span class="fld" style="font-weight:600;color:var(--navy-800)">运行工况</span>
            <span class="btn-group" id="fan-cond">${Object.keys(COND).map(k => `<button class="seg ${k === cond ? 'on' : ''}" data-v="${k}">${COND[k].name}${COND[k].lock ? '（仅展示）' : ''}</button>`).join('')}</span>
            <label class="fld">时段 <select class="sel" id="fan-hour">${Object.keys(HOURS).map(k => `<option value="${k}" ${k === hour ? 'selected' : ''}>${HOURS[k].name}</option>`).join('')}</select></label>
            <span class="spacer" style="flex:1"></span>
            <span class="fld" style="font-weight:600;color:var(--navy-800)">策略对比</span>
            <span class="btn-group" id="fan-strategy"><button class="seg" data-v="cur">当前策略</button><button class="seg on" data-v="sug">建议策略</button></span>
          </div>
          <div class="note-box blue mt" id="fan-cond-desc"></div>
        </div></div>
        <div class="flex">
          <div style="width:250px;flex:0 0 250px">
            <div class="card"><div class="card-h"><span class="card-t">风机状态</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b tight" id="fan-cards"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">洞口轴流风机</span></div>
              <div class="card-b" id="fan-af"></div></div>
          </div>
          <div class="grow">
            <div class="card"><div class="card-h"><span class="card-t">环境与交通趋势</span><span class="sub" id="fan-trend-sub"></span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b"><div class="grid g-2">
                <div><div class="sec-t" style="margin-top:0">CO 浓度</div><div id="fan-co"></div></div>
                <div><div class="sec-t" style="margin-top:0">VI 能见度衰减</div><div id="fan-vi"></div></div>
                <div><div class="sec-t" style="margin-top:0">交通量</div><div id="fan-tr"></div></div>
                <div><div class="sec-t" style="margin-top:0">风机运行功率</div><div id="fan-pw"></div></div>
              </div></div></div>
          </div>
          <div style="width:320px;flex:0 0 320px">
            <div class="card"><div class="card-h"><span class="card-t">策略对比与节能估算</span><span class="spacer"></span>${U.demoBadge('模型估算')}</div>
              <div class="card-b" id="fan-strategy-panel"></div></div>
          </div>
        </div>
        <div class="card mt"><div class="card-h"><span class="card-t">安全约束条件</span><span class="sub">任何优化均不得突破以下约束</span><span class="spacer"></span>${U.demoBadge()}</div>
          <div class="card-b" id="fan-cons-box"></div></div>`;
      function calc() {
        const b = COND[cond], hm = HOURS[hour].mult;
        const co = Math.round(b.co * hm), vi = Math.round(b.vi * hm), traffic = Math.round(b.traffic * hm);
        let sug = b.lock ? b.cur : (co >= 25 || vi >= 35) ? 4 : (co <= 10 && vi <= 15) ? 2 : 3;
        sug = clamp(sug, 1, 4);
        const runCur = b.cur, runSug = sug;
        const powCur = +(runCur * PER).toFixed(1), powSug = +(runSug * PER).toFixed(1);
        const saving = runCur ? +((runCur - runSug) / runCur * 100).toFixed(1) : 0;
        return { b, co, vi, traffic, runCur, runSug, powCur, powSug, saving, run: strategy === 'cur' ? runCur : runSug };
      }
      function drawCards(c) {
        el.querySelector('#fan-cards').innerHTML = fans.map((code, i) => {
          const d = D.byCode[code], running = i < c.run;
          return `<div class="evi" style="cursor:pointer;margin:6px 4px;${running ? 'border-color:#bfe9f2;background:#f0fbfd' : 'opacity:.85'}" onclick="UI.openDevice('${code}')">
            <div class="evi-t"><span class="tag ${running ? 'ok' : 'plain'}">${running ? '运行' : '备用'}</span><span class="mono">${code}</span><span class="spacer" style="flex:1"></span><b class="small">${running ? PER.toFixed(1) : '0'} kW</b></div>
            <div class="src">${d.name} · 额定30kW · 振动 ${(2.0 + i * 0.1).toFixed(1)}mm/s · 累计 ${(d.runHours / 1000).toFixed(1)}千h</div>
          </div>`;
        }).join('');
        const af = D.byCode['AF-01'];
        el.querySelector('#fan-af').innerHTML = `<div class="evi" style="cursor:pointer" onclick="UI.openDevice('AF-01')"><div class="evi-t"><span class="tag plain">备用</span><span class="mono">AF-01</span></div><div class="src">${af.name} · 额定90kW · 洞口轴流，正常工况备用，应急/阻滞时按需投入</div></div>`;
      }
      function drawCharts(c) {
        el.querySelector('#fan-trend-sub').textContent = c.b.name + ' · ' + HOURS[hour].name + '（设定工况）';
        const seed = cond + hour, lb = D.hoursAxis(24, 1);
        Charts.line(el.querySelector('#fan-co'), { labels: lb, series: [{ name: 'CO浓度', color: '#2f7bff', data: D.series(seed + 'co', 24, c.co, c.co * 0.25, { daily: true, cycles: 2 }), unit: 'ppm' }], height: 150, yUnit: 'ppm', zero: true, area: true, legend: false, threshold: 150, thresholdLabel: '约束150ppm' });
        Charts.line(el.querySelector('#fan-vi'), { labels: lb, series: [{ name: 'VI衰减', color: '#8b5cf6', data: D.series(seed + 'vi', 24, c.vi, c.vi * 0.25, { daily: true, cycles: 2 }), unit: '%' }], height: 150, yUnit: '%', zero: true, area: true, legend: false });
        Charts.line(el.querySelector('#fan-tr'), { labels: lb, series: [{ name: '交通量', color: '#00b8d9', data: D.series(seed + 'tr', 24, c.traffic, c.traffic * 0.3, { daily: true, cycles: 2 }), unit: '辆/h' }], height: 150, yUnit: '辆/h', zero: true, area: true, legend: false });
        Charts.line(el.querySelector('#fan-pw'), { labels: lb, series: [
          { name: '当前策略', color: '#94a3b8', data: D.series(seed + 'pc', 24, c.powCur, 2, { daily: true }), unit: 'kW', dash: '5,4' },
          { name: '建议策略', color: '#16a34a', data: D.series(seed + 'ps', 24, c.powSug, 2, { daily: true }), unit: 'kW' }
        ], height: 150, yUnit: 'kW', zero: true, legend: true });
      }
      function drawStrategy(c) {
        el.querySelector('#fan-cond-desc').innerHTML = `<b>${c.b.name}：</b>${c.b.desc}` + (c.b.lock ? ' <b style="color:#b91c1c">应急工况不参与优化。</b>' : '');
        const combo = n => fans.slice(0, n).join(' / ') + (n < 4 ? '（' + fans.slice(n).join(' / ') + ' 备用）' : '（全部运行）');
        el.querySelector('#fan-strategy-panel').innerHTML = `
          <div class="grid g-2" style="gap:9px">
            <div class="dp-kpi" style="background:${strategy === 'cur' ? 'rgba(0,184,217,.16)' : '#f6f8fa'};border-color:${strategy === 'cur' ? 'var(--cyan)' : 'var(--line)'}">
              <div class="l" style="color:${strategy === 'cur' ? '#7ee7fa' : 'var(--text-3)'}">当前策略</div>
              <div class="v" style="font-size:17px;color:${strategy === 'cur' ? '#fff' : 'var(--navy-800)'}">${c.runCur} 台运行</div>
              <div class="small" style="color:${strategy === 'cur' ? '#9fb4d0' : 'var(--text-3)'}">${c.powCur} kW</div></div>
            <div class="dp-kpi" style="background:${strategy === 'sug' ? 'rgba(22,163,74,.16)' : '#f6f8fa'};border-color:${strategy === 'sug' ? 'var(--green)' : 'var(--line)'}">
              <div class="l" style="color:${strategy === 'sug' ? '#86efac' : 'var(--text-3)'}">建议策略</div>
              <div class="v" style="font-size:17px;color:${strategy === 'sug' ? '#fff' : 'var(--navy-800)'}">${c.runSug} 台运行</div>
              <div class="small" style="color:${strategy === 'sug' ? '#9fb4d0' : 'var(--text-3)'}">${c.powSug} kW</div></div>
          </div>
          <div class="sec-t">运行组合（${strategy === 'cur' ? '当前' : '建议'}）</div>
          <p class="small" style="color:var(--text-2);line-height:1.7">${combo(c.run)}</p>
          <div class="sec-t">节能估算</div>
          <div class="concl"><h4 style="font-size:22px;color:${c.saving > 0 ? '#15803d' : 'var(--navy-800)'}">${c.saving > 0 ? '↓ ' + c.saving + '%' : '0%（安全优先）'}</h4>
            <p>${c.saving > 0 ? '相对当前策略，建议策略减少 ' + (c.runCur - c.runSug) + ' 台运行风机，设定工况下功率由 ' + c.powCur + 'kW 降至 ' + c.powSug + 'kW。' : '当前工况通风需求高或应急锁定，不建议减少运行风机，节能空间为 0。'}</p></div>
          <div class="score-bar"><i style="width:${c.saving}%;background:linear-gradient(90deg,#16a34a,#00b8d9)"></i></div>
          <div class="note-box mt">估算假设：工况=${c.b.name}，时段=${HOURS[hour].name}，CO≈${c.co}ppm、VI≈${c.vi}%、交通量≈${c.traffic}辆/h，单台运行功率按额定86%计。结果为设定工况下的估算，受交通/天气/季节影响，非固定承诺节能值。</div>
          ${c.b.lock ? '<div class="note-box mt" style="color:#b91c1c;background:#fef2f2;border-color:#f3c0c0">应急工况：风机由原控制系统按应急预案执行，本系统仅展示，不生成优化指令。</div>' : ''}`;
      }
      const CONS = [
        ['CO 浓度约束', '隧道内 CO ≤ 150ppm（正常运营），阻滞工况 ≤ 200ppm 短时', 'COVI-01/02'],
        ['VI 能见度约束', '烟雾浓度 VI 衰减率 ≤ 规范限值，保障停车视距', 'COVI-01/02'],
        ['风速约束', '隧道内风速 ≤ 10m/s，避免行车侧风风险', '风速检测'],
        ['检修道作业', '养护维修工况需封闭北洞检修道，风机组合配合交通管制', 'FT-01 任务'],
        ['应急优先', '火灾/应急工况由原控制系统执行，优化策略自动让位', '应急预案'],
        ['风机轮换', '建议策略考虑累计运行时长均衡，避免单台过度磨损', 'JF-01~04 运行时长']
      ];
      el.querySelector('#fan-cons-box').innerHTML = `<div class="grid g-3">${CONS.map(([t, x, s]) => `<div class="evi"><div class="evi-t small">${U.icon('check', 13)} ${t}</div><div class="evi-d small">${x}</div><div class="src">数据来源：${s}</div></div>`).join('')}</div>`;
      function drawAll() { const c = calc(); drawCards(c); drawCharts(c); drawStrategy(c); }
      drawAll();
      segBind(el, '#fan-cond', v => { cond = v; drawAll(); });
      el.querySelector('#fan-hour').addEventListener('change', ev => { hour = ev.target.value; drawAll(); });
      segBind(el, '#fan-strategy', v => { strategy = v; drawAll(); });
      el.querySelector('#fan-cons').addEventListener('click', () => {
        U.modal('风机优化安全约束条件', `<div class="note-box blue mb">风机运行优化必须以安全约束为前提。任何建议策略不得突破下列约束；应急工况由原控制系统执行。</div>
          <table class="tbl"><thead><tr><th>约束项</th><th>要求</th><th>数据来源</th></tr></thead><tbody>
          ${CONS.map(([t, x, s]) => `<tr><td><b>${t}</b></td><td>${x}</td><td class="small muted">${s}</td></tr>`).join('')}</tbody></table>`,
          `<button class="btn" onclick="UI.closeModal()">关闭</button>`);
      });
      el.querySelector('#fan-summary').addEventListener('click', () => {
        const c = calc();
        summaryModal('风机运行优化 · 策略分析摘要', `【场景】青岭隧道北洞射流风机 JF-01~04（额定30kW×4）
【工况】${c.b.name} · 时段 ${HOURS[hour].name}（设定工况）
【环境参数】CO≈${c.co}ppm，VI≈${c.vi}%，交通量≈${c.traffic}辆/h
【当前策略】${c.runCur}台运行，功率${c.powCur}kW，组合 ${fans.slice(0, c.runCur).join('/')}
【建议策略】${c.runSug}台运行，功率${c.powSug}kW，组合 ${fans.slice(0, c.runSug).join('/')}${c.runSug < 4 ? '，备用 ' + fans.slice(c.runSug).join('/') : ''}
【节能估算】${c.saving}%（功率差 ${(c.powCur - c.powSug).toFixed(1)}kW）
【估算假设】单台运行功率按额定86%计；节能受交通量/天气/季节影响，为设定工况下的估算，非固定承诺值。
【安全约束】CO≤150ppm、VI≤规范限值、风速≤10m/s、检修道作业配合交通管制、应急优先、风机轮换均衡。
【边界说明】本页为策略评估，仅做对比与估算，设备启停由现场控制系统执行；应急工况由原控制系统按预案执行。`);
      });
    }
  };

  /* ================= 8.12 场景9｜照明调光优化 ================= */
  P.light = {
    title: '隧道照明调光优化', group: '运行优化', crumb: true,
    renderEconomicCase(el, verification, params) {
      // Standalone Yunling lighting fixture. The main tunnel's power chart uses relative units.
      const sunny = params.weather !== 'cloud', busy = params.flow !== 'low';
      const round1 = n => Math.round(n * 10) / 10;
      const num = n => n.toLocaleString('zh-CN', {maximumFractionDigits: 2});
      const capital = 32000, price = 0.85, days = 300;
      const base = round1((busy ? 510 : 465) * (sunny ? 1 : .92));
      const reference = sunny ? (busy ? 438 : 369) : (busy ? 361 : 300);
      const floors = [sunny ? .78 : .58, busy ? .67 : .52, .48];
      const requests = [(sunny ? .91 : .73) * (busy ? 1 : .88), (sunny ? .79 : .62) * (busy ? 1 : .9), busy ? .64 : .53];
      const targets = requests.map((v,i) => Math.round(100 * Math.max(v, floors[i])));
      const weights = [.45, .30, .25];
      const predicted = round1(base * targets.reduce((total, t, i) => total + t / 100 * weights[i], 0));
      const savings = use => {
        const daily = round1(base - use);
        const annualEnergy = daily * days, annualRevenue = annualEnergy * price;
        return {daily, annualEnergy, annualRevenue, years:capital / annualRevenue};
      };
      const model = savings(predicted), meter = savings(reference);
      const route = verification ? 'kpi' : 'light';
      const jump = dest => U.go(dest, {case:'yunling', weather:el.querySelector('#yl-weather').value, flow:el.querySelector('#yl-flow').value});
      const row = (label, m, v) => `<tr><th scope="row">${label}</th><td>${m}</td><td>${v}</td></tr>`;
      el.innerHTML = U.pageHead(verification ? '照明成效核验 · 分区智能调光' : '照明策略测算 · 分区智能调光',
        '云岭隧道 K12 · 路维智策专项测算。按同一工况、照明范围和 24 小时统计周期核算。表计核验采用内置参考读数。',
        `<button class="btn" onclick="UI.go('${route}')">${verification ? '返回成效评价' : '返回青岭照明策略'}</button>
         <button class="btn primary" id="yl-switch">${verification ? '查看同方案策略测算' : '查看同方案表计核验'}</button>`, U.demoBadge('专项分析')) +
        `<div class="card mb"><div class="card-b filter-bar">
          <label class="fld">天气 <select class="sel" id="yl-weather"><option value="sun" ${sunny ? 'selected' : ''}>晴天</option><option value="cloud" ${sunny ? '' : 'selected'}>阴天</option></select></label>
          <label class="fld">车流 <select class="sel" id="yl-flow"><option value="high" ${busy ? 'selected' : ''}>峰时</option><option value="low" ${busy ? '' : 'selected'}>低流量</option></select></label>
          <span class="small muted">洞外亮度 ${sunny ? '4,800' : '1,650'} cd/m² · 交通量 ${busy ? '980' : '280'} 辆/小时</span>
        </div></div>
        <div class="grid g-4 mb">${U.kpi('校正基线电量', num(base), '同工况 · 日电量', '#2f7bff', null, 'bulb', 'kWh')}
          ${U.kpi(verification ? '分项参考表计' : '模型预计用电', num(verification ? reference : predicted), '照明回路 · 日电量', '#00a5bf', null, 'bulb', 'kWh')}
          ${U.kpi(verification ? '按表计折算年收益' : '模型预计年收益', num(verification ? meter.annualRevenue : model.annualRevenue), '年等效运行 ' + days + ' 天', '#15803d', null, 'cost', '元')}
          ${U.kpi(verification ? '表计口径回收期' : '模型预计回收期', (verification ? meter.years : model.years).toFixed(2), '静态投资回收期', '#8054b2', null, 'cost', '年')}</div>
        <div class="grid g-2"><section class="card"><div class="card-h"><span class="card-t">${verification ? '模型预计与表计核验' : '分区负荷与改造投资'}</span></div><div class="card-b">
          ${verification ? `<table class="tbl"><thead><tr><th>核算项目</th><th>模型预计</th><th>参考表计</th></tr></thead><tbody>
          ${row('日用电量（kWh）', num(predicted), num(reference))}
          ${row('日节电量（kWh）', num(model.daily), num(meter.daily))}
          ${row('折算年节电量（kWh）', num(model.annualEnergy), num(meter.annualEnergy))}
          ${row('折算年收益（元）', num(model.annualRevenue), num(meter.annualRevenue))}
          ${row('静态回收期（年）', model.years.toFixed(2), meter.years.toFixed(2))}</tbody></table>`
          : `<table class="tbl"><thead><tr><th>照明分区</th><th>用电权重</th><th>设定负荷下限</th><th>策略负荷</th></tr></thead><tbody>
          ${['入口段','过渡段','中间段'].map((name,i) => `<tr><th scope="row">${name}</th><td>${weights[i] * 100}%</td><td>${Math.round(floors[i]*100)}%</td><td>${targets[i]}%</td></tr>`).join('')}</tbody></table>
          <p class="small muted mt">预计用电 = 校正基线 × 各分区加权负荷。设定下限用于模型演算，实际调光需复核亮度和均匀度，应急照明单独运行。</p>`}
          <div class="note-box blue mt">改造投入 ${num(capital)} 元 · 电价 ${price} 元/kWh · 年等效运行 ${days} 天。全年收益按当前样本日折算。</div>
        </div></section><section class="card"><div class="card-h"><span class="card-t">${verification ? '节电量与收益核算' : '节电收益测算'}</span></div><div class="card-b">
          <div class="concl"><h4>${verification ? '参考表计' : '策略模型'}每日节电 ${num(verification ? meter.daily : model.daily)} kWh</h4>
          <p>工况校正基线 ${num(base)} − ${verification ? '参考表计' : '模型预计'}用电 ${num(verification ? reference : predicted)} = ${num(verification ? meter.daily : model.daily)} kWh。</p></div>
          <div class="kv mt"><span class="k">折算年收益</span><span class="v">${num(verification ? meter.daily : model.daily)} × ${days} × ${price} = <b>${num(verification ? meter.annualRevenue : model.annualRevenue)} 元</b></span>
          <span class="k">静态回收期</span><span class="v">${num(capital)} ÷ ${num(verification ? meter.annualRevenue : model.annualRevenue)} ≈ <b>${(verification ? meter.years : model.years).toFixed(2)} 年</b></span></div>
          <p class="small muted mt">${verification ? '多项措施同期实施时，若缺少各措施的独立分项表计，只列组合收益。' : '校正基线按晴天 / 阴天、峰时 / 低流量取同类工况。静态回收期只计节电收益。'}</p>
        </div></section></div>`;
      el.querySelector('#yl-switch').addEventListener('click', () => jump(verification ? 'light' : 'kpi'));
      el.querySelectorAll('#yl-flow, #yl-weather').forEach(select => select.addEventListener('change', () => jump(route)));
    },
    render(el, params) {
      if (params?.case === 'yunling') return this.renderEconomicCase(el, false, params);
      const ZONES = [
        { id: '入口段1', w: 1.2, lamps: 24 }, { id: '入口段2', w: 1.0, lamps: 20 },
        { id: '过渡段1', w: 0.9, lamps: 18 }, { id: '过渡段2', w: 0.8, lamps: 16 },
        { id: '中间段', w: 1.5, lamps: 60 }, { id: '出口段', w: 0.9, lamps: 20 }
      ];
      const CUR = [100, 90, 75, 60, 50, 80];
      let L20 = 3000, traffic = 1200, strategy = 'rec', selZone = 0;
      const saved = (() => { try { return JSON.parse(localStorage.getItem('demo-light-plan') || 'null'); } catch (e) { return null; } })();
      function rec() {
        const e1 = clamp(60 + L20 / 6000 * 40, 60, 100);
        const mid = traffic < 600 ? 35 : traffic < 1200 ? 45 : 50;
        return [Math.round(e1), Math.round(e1 * 0.85), Math.round(55 + traffic / 2000 * 15), Math.round(45 + traffic / 2000 * 15), mid, Math.round(70 + L20 / 6000 * 15)];
      }
      function energy(r) {
        const curP = ZONES.reduce((a, z, i) => a + CUR[i] * z.w, 0);
        const recP = ZONES.reduce((a, z, i) => a + r[i] * z.w, 0);
        return { curP: +curP.toFixed(0), recP: +recP.toFixed(0), saving: +((curP - recP) / curP * 100).toFixed(1) };
      }
      el.innerHTML = U.pageHead('青岭隧道照明调光优化',
        '按入口段/过渡段/中间段分区，结合洞外亮度与交通量评估调光策略。本页为策略评估，遵循《公路隧道照明设计细则》，方案保存在当前浏览器，供现场复核。',
        `<button class="btn" onclick="UI.go('gis',{mode:'bim'})">${U.icon('cube', 14)} BIM定位</button>
         <button class="btn" onclick="UI.go('light',{case:'yunling'})">照明改造投资测算</button>
         <button class="btn" id="lt-explain">${U.icon('diag', 14)} 策略说明</button>
         <button class="btn primary" id="lt-save">${U.icon('check', 14)} 保存方案</button>`, U.demoBadge('策略评估')) +
        `<div class="card mb"><div class="card-b">
          <div class="filter-bar" style="margin:0;align-items:center">
            <span class="fld" style="font-weight:600;color:var(--navy-800)">策略对比</span>
            <span class="btn-group" id="lt-strategy"><button class="seg" data-v="cur">当前调光</button><button class="seg on" data-v="rec">建议调光</button></span>
            <span style="width:1px;height:24px;background:var(--line);margin:0 6px"></span>
            <label class="fld" style="min-width:230px">设定洞外亮度 L20 <input type="range" id="lt-l20" min="1000" max="6000" step="100" value="${L20}" style="flex:1"> <b class="mono" id="lt-l20-v">${L20}</b> cd/m²</label>
            <label class="fld" style="min-width:210px">设定交通量 <input type="range" id="lt-tr" min="200" max="2000" step="50" value="${traffic}" style="flex:1"> <b class="mono" id="lt-tr-v">${traffic}</b> 辆/h</label>
            <span class="spacer" style="flex:1"></span>
            <span id="lt-saved-badge">${saved ? '<span class="tag ok">已保存方案</span>' : ''}</span>
          </div>
        </div></div>
        <div class="flex">
          <div style="width:300px;flex:0 0 300px">
            <div class="card"><div class="card-h"><span class="card-t">隧道照明分区</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="lt-zones"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">分区详情</span></div>
              <div class="card-b" id="lt-zone-detail"></div></div>
          </div>
          <div class="grow">
            <div class="card"><div class="card-h"><span class="card-t">环境与交通趋势</span><span class="sub">设定工况 · 随滑杆联动</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b"><div class="grid g-2">
                <div><div class="sec-t" style="margin-top:0">洞外亮度 L20</div><div id="lt-brt"></div></div>
                <div><div class="sec-t" style="margin-top:0">交通量</div><div id="lt-trc"></div></div>
              </div>
              <div class="sec-t">照明功率对比（当前 vs 建议）</div><div id="lt-pw"></div></div></div>
          </div>
          <div style="width:320px;flex:0 0 320px">
            <div class="card"><div class="card-h"><span class="card-t">调光策略与节能估算</span><span class="spacer"></span>${U.demoBadge('模型估算')}</div>
              <div class="card-b" id="lt-panel"></div></div>
          </div>
        </div>
        <div class="card mt"><div class="card-h"><span class="card-t">调光约束与规范</span><span class="spacer"></span>${U.demoBadge()}</div>
          <div class="card-b" id="lt-cons"></div></div>`;
      function drawZones(r) {
        const vals = strategy === 'cur' ? CUR : r;
        el.querySelector('#lt-zones').innerHTML = `<div class="small muted mb">青岭隧道北洞 · 入口 → 出口（亮度随${strategy === 'cur' ? '当前' : '建议'}调光等级变化）</div>
          <div style="display:flex;gap:3px;align-items:flex-end;height:120px;padding:8px;background:#0a1c38;border-radius:7px;border:1px solid var(--line-dark)">
          ${ZONES.map((z, i) => {
            const h = 30 + vals[i] * 0.7;
            return `<div data-lz="${i}" style="flex:1;cursor:pointer;text-align:center">
              <div style="height:${h}px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,rgba(255,210,138,${0.25 + vals[i] / 130}),rgba(255,180,80,.12));border:1px solid ${i === selZone ? '#00b8d9' : 'rgba(255,210,138,.3)'};border-bottom:none;position:relative">
                <span style="position:absolute;top:-16px;left:0;right:0;font-size:9px;color:#ffd28a">${vals[i]}%</span></div>
              <div class="small" style="margin-top:4px;color:${i === selZone ? '#7ee7fa' : '#9fb4d0'};font-size:9px;writing-mode:horizontal-tb">${z.id}</div>
            </div>`;
          }).join('')}</div>
          <div class="legend mt"><span class="li"><span class="cd" style="background:#ffd28a"></span>调光等级（亮度示意）</span></div>
          <div class="note-box mt">点击分区查看灯具数、回路、当前与建议调光等级。入口段亮度随洞外亮度 L20 变化，中间段随交通量调整。</div>`;
        el.querySelectorAll('[data-lz]').forEach(z => z.addEventListener('click', () => { selZone = +z.dataset.lz; drawZones(r); drawZoneDetail(r); }));
      }
      function drawZoneDetail(r) {
        const z = ZONES[selZone];
        el.querySelector('#lt-zone-detail').innerHTML = `
          <div class="flex ai-center mb"><b>${z.id}</b> <span class="tag info">${z.lamps} 盏灯具</span></div>
          <div class="kv">
            <span class="k">当前调光</span><span class="v">${CUR[selZone]}%</span>
            <span class="k">建议调光</span><span class="v"><b style="color:${r[selZone] < CUR[selZone] ? '#15803d' : 'var(--navy-800)'}">${r[selZone]}%</b> ${r[selZone] < CUR[selZone] ? '↓' + (CUR[selZone] - r[selZone]) + '%' : r[selZone] > CUR[selZone] ? '↑' + (r[selZone] - CUR[selZone]) + '%' : '持平'}</span>
            <span class="k">功率权重</span><span class="v">${z.w}（相对）</span>
            <span class="k">关联回路</span><span class="v mono">${selZone === 4 ? 'L-CIR-03 等' : 'L-CIR-0' + (selZone + 1)}</span>
            <span class="k">控制器</span><span class="v mono"><a onclick="UI.openDevice('LC-01')">LC-01</a></span>
          </div>
          <div class="note-box ${selZone < 2 ? 'blue' : 'gray'} mt">${selZone < 2 ? '入口段：亮度需与洞外亮度 L20 匹配，保障驶入适应，不建议过度调低。' : selZone === 4 ? '中间段：长度最长、灯具最多，低交通量时段调光节能空间最大，但不得低于规范最低照度。' : '过渡段/出口段：按亮度适应曲线逐级过渡，保障驶出适应。'}</div>`;
      }
      function drawCharts(r, en) {
        const lb = D.hoursAxis(24, 1);
        Charts.line(el.querySelector('#lt-brt'), { labels: lb, series: [{ name: '洞外亮度', color: '#f59e0b', data: D.series('ltbrt' + L20, 24, L20, L20 * 0.4, { daily: true, cycles: 1 }), unit: 'cd/m²' }], height: 150, yUnit: 'cd/m²', zero: true, area: true, legend: false });
        Charts.line(el.querySelector('#lt-trc'), { labels: lb, series: [{ name: '交通量', color: '#00b8d9', data: D.series('lttr' + traffic, 24, traffic, traffic * 0.3, { daily: true, cycles: 2 }), unit: '辆/h' }], height: 150, yUnit: '辆/h', zero: true, area: true, legend: false });
        Charts.line(el.querySelector('#lt-pw'), { labels: lb, series: [
          { name: '当前调光功率', color: '#94a3b8', data: D.series('ltpc' + L20 + traffic, 24, en.curP, en.curP * 0.05, { daily: true }), unit: 'kW(相对)', dash: '5,4' },
          { name: '建议调光功率', color: '#16a34a', data: D.series('ltpr' + L20 + traffic, 24, en.recP, en.recP * 0.05, { daily: true }), unit: 'kW(相对)' }
        ], height: 160, yUnit: 'kW(相对)', zero: true, legend: true });
      }
      function drawPanel(r, en) {
        el.querySelector('#lt-panel').innerHTML = `
          <div class="grid g-2" style="gap:9px">
            <div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">当前功率(相对)</div><div class="v" style="font-size:17px;color:var(--navy-800)">${en.curP}</div></div>
            <div class="dp-kpi" style="background:rgba(22,163,74,.14);border-color:var(--green)"><div class="l" style="color:#86efac">建议功率(相对)</div><div class="v" style="font-size:17px;color:#fff">${en.recP}</div></div>
          </div>
          <div class="sec-t">分区调光等级（建议）</div>
          ${ZONES.map((z, i) => `<div class="flex ai-center" style="padding:3px 0;font-size:12px"><span style="width:64px;color:var(--text-2)">${z.id}</span>
            <span style="flex:1;height:8px;background:var(--gray-bg);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${r[i]}%;background:linear-gradient(90deg,#f59e0b,#ffd28a)"></i></span>
            <b style="width:74px;text-align:right" class="mono small">${CUR[i]}%→${r[i]}%</b></div>`).join('')}
          <div class="sec-t">节能估算</div>
          <div class="concl"><h4 style="font-size:22px;color:#15803d">↓ ${en.saving}%</h4><p>相对当前调光，建议策略在保障入口/出口亮度适应与中间段最低照度前提下，设定工况下照明功率由 ${en.curP} 降至 ${en.recP}（相对值）。</p></div>
          <div class="score-bar"><i style="width:${en.saving}%;background:linear-gradient(90deg,#16a34a,#f59e0b)"></i></div>
          <div class="note-box mt">估算假设：洞外亮度 L20=${L20}cd/m²，交通量=${traffic}辆/h；功率为分区相对值，非实测电量。节能受交通/天气/季节影响，为模型估算，非承诺值。应急照明不参与调光。</div>
          <div class="divider"></div>
          <div class="flex wrap">
            <button class="btn sm" id="lt-restore" ${saved ? '' : 'disabled'}>${U.icon('reset', 13)} 恢复已存方案</button>
            <button class="btn sm" onclick="UI.go('scene-lighting')">${U.icon('bulb', 13)} 照明异常诊断</button>
          </div>`;
        const rb = el.querySelector('#lt-restore');
        rb && rb.addEventListener('click', () => {
          if (!saved) return;
          L20 = saved.L20; traffic = saved.traffic;
          el.querySelector('#lt-l20').value = L20; el.querySelector('#lt-tr').value = traffic;
          el.querySelector('#lt-l20-v').textContent = L20; el.querySelector('#lt-tr-v').textContent = traffic;
          drawAll(); U.toast('已恢复本地方案', 'ok');
        });
      }
      const CONS = [
        ['入口段亮度适应', '入口段亮度与洞外亮度 L20 匹配，保障驶入暗适应，不可过度调低', 'JTG/T D70/2-01—2014'],
        ['中间段最低照度', '中间段调光不得低于规范最低照度/亮度要求，保障基本行车安全', 'JTG/T D70/2-01—2014'],
        ['过渡段逐级过渡', '过渡段按亮度适应曲线逐级递减，避免亮度突变', '设计细则'],
        ['应急照明不调光', '应急照明、疏散指示独立回路，不参与调光优化', '应急预案'],
        ['调光范围限制', '调光等级限制在灯具允许范围（30%—100%），保护驱动电源', '灯具规格']
      ];
      el.querySelector('#lt-cons').innerHTML = `<div class="grid g-3">${CONS.map(([t, x, s]) => `<div class="evi"><div class="evi-t small">${U.icon('check', 13)} ${t}</div><div class="evi-d small">${x}</div><div class="src">依据：${s}</div></div>`).join('')}</div>
        <div class="note-box mt">调光方案依据照明设计细则评估，保存在当前浏览器。设备调光按现场流程执行。</div>`;
      function drawAll() { const r = rec(), en = energy(r); drawZones(r); drawZoneDetail(r); drawCharts(r, en); drawPanel(r, en); }
      drawAll();
      segBind(el, '#lt-strategy', v => { strategy = v; drawAll(); });
      el.querySelector('#lt-l20').addEventListener('input', ev => { L20 = +ev.target.value; el.querySelector('#lt-l20-v').textContent = L20; drawAll(); });
      el.querySelector('#lt-tr').addEventListener('input', ev => { traffic = +ev.target.value; el.querySelector('#lt-tr-v').textContent = traffic; drawAll(); });
      el.querySelector('#lt-save').addEventListener('click', () => {
        const r = rec(), en = energy(r);
        const plan = { L20, traffic, zones: ZONES.map((z, i) => ({ zone: z.id, cur: CUR[i], rec: r[i] })), saving: en.saving, time: D.fmtTime(D.NOW, 'full') };
        localStorage.setItem('demo-light-plan', JSON.stringify(plan));
        el.querySelector('#lt-saved-badge').innerHTML = '<span class="tag ok">已保存方案</span>';
        drawAll();
        U.toast('方案已保存到本地（不下发）', 'ok');
      });
      el.querySelector('#lt-explain').addEventListener('click', () => {
        const r = rec(), en = energy(r);
        U.modal('照明调光策略说明', `
          <div class="note-box blue mb">本策略为方案评估，依据《公路隧道照明设计细则》JTG/T D70/2-01—2014 的亮度适应原则，结合洞外亮度与交通量估算分区调光等级。设备参数仅用于策略试算。</div>
          <div class="sec-t">调光模型</div>
          <div class="kv"><span class="k">入口段1</span><span class="v">60% + L20/6000×40%（随洞外亮度，60—100%）</span>
          <span class="k">入口段2</span><span class="v">入口段1 × 0.85（逐级过渡）</span>
          <span class="k">过渡段</span><span class="v">55%/45% + 交通量/2000×15%</span>
          <span class="k">中间段</span><span class="v">交通量&lt;600→35%；&lt;1200→45%；否则50%（不低于规范最低）</span>
          <span class="k">出口段</span><span class="v">70% + L20/6000×15%（保障驶出适应）</span></div>
          <div class="sec-t">当前工况</div>
          <p class="small" style="color:var(--text-2);line-height:1.8">L20=${L20}cd/m²，交通量=${traffic}辆/h；建议节能估算 ${en.saving}%（相对功率 ${en.curP}→${en.recP}）。功率为分区相对值，非实测电量；节能受交通/天气/季节影响，为模型估算。</p>
          <div class="note-box mt">应急照明与疏散指示独立回路，不参与调光。调光等级限制在灯具允许范围。保存方案仅写入本地 localStorage。</div>`,
          `<button class="btn" onclick="UI.closeModal()">关闭</button>`);
      });
    }
  };

  /* ================= 8.13 场景10｜现场作业统筹 ================= */
  const FAMILY = { '机电检测·中级': '机电', '电工作业·高压证': '电工', '通信维护·光缆证': '通信' };
  const TEAM_SKILL = { 'TM-A': ['机电', '电工'], 'TM-B': ['通信'], 'TM-C': ['机电'] };
  function taskDay(t) { return t.window.includes('周四') ? '周四' : '周三'; }
  function taskMap(el, tasks, selected, onSel) {
    el.innerHTML = '';
    const wrap = Twin.map2D(el, { height: 220 });
    const svg = wrap.querySelector('svg');
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const W = vb[2], H = vb[3], padX = 30;
    const X = km => padX + km / 58 * (W - padX * 2);
    const Y = km => H / 2 + Math.sin(km * 0.32) * (H * 0.16);
    tasks.forEach((t, i) => {
      const x = X(t.km), y = Y(t.km) + 20;
      const on = selected.includes(t.id);
      const g = document.createElementNS(NS, 'g');
      g.style.cursor = 'pointer';
      g.innerHTML = `<line x1="${x}" y1="${y - 12}" x2="${x}" y2="${Y(t.km) + 4}" stroke="${on ? '#16a34a' : '#f59e0b'}" stroke-width="1"/>
        <circle cx="${x}" cy="${y}" r="9" fill="${on ? '#16a34a' : '#f59e0b'}" stroke="#060f22" stroke-width="1.5"/>
        <text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${i + 1}</text>
        <text x="${x}" y="${y + 20}" text-anchor="middle" font-size="8.5" fill="${on ? '#86efac' : '#fbbf24'}">${t.id}</text>`;
      g.addEventListener('click', () => onSel(t));
      svg.appendChild(g);
    });
    return wrap;
  }
  function buildPackages(selected, mode, resourceOn) {
    const tasks = D.tasks.filter(t => selected.includes(t.id));
    const groups = {};
    tasks.forEach(t => {
      const key = mode === 'A' ? t.tunnel : (FAMILY[t.skill] + '·' + taskDay(t));
      (groups[key] = groups[key] || []).push(t);
    });
    const packages = Object.keys(groups).map(key => {
      const ts = groups[key];
      const fams = [...new Set(ts.map(t => FAMILY[t.skill]))];
      const day = taskDay(ts[0]);
      const maxKm = Math.max(...ts.map(t => t.km));
      const dur = +ts.reduce((a, t) => a + t.duration, 0).toFixed(1);
      const team = D.teams.find(tm => fams.every(f => TEAM_SKILL[tm.id].includes(f)) && tm.available.includes(day))
        || D.teams.find(tm => fams.some(f => TEAM_SKILL[tm.id].includes(f)));
      const warnings = [];
      if (team) {
        if (!fams.every(f => TEAM_SKILL[team.id].includes(f))) warnings.push('资质需协调（' + fams.join('/') + '）');
        if (!team.available.includes(day)) warnings.push('排班需协调（' + day + '）');
        if (resourceOn) {
          const need = [...new Set(ts.flatMap(t => t.instrument.split('+')))];
          const miss = need.filter(x => !team.instruments.includes(x));
          if (miss.length) warnings.push('仪器需调配：' + miss.join('、'));
        }
      } else warnings.push('无匹配班组，需人工调度');
      const days = [...new Set(ts.map(taskDay))];
      if (days.length > 1) warnings.push('作业窗口跨日（' + days.join('/') + '）');
      const traffic = ts.some(t => t.traffic.includes('封闭')) ? '需封闭检修道' : '检修道/无需管制';
      return { key, tasks: ts, fams, day, team, mileage: +(2 * maxKm).toFixed(1), dur, warnings, traffic, maxKm };
    });
    packages.sort((a, b) => a.maxKm - b.maxKm);
    const trips = packages.length;
    const mileage = +packages.reduce((a, p) => a + p.mileage, 0).toFixed(1);
    const dur = +packages.reduce((a, p) => a + p.dur, 0).toFixed(1);
    return { packages, trips, mileage, dur, perTrip: trips ? +(tasks.length / trips).toFixed(2) : 0, count: tasks.length };
  }
  P.tasks = {
    title: '现场作业统筹', group: '现场作业统筹', crumb: true,
    render(el, params) {
      const focusTask = D.tasks.find(t => t.id === params.id);
      let selected = focusTask ? [focusTask.id] : D.tasks.map(t => t.id);
      let mode = 'A', resourceOn = true;
      const selectedMileage = () => +D.tasks.filter(t => selected.includes(t.id)).reduce((sum, t) => sum + 2 * t.km, 0).toFixed(1);
      el.innerHTML = U.pageHead('机电运维现场作业统筹',
        '将检测周期、诊断异常建议与计划检查产生的现场任务，按地理、资质、仪器、作业窗口与交通管制约束组合为任务包。本页为作业组合建议，供调度参考，不自动派单、不替代审批。',
        `<button class="btn" onclick="UI.go('camera-renewal',{from:'tasks'})">同杆摄像机修换方案比选</button>
         <button class="btn" id="tk-basis">${U.icon('diag', 14)} 查看组合依据</button>
         <button class="btn" id="tk-reset">${U.icon('reset', 14)} 重置选择</button>
         <button class="btn primary" id="tk-summary">${U.icon('copy', 14)} 生成统筹摘要</button>`, U.demoBadge('作业组合建议')) +
        `<div class="btn-group mb" aria-label="现场作业视图"><button class="seg on" data-task-view="packages" aria-pressed="true">任务组合</button><button class="seg" data-task-view="schedule" aria-pressed="false">班组与仪器排程</button></div>
        <section id="tk-scheduling" hidden></section>
        <div id="tk-pack-view"><div class="card mb"><div class="card-b">
          <div class="filter-bar" style="margin:0;align-items:center">
            <span class="fld" style="font-weight:600;color:var(--navy-800)">组合方案</span>
            <span class="btn-group" id="tk-mode"><button class="seg on" data-v="A">方案A · 地理就近</button><button class="seg" data-v="B">方案B · 专业资质</button></span>
            <span style="width:1px;height:24px;background:var(--line);margin:0 6px"></span>
            <span class="fld">资源约束校验（资质/仪器/排班） <span class="switch ${resourceOn ? 'on' : ''}" id="tk-res"></span></span>
            <span class="spacer" style="flex:1"></span>
            <span class="small muted">已选 <b id="tk-sel-cnt">${selected.length}</b> / ${D.tasks.length} 项任务</span>
          </div>
        </div></div>
        <div class="flex">
          <div style="width:340px;flex:0 0 340px">
            <div class="card dark-panel"><div class="card-h"><span class="card-t">任务分布地图</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="tk-map"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">任务来源构成</span></div>
              <div class="card-b" id="tk-source"></div></div>
          </div>
          <div class="grow">
            <div class="card"><div class="card-h"><span class="card-t">现场任务清单</span><span class="sub">勾选纳入组合 · 点击行查看作业要求</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b tight" id="tk-list"></div></div>
          </div>
          <div style="width:340px;flex:0 0 340px">
            <div class="card"><div class="card-h"><span class="card-t">推荐任务包</span><span class="sub" id="tk-mode-sub"></span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="tk-packages" style="max-height:420px;overflow-y:auto"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">方案对比与效率</span></div>
              <div class="card-b" id="tk-compare"></div></div>
          </div>
        </div>
        <div class="card mt"><div class="card-h"><span class="card-t">组合约束条件</span><span class="sub">任务合并不是仅按距离，需同时满足下列约束</span><span class="spacer"></span>${U.demoBadge()}</div>
          <div class="card-b" id="tk-cons"></div></div></div>`;
      const scheduling = window.TaskScheduling.mount(el.querySelector('#tk-scheduling'), D, () => selected);
      el.querySelectorAll('[data-task-view]').forEach(button => button.addEventListener('click', () => {
        const showSchedule = button.dataset.taskView === 'schedule';
        el.querySelector('#tk-scheduling').hidden = !showSchedule;
        el.querySelector('#tk-pack-view').hidden = showSchedule;
        el.querySelectorAll('[data-task-view]').forEach(b => {
          b.classList.toggle('on', b === button);
          b.setAttribute('aria-pressed', String(b === button));
        });
        el.querySelectorAll('#tk-summary,#tk-basis').forEach(b => { b.style.display = showSchedule ? 'none' : ''; });
        if (showSchedule) scheduling();
      }));
      function drawMap() {
        taskMap(el.querySelector('#tk-map'), D.tasks, selected, t => { toggle(t.id); openReq(t); });
      }
      function drawSource() {
        const cnt = {};
        D.tasks.forEach(t => { const s = t.source.startsWith('诊断') ? '诊断异常建议' : t.source.startsWith('设备检测') ? '设备检测周期' : t.source.startsWith('设备异常') ? '设备异常建议' : '计划性检查'; cnt[s] = (cnt[s] || 0) + 1; });
        const colors = { '诊断异常建议': '#ef4444', '设备检测周期': '#2f7bff', '设备异常建议': '#f59e0b', '计划性检查': '#16a34a' };
        Charts.donut(el.querySelector('#tk-source'), { size: 140, thick: .62, center: D.tasks.length, centerSub: '任务', items: Object.keys(cnt).map(k => ({ name: k, value: cnt[k], color: colors[k] })) });
      }
      function drawList() {
        el.querySelector('#tk-list').innerHTML = `<table class="tbl"><thead><tr><th style="width:34px"></th><th>任务</th><th>位置</th><th>类型</th><th>耗时</th><th>资质/仪器</th><th>窗口</th><th>来源</th></tr></thead><tbody>
          ${D.tasks.map((t, i) => `<tr data-tk="${t.id}" class="${selected.includes(t.id) ? '' : 'muted'}" style="cursor:pointer">
            <td><button type="button" class="switch ${selected.includes(t.id) ? 'on' : ''}" data-sw="${t.id}" aria-label="将 ${t.id} 纳入组合" aria-pressed="${selected.includes(t.id)}" style="border:0;vertical-align:middle;transform:scale(.85)"></button></td>
            <td><span class="code">${t.id}</span><br><span class="small muted">${t.asset}</span></td>
            <td class="small">${t.tunnel}<br><span class="muted">${D.kmText(t.km)}</span></td>
            <td class="small">${t.type}</td>
            <td class="num small">${t.duration}h</td>
            <td class="small">${t.skill}<br><span class="muted">${t.instrument}</span></td>
            <td class="small">${t.window}<br><span class="muted">${t.traffic}</span></td>
            <td class="small">${t.source.startsWith('诊断') ? '<span class="tag err">' + t.source.replace('诊断事件 ', '') + '</span>' : '<span class="tag info">' + t.source + '</span>'}</td>
          </tr>`).join('')}</tbody></table>`;
        el.querySelectorAll('[data-sw]').forEach(sw => sw.addEventListener('click', ev => { ev.stopPropagation(); toggle(sw.dataset.sw); }));
        el.querySelectorAll('[data-tk]').forEach(tr => tr.addEventListener('click', ev => { if (ev.target.closest('[data-sw]')) return; openReq(D.tasks.find(t => t.id === tr.dataset.tk)); }));
      }
      function openReq(t) {
        const review = t.review;
        const body = U.openDrawer('作业要求 · ' + t.id, `
          <div class="flex ai-center mb"><b>${t.type}</b> ${U.demoBadge()}</div>
          <div class="kv">
            <span class="k">任务编号</span><span class="v mono">${t.id}</span>
            <span class="k">目标设备</span><span class="v"><a class="mono" onclick="UI.openDevice('${t.asset}')">${t.asset}</a> ${(D.byCode[t.asset] || {}).name || ''}</span>
            <span class="k">位置</span><span class="v">${t.tunnel} · ${D.kmText(t.km)}</span>
            <span class="k">作业内容</span><span class="v">${t.items}</span>
            <span class="k">预计耗时</span><span class="v">${t.duration} 小时</span>
            <span class="k">资质要求</span><span class="v">${t.skill}</span>
            <span class="k">仪器要求</span><span class="v">${t.instrument}</span>
            <span class="k">作业窗口</span><span class="v">${t.window}</span>
            <span class="k">交通管制</span><span class="v">${t.traffic}</span>
            <span class="k">任务来源</span><span class="v">${t.source}</span>
          </div>
          <div class="divider"></div>
          <button class="btn ${selected.includes(t.id) ? '' : 'primary'}" id="req-toggle">${selected.includes(t.id) ? '移出组合' : '纳入组合'}</button>
          <button class="btn" onclick="UI.go('gis',{focus:'${t.asset}'})">${U.icon('map', 13)} 孪生定位</button>
          ${t.eventId ? `<button class="btn" onclick="UI.openEvent('${t.eventId}')">${U.icon('diag', 13)} 关联诊断</button>
            <div class="sec-t">现场核验</div>
            ${review ? `<div class="note-box"><b>${review.outcome === 'verified' ? '已核验恢复' : '待复核'}</b>
              <p>${U.esc(review.note)}</p><small>${D.fmtTime(new Date(review.time), 'full')}</small></div>` : ''}
            ${t.id === 'FT-03' ? `<button class="btn primary mt" onclick="UI.go('scene-camera',{review:'1'})">登记恢复核验</button>` : review?.outcome === 'verified' ? '' : `<form class="task-review mt">
              <label>核验结论<select class="sel" name="outcome" required><option value="">请选择</option><option value="unresolved">仍有异常，待复核</option><option value="verified">已核验恢复</option></select></label>
              <label>现场记录<textarea class="inp" name="note" rows="3" maxlength="500" required></textarea></label>
              <button type="submit" class="btn primary">保存核验结果</button>
            </form>`}` : ''}`);
        body.querySelector('.task-review')?.addEventListener('submit', ev => {
          ev.preventDefault();
          const form = ev.currentTarget;
          try {
            if (!D.saveTaskReview(t, form.elements.outcome.value, form.elements.note.value)) {
              U.toast('请填写核验结论和现场记录', 'warn');
              return;
            }
          } catch {
            U.toast('浏览器未能保存现场记录，请重试', 'warn');
            return;
          }
          openReq(t);
          U.toast('已保存核验结果', 'ok');
        });
        const b = document.getElementById('req-toggle');
        b && b.addEventListener('click', () => { toggle(t.id); U.closeDrawer(); });
      }
      function toggle(id) {
        const i = selected.indexOf(id);
        if (i >= 0) selected.splice(i, 1); else selected.push(id);
        el.querySelector('#tk-sel-cnt').textContent = selected.length;
        drawMap(); drawList(); drawPackages(); drawCompare();
      }
      function drawPackages() {
        const r = buildPackages(selected, mode, resourceOn);
        el.querySelector('#tk-mode-sub').textContent = mode === 'A' ? '地理就近合并' : '专业资质合并';
        if (!r.count) { el.querySelector('#tk-packages').innerHTML = '<div class="empty">请至少勾选一项任务</div>'; return r; }
        el.querySelector('#tk-packages').innerHTML = r.packages.map((p, i) => `
          <div class="evi" style="${p.warnings.length ? 'border-color:#f3ddb0' : 'border-color:#bfe9f2'}">
            <div class="evi-t"><span class="tag ${p.warnings.length ? 'warn' : 'ok'}">包${i + 1}</span>${p.key}<span class="spacer" style="flex:1"></span><span class="small muted">${p.tasks.length}项</span></div>
            <div class="chip-row" style="margin:5px 0">${p.tasks.map(t => `<span class="ref-chip" onclick="UI.openDevice('${t.asset}')">${t.id}·${t.type}</span>`).join('')}</div>
            <div class="kv" style="font-size:11px">
              <span class="k">建议班组</span><span class="v">${p.team ? p.team.name + '（' + p.team.vehicle + '）' : '待调度'}</span>
              <span class="k">作业日</span><span class="v">${p.day} · 耗时${p.dur}h</span>
              <span class="k">往返里程</span><span class="v">${p.mileage} km</span>
              <span class="k">交通管制</span><span class="v">${p.traffic}</span>
            </div>
            ${p.warnings.length ? `<div class="note-box mt" style="padding:5px 9px">${U.icon('warn', 12)} ${p.warnings.join('；')}</div>` : (resourceOn ? '<div class="src" style="color:#15803d">✓ 资质/仪器/窗口约束满足（规则校验）</div>' : '<div class="src muted">资源约束校验已关闭</div>')}
          </div>`).join('');
        return r;
      }
      function drawCompare() {
        const baseMileage = selectedMileage();
        const A = buildPackages(selected, 'A', resourceOn), B = buildPackages(selected, 'B', resourceOn);
        const saveM = baseMileage ? +((baseMileage - A.mileage) / baseMileage * 100).toFixed(1) : 0;
        el.querySelector('#tk-compare').innerHTML = `
          <table class="tbl" style="font-size:11px"><thead><tr><th>指标</th><th>逐任务出车</th><th class="${mode === 'A' ? 'num' : ''}">方案A</th><th class="${mode === 'B' ? 'num' : ''}">方案B</th></tr></thead><tbody>
            <tr><td>出车次数</td><td class="num">${A.count}</td><td class="num"><b>${A.trips}</b></td><td class="num"><b>${B.trips}</b></td></tr>
            <tr><td>往返里程</td><td class="num">${baseMileage}</td><td class="num"><b>${A.mileage}</b></td><td class="num"><b>${B.mileage}</b></td></tr>
            <tr><td>单次任务量</td><td class="num">1.0</td><td class="num"><b>${A.perTrip}</b></td><td class="num"><b>${B.perTrip}</b></td></tr>
            <tr><td>总作业耗时</td><td class="num">${A.dur}h</td><td class="num">${A.dur}h</td><td class="num">${B.dur}h</td></tr>
          </tbody></table>
          <div class="concl mt"><h4>方案A 里程节省 ${saveM}%</h4><p>相对逐任务出车（${A.count}次/${baseMileage}km），方案A按地理就近合并为 ${A.trips} 个任务包，往返里程 ${A.mileage}km，单次任务量提升至 ${A.perTrip}。方案B按专业资质合并为 ${B.trips} 包，便于专业班组集中作业。</p></div>
          <div class="note-box mt">效率指标为方案测算，口径与成效评价页一致（单位任务行驶里程、单次出车任务量）。组合建议供调度参考，不自动派单。</div>
          <button class="btn sm mt" onclick="UI.go('kpi')">${U.icon('cost', 13)} 查看成效指标 ›</button>`;
      }
      const CONS = [
        ['专业兼容性', '同一任务包内作业资质需被班组覆盖（机电/电工/通信不可混派无资质班组）'],
        ['地理就近', '优先合并同隧道/同路段任务，减少往返里程；跨隧道合并需评估路线'],
        ['作业窗口', '任务包内作业时间窗需兼容，跨日任务不强行合并'],
        ['交通管制', '需封闭检修道的任务统一管制安排；无需管制任务可灵活穿插'],
        ['资质/仪器', '班组资质与仪器需满足任务要求，缺失时提示调配而非忽略'],
        ['耗时均衡', '单包总耗时控制在作业窗口内，避免超窗']
      ];
      el.querySelector('#tk-cons').innerHTML = `<div class="grid g-3">${CONS.map(([t, x]) => `<div class="evi"><div class="evi-t small">${U.icon('check', 13)} ${t}</div><div class="evi-d small">${x}</div></div>`).join('')}</div>`;
      function drawAll() { drawMap(); drawSource(); drawList(); drawPackages(); drawCompare(); if (!el.querySelector('#tk-scheduling').hidden) scheduling(); }
      drawAll();
      if (focusTask) openReq(focusTask);
      segBind(el, '#tk-mode', v => { mode = v; drawPackages(); drawCompare(); });
      el.querySelector('#tk-res').addEventListener('click', function () { this.classList.toggle('on'); resourceOn = this.classList.contains('on'); drawPackages(); });
      el.querySelector('#tk-reset').addEventListener('click', () => { selected = D.tasks.map(t => t.id); el.querySelector('#tk-sel-cnt').textContent = selected.length; drawAll(); U.toast('已重置为全部任务', 'ok'); });
      el.querySelector('#tk-basis').addEventListener('click', () => {
        const r = buildPackages(selected, mode, resourceOn);
        U.modal('任务组合依据 · ' + (mode === 'A' ? '方案A 地理就近' : '方案B 专业资质'), `
          <div class="note-box blue mb">任务合并并非仅按距离，而是同时校验专业兼容性、地理、作业窗口、交通管制、资质仪器与耗时。下列为当前方案的组合依据。</div>
          ${r.packages.map((p, i) => `<div class="sec-t">包${i + 1} · ${p.key}</div>
            <div class="kv"><span class="k">合并任务</span><span class="v">${p.tasks.map(t => t.id).join('、')}</span>
            <span class="k">合并理由</span><span class="v">${mode === 'A' ? '同属' + p.key + '，地理就近，往返里程 ' + p.mileage + 'km' : '同属' + p.fams.join('/') + '专业且同为' + p.day + '作业，资质仪器兼容'}</span>
            <span class="k">建议班组</span><span class="v">${p.team ? p.team.name + '（资质：' + p.team.skills.join('、') + '）' : '待调度'}</span>
            <span class="k">约束校验</span><span class="v">${p.warnings.length ? '<span style="color:#b45309">' + p.warnings.join('；') + '</span>' : '<span style="color:#15803d">满足</span>'}</span></div>`).join('')}
          <div class="note-box mt">资源约束校验${resourceOn ? '已开启' : '已关闭'}：开启时对资质/仪器/排班不匹配给出调配提示。组合建议不替代调度审批。</div>`,
          `<button class="btn" onclick="UI.closeModal()">关闭</button>`);
      });
      el.querySelector('#tk-summary').addEventListener('click', () => {
        const baseMileage = selectedMileage();
        const A = buildPackages(selected, 'A', resourceOn), B = buildPackages(selected, 'B', resourceOn);
        const r = mode === 'A' ? A : B;
        summaryModal('现场作业统筹 · 组合摘要', `【范围】已选 ${r.count} 项现场任务（来源：检测周期/诊断异常建议/计划检查）
【当前方案】${mode === 'A' ? '方案A 地理就近合并' : '方案B 专业资质合并'}
【任务包】${r.trips} 个，往返里程 ${r.mileage}km，单次任务量 ${r.perTrip}，总耗时 ${r.dur}h
【方案对比】A：${A.trips}次/${A.mileage}km/单次${A.perTrip}；B：${B.trips}次/${B.mileage}km/单次${B.perTrip}
【效率提升】相对逐任务出车（${A.count}次/${baseMileage}km），方案A里程节省 ${baseMileage ? ((baseMileage - A.mileage) / baseMileage * 100).toFixed(1) : 0}%
【任务包明细】
${r.packages.map((p, i) => '  包' + (i + 1) + ' ' + p.key + '：' + p.tasks.map(t => t.id).join('/') + ' → ' + (p.team ? p.team.name : '待调度') + '，' + p.mileage + 'km' + (p.warnings.length ? '（' + p.warnings.join('；') + '）' : '')).join('\n')}
【组合约束】专业兼容性/地理就近/作业窗口/交通管制/资质仪器/耗时均衡。
【边界说明】本页为作业组合建议，供调度参考，不自动派单、不替代审批；效率为方案测算。`);
      });
    }
  };
})();
