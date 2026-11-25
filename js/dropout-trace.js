/* 历史视频中断，以视频丢失时刻对齐供电、网络与录像记录。 */
(function () {
  'use strict';
  const U = window.UI;
  const D = window.DB;

  function seconds(time) {
    const [h, m, s] = time.split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }
  function recoveredAt(record) {
    return new Date((seconds(record.loss) + record.seconds) * 1000).toISOString().slice(11, 19);
  }

  function firstCheck(records) {
    const power = records.filter(r => r.dip && seconds(r.supply) < seconds(r.port) && seconds(r.port) <= seconds(r.loss));
    const network = records.filter(r => !r.dip && seconds(r.port) < seconds(r.loss));
    if (power.length === records.length) return {
      name: '机柜供电支路',
      basis: `全部 ${records.length} 次电压跌落都先于端口重连和视频中断。先复测机柜输入电压，检查电源模块与接线端子。`
    };
    if (network.length === records.length) return {
      name: '摄像机接入端口',
      basis: `全部 ${records.length} 次视频中断前均有端口重连，供电记录为 ${Math.min(...records.map(r => r.voltage))}–${Math.max(...records.map(r => r.voltage))} V。先检查端口日志、网线和接头。`
    };
    return { name: '供电与通信均需复核', basis: '所选时段的记录未指向同一首查对象，需分次核对。' };
  }

  function evidenceTimeline(record) {
    const entries = [
      [record.supply, '电力监控', `支路电压 ${record.voltage} V${record.dip ? '，记录到电压跌落' : '，供电记录平稳'}`, record.dip ? 'amber' : ''],
      [record.port, '网络管理', '摄像机接入端口开始重连', 'amber'],
      [record.loss, '视频平台', '实时码流中断，录像出现缺口', 'red'],
      [recoveredAt(record), '视频平台', `码流恢复，本次中断 ${record.seconds} 秒`, 'green']
    ].sort((a,b) => seconds(a[0]) - seconds(b[0]));
    return entries.map(([time, source, note, color]) => `<div class="tl-item ${color}">
      <div class="tl-time">${time} · ${source}</div><div class="tl-text">${note}</div></div>`).join('');
  }

  window.Pages.diagnosis.renderDropoutTrace = function (el, event, params) {
    const device = D.byCode[event.affected[0]];
    const windows = event.traceWindows;
    let current = windows.find(w => w.date === params.date) || windows[windows.length - 1];
    let selected = 0;
    el.innerHTML = U.pageHead('间歇性掉线追溯', event.id + ' · ' + device.place + ' · ' + device.kmText,
      `<a class="btn" href="#/diagnosis">${U.icon('back',14)} 诊断事件总览</a>
       <button type="button" class="btn" id="trace-device">${U.icon('dev',14)} ${device.code} 设备档案</button>`, U.demoBadge('历史记录')) +
      `<div class="card mb"><div class="card-b filter-bar">
         <label class="fld">历史时段 <select class="sel" id="trace-date">${windows.map(w =>
           `<option value="${w.date}">${w.date}　${w.episodes[0].loss.slice(0,5)}—${recoveredAt(w.episodes[w.episodes.length-1]).slice(0,5)}</option>`).join('')}</select></label>
         <span class="tag warn">${event.status}</span></div></div>
       <div class="grid g-3 mb" id="trace-stats"></div>
       <section class="card mb"><div class="card-h"><h2 class="card-t">首查对象</h2></div><div class="card-b" id="trace-result" aria-live="polite"></div></section>
       <div class="grid g-2">
         <section class="card"><div class="card-h"><h2 class="card-t">中断记录</h2></div><div class="card-b tbl-wrap" id="trace-records"></div></section>
         <section class="card"><div class="card-h"><h2 class="card-t">单次中断证据</h2><span id="trace-selected" class="sub"></span></div>
         <div class="card-b"><div class="timeline" id="trace-timeline"></div></div></section>
       </div>`;
    const date = el.querySelector('#trace-date');
    date.value = current.date;
    const list = el.querySelector('#trace-records');
    function select(index) {
      selected = index;
      list.querySelectorAll('[data-trace-index]').forEach((button,i) => {
        button.setAttribute('aria-pressed', String(i === selected));
        button.classList.toggle('primary', i === selected);
      });
      const r = current.episodes[selected];
      el.querySelector('#trace-selected').textContent = current.date + '　' + r.loss;
      el.querySelector('#trace-timeline').innerHTML = evidenceTimeline(r);
    }
    function renderWindow() {
      const records = current.episodes;
      const check = firstCheck(records);
      el.querySelector('#trace-stats').innerHTML =
        U.kpi('视频中断', records.length, current.date, 'var(--blue)', null, 'cam', '次') +
        U.kpi('累计中断', records.reduce((n,r) => n + r.seconds, 0), '按录像缺口汇总', 'var(--amber)', null, 'diag', '秒') +
        U.kpi('到场复测', current.visitV, current.visit + ' · 画面已恢复', 'var(--green)', null, 'check', 'V');
      el.querySelector('#trace-result').innerHTML = `<div class="concl"><h4>${check.name}</h4><p>${check.basis}</p></div>`;
      list.innerHTML = `<table class="tbl"><thead><tr><th>视频中断</th><th>视频恢复</th><th class="num">时长</th><th>证据</th></tr></thead><tbody>
        ${records.map((r,i) => `<tr><td>${r.loss}</td><td>${recoveredAt(r)}</td><td class="num">${r.seconds} 秒</td>
          <td><button class="btn sm" type="button" data-trace-index="${i}" aria-label="查看 ${r.loss} 中断证据">查看</button></td></tr>`).join('')}</tbody></table>`;
      select(0);
    }
    date.onchange = () => {
      current = windows.find(w => w.date === date.value);
      history.replaceState(history.state, '', '#/diagnosis?' + new URLSearchParams({id:event.id, date:current.date}));
      renderWindow();
    };
    list.onclick = ev => {
      const button = ev.target.closest('[data-trace-index]');
      if (button) select(Number(button.dataset.traceIndex));
    };
    el.querySelector('#trace-device').onclick = () => U.openDevice(device.code);
    renderWindow();
  };
})();
