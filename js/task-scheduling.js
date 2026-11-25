/* 现场任务排程推演。班组、资质、随车仪器和窗口均来自主项目台账。 */
(function () {
  'use strict';
  const SPEED = 40, FIXED_COST = 380, KM_COST = 4, BASE_OPEN = 8 * 60 + 30;
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const minutes = value => {
    const [hour, min] = value.split(':').map(Number);
    return hour * 60 + min;
  };
  const clock = min => (min >= 1440 ? '次日 ' : '') +
    [Math.floor(min / 60) % 24, min % 60].map(v => String(v).padStart(2, '0')).join(':');
  const drive = km => Math.ceil(Math.abs(km) * 60 / SPEED - 1e-9);
  const kmText = km => Number(km.toFixed(2));
  const money = value => value.toLocaleString('zh-CN', {maximumFractionDigits: 2});
  const windowText = job => `${job.day} ${clock(job.start)}–${clock(job.end)}`;

  function plannedJobs(tasks, overrides) {
    return tasks.map(task => {
      const [day, times] = task.window.split(' ');
      const [start, end] = times.split('—').map(minutes);
      return {task, day, start, end, ...overrides.get(task.id),
        work: Math.round(task.duration * 60), instruments: task.instrument.split('+')};
    }).sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day) ||
      a.start - b.start || a.end - b.end || a.task.id.localeCompare(b.task.id));
  }

  function plan(jobs, teams, combine) {
    const trips = [], pending = [], lastTrip = new Map();
    for (const job of jobs) {
      const skilled = teams.filter(team => team.skills.includes(job.task.skill));
      const available = skilled.filter(team => team.available.includes(job.day));
      const equipped = available.filter(team => job.instruments.every(item => team.instruments.includes(item)));
      if (!equipped.length) {
        let reason = '缺少具备' + job.task.skill + '资质的班组';
        if (available.length) reason = available.map(team => team.name + '缺少' +
          job.instruments.filter(item => !team.instruments.includes(item)).join('、')).join('；');
        else if (skilled.length) reason = job.day + '无具备所需资质的在岗班组';
        pending.push({job, reason});
        continue;
      }
      // 各班组各自保管仪器，同型号仪器以班组台账区分。从基地出发到返抵为整套资源的占用时段。
      const candidates = equipped.map(team => {
        const previous = lastTrip.get(job.day + team.id);
        const join = combine && previous;
        const from = join ? previous.lastKm : 0;
        const km = Math.abs(job.task.km - from);
        const depart = join ? previous.depart : Math.max(BASE_OPEN, job.start - drive(km), previous?.returnAt ?? 0);
        const arrival = (join ? previous.finish : depart) + drive(km);
        const start = Math.max(job.start, arrival);
        return {team, trip: join || null, depart, arrival, start, finish: start + job.work, km};
      });
      const feasible = candidates.filter(c => c.finish <= job.end)
        .sort((a, b) => Number(Boolean(b.trip)) - Number(Boolean(a.trip)) || a.finish - b.finish);
      if (!feasible.length) {
        const earliest = Math.min(...candidates.map(c => c.finish));
        pending.push({job, reason: `最早可于 ${clock(earliest)} 完工，超过窗口截止 ${clock(job.end)}`});
        continue;
      }
      const c = feasible[0];
      const trip = c.trip || {day: job.day, team: c.team, depart: c.depart, stops: [], legsKm: 0, legsMin: 0};
      if (!c.trip) trips.push(trip);
      trip.stops.push({job, arrival: c.arrival, start: c.start, finish: c.finish});
      trip.legsKm += c.km;
      trip.legsMin += drive(c.km);
      trip.finish = c.finish;
      trip.lastKm = job.task.km;
      trip.returnAt = trip.finish + drive(trip.lastKm);
      trip.km = kmText(trip.legsKm + trip.lastKm);
      trip.driveMin = trip.legsMin + drive(trip.lastKm);
      lastTrip.set(job.day + c.team.id, trip);
    }
    trips.sort((a,b) => days.indexOf(a.day) - days.indexOf(b.day) || a.depart - b.depart);
    const km = kmText(trips.reduce((sum, trip) => sum + trip.km, 0));
    return {trips, pending, km, driveMin: trips.reduce((sum, trip) => sum + trip.driveMin, 0),
      cost: trips.length * FIXED_COST + km * KM_COST, count: jobs.length - pending.length};
  }

  function mount(el, db, getSelected) {
    const overrides = new Map();
    const esc = window.UI.esc;
    let mode = 'combined', editId;
    function render() {
      const selected = getSelected();
      const jobs = plannedJobs(db.tasks.filter(t => selected.includes(t.id)), overrides);
      if (!jobs.length) {
        el.innerHTML = '<div class="card"><div class="card-b empty">请在“任务组合”的现场任务清单中勾选待排任务。</div></div>';
        return;
      }
      const editing = jobs.find(j => j.task.id === editId) || jobs[0];
      editId = editing.task.id;
      const plans = {combined: plan(jobs, db.teams, true), separate: plan(jobs, db.teams, false)};
      const current = plans[mode];
      const names = {combined: '集中出车', separate: '分次出车'};
      const sameTasks = plans.combined.pending.map(p => p.job.task.id).join() === plans.separate.pending.map(p => p.job.task.id).join();
      const savings = plans.separate.cost - plans.combined.cost;
      el.innerHTML = `<div class="card mb">
        <div class="card-h"><span class="card-t">出车排程</span><span class="sub">已选 ${jobs.length} 项现场任务</span><span class="spacer"></span>${window.UI.demoBadge('方案测算')}</div>
        <div class="card-b"><div class="filter-bar mb"><span class="btn-group" aria-label="出车方式">
          ${Object.entries(names).map(([k, name]) => `<button class="seg ${k === mode ? 'on' : ''}" data-schedule-mode="${k}" aria-pressed="${k === mode}">${name}</button>`).join('')}
        </span><span class="small muted">按作业窗口先后排程，同班组可在同一天沿线连续作业。</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>趟次 / 日期</th><th>班组 / 随车仪器</th><th>基地出发</th><th>现场顺序 / 到场 / 开工—完工</th><th>返抵基地</th><th>往返路程</th></tr></thead><tbody>
          ${current.trips.map((trip, index) => `<tr data-schedule-trip><td><b>第 ${index + 1} 趟</b><br>${trip.day}</td>
            <td>${esc(trip.team.name)}<br><span class="muted small">${esc([...new Set(trip.stops.flatMap(s => s.job.instruments))].join('、'))}</span></td>
            <td>${clock(trip.depart)}</td><td>${trip.stops.map(({job, arrival, start, finish}, n) => `<div><b>${n + 1}. ${esc(job.task.tunnel)}</b> · ${esc(job.task.id)} · ${esc(job.task.type)}<br>
            <span class="muted small">K${job.task.km} · ${clock(arrival)} 到场 · ${clock(start)}–${clock(finish)} 作业</span></div>`).join('')}
            </td><td>${clock(trip.returnAt)}</td><td>${trip.km} km<br><span class="small muted">行车 ${trip.driveMin} 分钟</span></td></tr>`).join('') ||
          '<tr><td colspan="6" class="empty">当前窗口及资源条件下暂无可执行行程。</td></tr>'}
        </tbody></table></div><p class="small muted mt">每趟从 K0 基地出发。班组和本趟所需仪器在出发时一同出库，返抵后可再次安排。</p></div></div>
        <div class="card mb"><div class="card-h"><span class="card-t">调整作业窗口</span><span class="sub">本次推演</span></div>
          <div class="card-b"><form class="filter-bar" data-window-form>
            <label class="fld">任务<select class="sel" data-schedule-job>${jobs.map(j => `<option value="${esc(j.task.id)}" ${editId === j.task.id ? 'selected' : ''}>${esc(j.task.id + ' · ' + j.task.type)}</option>`).join('')}</select></label>
            <label class="fld">作业日<select class="sel" data-schedule-day>${days.map(day => `<option ${day === editing.day ? 'selected' : ''}>${day}</option>`).join('')}</select></label>
            <label class="fld">开始<input class="sel" type="time" data-schedule-start required value="${clock(editing.start)}"></label>
            <label class="fld">截止<input class="sel" type="time" data-schedule-end required value="${clock(editing.end)}"></label>
            <button class="btn primary" type="submit" data-schedule-apply>应用窗口</button>
            <button class="btn" type="button" data-schedule-restore>恢复原窗口</button>
          </form><p class="small muted mt">台账窗口 ${esc(editing.task.window)} · 现场作业 ${editing.work} 分钟 · ${esc(editing.task.traffic)}</p></div></div>
        <div class="card mb"><div class="card-h"><span class="card-t">出车方案对比</span></div><div class="card-b"><div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>方式</th><th>已排任务</th><th>出车趟数</th><th>往返里程</th><th>行车时间</th><th>预计费用</th></tr></thead>
          <tbody>${Object.entries(plans).map(([k,p]) => `<tr data-schedule-compare="${k}"><td><b>${names[k]}</b></td><td>${p.count} / ${jobs.length}</td><td>${p.trips.length} 趟</td>
            <td>${p.km} km</td><td>${p.driveMin} 分钟</td><td>¥${money(p.cost)}</td></tr>`).join('')}</tbody></table></div>
          <p class="small mt">${sameTasks ? `同一批已排任务，集中出车${savings >= 0 ? '节省' : '增加'} ¥${money(Math.abs(savings))}。` : '两种方式可安排的任务不同，费用仅统计各自已排行程。'}</p>
          <p class="small muted">估算参数：基地最早 08:30 出车，按沿线桩号差和 ${SPEED} km/h 估算，每段行车时间向上取整。车辆与班组固定费 ${FIXED_COST} 元/趟，行驶费 ${KM_COST} 元/km。</p></div></div>
        <div class="card"><div class="card-h"><span class="card-t">待协调任务</span><span class="sub">${current.pending.length} 项</span></div>
        <div class="card-b" data-schedule-pending>${current.pending.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>任务</th><th>作业窗口</th><th>未排原因</th></tr></thead><tbody>
          ${current.pending.map(({job, reason}) => `<tr><td>${esc(job.task.id)} · ${esc(job.task.type)}</td><td>${windowText(job)}</td><td>${esc(reason)}</td></tr>`).join('')}
          </tbody></table></div>` : '已选任务均已排入行程。'}</div></div>`;
    }
    el.addEventListener('click', e => {
      const button = e.target.closest('[data-schedule-mode],[data-schedule-restore]');
      if (!button) return;
      if (button.dataset.scheduleMode) mode = button.dataset.scheduleMode;
      else overrides.delete(editId);
      render();
    });
    el.addEventListener('change', e => {
      if (e.target.matches('[data-schedule-job]')) { editId = e.target.value; render(); }
    });
    el.addEventListener('input', () => el.querySelector('[data-schedule-end]').setCustomValidity(''));
    el.addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      const start = minutes(form.querySelector('[data-schedule-start]').value);
      const endField = form.querySelector('[data-schedule-end]');
      const end = minutes(endField.value);
      if (end <= start) {
        endField.setCustomValidity('截止时间须晚于开始时间。');
        endField.reportValidity();
        return;
      }
      overrides.set(editId, {day: form.querySelector('[data-schedule-day]').value, start, end});
      render();
      window.UI.toast('已按作业窗口重排', 'ok');
    });
    return render;
  }
  window.TaskScheduling = {mount};
})();
