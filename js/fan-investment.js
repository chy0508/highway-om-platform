(function () {
  'use strict';
  const U = window.UI;
  const days = 300, price = 0.85;
  // 云岭隧道 K12。负荷、投资和分组运行表计样本均取自路维智策的离线演示。
  const flows = {
    high: { name: '峰时车流', vehicles: 980, co: 21, extinction: 0.006, base: 560, floor: 88, target: 92, controlMeter: 508 },
    low: { name: '低流量', vehicles: 280, co: 8, extinction: 0.002, base: 440, floor: 64, target: 70, controlMeter: 299 }
  };
  const strategies = {
    control: { name: '分组运行', capital: 48000, factor: 1 },
    retrofit: { name: '分组运行 + 高效风机', capital: 146000, factor: 0.91 }
  };
  const num = n => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const round1 = n => Math.round(n * 10) / 10;

  function savings(base, use, capital) {
    const daily = round1(base - use);
    const energy = daily * days;
    const revenue = energy * price;
    return { daily, energy, revenue, years: revenue > 0 ? capital / revenue : null };
  }
  function forecast(flow, plan) {
    const duty = Math.max(flow.target, flow.floor) / 100;
    const use = round1(flow.base * duty * plan.factor);
    return { use, ...savings(flow.base, use, plan.capital) };
  }
  function years(result) {
    if (!result) return '待核验';
    return result.years === null ? '无法回收' : result.years.toFixed(2);
  }
  function options(choices, selected) {
    return Object.entries(choices).map(([key, value]) =>
      `<option value="${key}" ${key === selected ? 'selected' : ''}>${value.name}</option>`).join('');
  }

  function render(el, verify, params) {
    const flowKey = params.flow === 'low' ? 'low' : 'high';
    const strategy = params.strategy === 'retrofit' ? 'retrofit' : 'control';
    const flow = flows[flowKey], plan = strategies[strategy];
    const model = forecast(flow, plan);
    const raw = String(params.meter ?? '');
    const trial = /^\d+(?:\.\d)?$/.test(raw) && Number.isSafeInteger(Math.round(Number(raw) * 10)) ? Number(raw) : null;
    const meter = trial ?? (strategy === 'control' ? flow.controlMeter : null);
    const checked = meter === null ? null : savings(flow.base, meter, plan.capital);
    const active = verify ? checked : model;
    const source = trial !== null ? '手工录入的试算值' : meter !== null ? '路维智策分组运行样本' : '组合方案待补样本';
    const route = verify ? 'kpi' : 'fan';
    const navigate = (dest, nextFlow, nextStrategy, sample) => {
      const next = { case: 'yunling-fan', flow: nextFlow, strategy: nextStrategy };
      if (sample !== null) next.meter = String(sample);
      U.go(dest, next);
    };
    const label = verify ? '表计折算' : '模型预计';
    const row = (name, predicted, verified) => `<tr><th scope="row">${name}</th><td>${predicted}</td><td>${verified}</td></tr>`;
    const compare = `<table class="tbl"><thead><tr><th>核算项目</th><th>模型预计</th><th>参考表计核验</th></tr></thead><tbody>
      ${row('日用电量（kWh）', num(model.use), meter === null ? '待补样本' : num(meter))}
      ${[['日节电量（kWh）','daily'], ['年节电量（kWh）','energy'], ['年节电收益（元）','revenue']].map(([name, key]) =>
        row(name, num(model[key]), checked ? num(checked[key]) : '待核验')).join('')}
      ${row('静态回收期（年）', years(model), years(checked))}</tbody></table>`;
    const plans = `<table class="tbl"><thead><tr><th>方案</th><th>投入（元）</th><th>年收益（元）</th><th>回收期（年）</th></tr></thead><tbody>
      ${Object.entries(strategies).map(([key, p]) => {
        const f = forecast(flow, p);
        return `<tr><th scope="row">${p.name}${key === strategy ? ' <span class="tag plain">当前</span>' : ''}</th><td>${num(p.capital)}</td><td>${num(f.revenue)}</td><td>${years(f)}</td></tr>`;
      }).join('')}</tbody></table>`;
    el.innerHTML = U.pageHead(verify ? '风机改造收益核验' : '风机改造投资测算',
      '云岭隧道 K12 · 射流风机回路。按同一交通工况和 24 小时统计窗口比较用电量。',
      `<button class="btn" onclick="UI.go('${route}')">${verify ? '返回成效评价' : '返回青岭风机策略'}</button>
        <button class="btn primary" id="fi-switch">${verify ? '查看同方案投资测算' : '查看同方案表计核验'}</button>`,
      U.demoBadge('专项分析')) +
      `<div class="card mb"><div class="card-b filter-bar">
        <label class="fld">交通工况 <select class="sel" id="fi-flow">${options(flows, flowKey)}</select></label>
        <label class="fld">改造方案 <select class="sel" id="fi-strategy">${options(strategies, strategy)}</select></label>
        <span class="small muted">${flow.vehicles} 辆/小时 · CO ${flow.co} ppm · 消光系数 ${flow.extinction} m⁻¹</span>
      </div></div>
      <div class="grid g-4 mb">
        ${U.kpi('同工况校正基线', num(flow.base), '风机回路 · 日电量', '#2f7bff', null, 'fan', 'kWh')}
        ${U.kpi(verify ? '分项参考表计' : '模型预计用电', verify ? (meter === null ? '待补样本' : num(meter)) : num(model.use), verify ? source : plan.name, '#00a5bf', null, 'fan', verify && !checked ? '' : 'kWh')}
        ${U.kpi(label + '年收益', active ? num(active.revenue) : '待核验', '按当前工况折算 300 天', active && active.revenue < 0 ? '#b91c1c' : '#15803d', null, 'cost', active ? '元' : '')}
        ${U.kpi(label + '回收期', years(active), '静态回收期 · 仅计节电', '#8054b2', null, 'cost', active && active.years !== null ? '年' : '')}
      </div>
      <div class="grid g-2">
        <section class="card"><div class="card-h"><span class="card-t">${verify ? '模型预计与表计核验' : '两种改造方案比较'}</span></div>
          <div class="card-b">${verify ? compare : plans}
            <div class="note-box blue mt">所选方案投入 ${num(plan.capital)} 元。按电价 ${price} 元/kWh、每年 ${days} 个等效运行日折算。</div>
            <p class="small muted mt">年节电收益 =（校正基线 − 日用电量）× 等效运行天数 × 电价。静态回收期 = 方案投入 ÷ 年节电收益。</p>
          </div>
        </section>
        <section class="card"><div class="card-h"><span class="card-t">${verify ? '核验样本与范围' : '运行负荷与基础通风'}</span></div><div class="card-b">
          ${verify ? `<div class="concl"><h4>${source}</h4><p>${meter === null ? '需要分组运行与风机更新同时实施后的风机回路日电量。' : `${flow.name}校正基线 ${num(flow.base)} kWh，分项电量 ${num(meter)} kWh，日电量差 ${num(checked.daily)} kWh。`}</p></div>
            <form id="fi-meter-form" class="filter-bar mt"><label class="fld">试算日电量（kWh） <input class="inp" type="number" min="0" step="0.1" required id="fi-meter" value="${meter ?? ''}" placeholder="输入当日回路电量"></label>
              <button class="btn" type="submit">按此电量核验</button>
              ${trial !== null ? '<button class="btn" type="button" id="fi-reset">恢复原样本</button>' : ''}
            </form>
            <p class="small muted mt">离线分项表样本仅覆盖分组运行。录入值仅用于当前工况与方案的演算。组合改造按同一回路合并核算节电量。</p>` :
            `<div class="kv"><span class="k">设定负荷下限</span><span class="v">${flow.floor}%</span>
              <span class="k">设定运行负荷</span><span class="v">${Math.max(flow.target, flow.floor)}%</span>
              <span class="k">设备用电系数</span><span class="v">${plan.factor.toFixed(2)}</span></div>
            <div class="concl mt"><h4>预计每日节电 ${num(model.daily)} kWh</h4>
              <p>预计日用电 = ${num(flow.base)} × ${Math.max(flow.target, flow.floor)}% × ${plan.factor.toFixed(2)} ≈ ${num(model.use)} kWh。</p></div>
            <p class="small muted mt">保留基础通风，仅调整辅助机组运行时段。模型按工况设置负荷下限，实际通风要求以现场评估为准。应急工况由原控制系统执行。</p>`}
        </div></section>
      </div>`;
    const get = id => el.querySelector('#fi-' + id);
    get('switch').addEventListener('click', () => navigate(verify ? 'fan' : 'kpi', flowKey, strategy, trial));
    for (const key of ['flow', 'strategy']) {
      get(key).addEventListener('change', () => navigate(route, get('flow').value, get('strategy').value, null));
    }
    if (verify) {
      get('meter-form').addEventListener('submit', event => {
        event.preventDefault();
        const input = get('meter');
        const value = input.valueAsNumber;
        if (input.validity.valid && Number.isSafeInteger(Math.round(value * 10))) navigate(route, flowKey, strategy, value);
        else {
          input.setCustomValidity('请输入以 0.1 kWh 为最小单位的有效日电量。');
          input.reportValidity();
        }
      });
      get('meter').addEventListener('input', event => event.target.setCustomValidity(''));
      get('reset')?.addEventListener('click', () => navigate(route, flowKey, strategy, null));
    }
  }

  window.FanInvestment = { render };
})();
