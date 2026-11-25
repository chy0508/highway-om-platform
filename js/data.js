/* ============================================================
 * 高速公路机电智能运维平台 · 统一模拟数据模型
 * 所有数据均为演示构造，不代表任何真实运营项目
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 确定性随机 ---------- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let s = hash(String(seed)) || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function pad(n, w) { return String(n).padStart(w, '0'); }

  /* ---------- 系统时间基准 ---------- */
  const NOW = new Date(2026, 10, 23, 10, 30, 0);
  function fmtTime(d, mode) {
    const p = (n) => pad(n, 2);
    const date = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    const time = p(d.getHours()) + ':' + p(d.getMinutes());
    if (mode === 'date') return date;
    if (mode === 'full') return date + ' ' + time + ':' + p(d.getSeconds());
    if (mode === 'md') return p(d.getMonth() + 1) + '-' + p(d.getDate());
    return date + ' ' + time;
  }
  function ago(min) { return new Date(NOW.getTime() - min * 60000); }

  /* ---------- 路段与结构物 ---------- */
  const ROAD = { name: 'A高速', start: 0, end: 58, code: 'G-DEMO-A' };
  const TUNNELS = [
    { id: 'QL', name: '青岭隧道', start: 17.8, end: 19.6, length: 1800, lanes: 2, hero: true },
    { id: 'NL', name: '南岭隧道', start: 31.2, end: 33.0, length: 1800, lanes: 2 },
    { id: 'YF', name: '云峰隧道', start: 41.5, end: 42.7, length: 1200, lanes: 2 },
    { id: 'SM', name: '石门隧道', start: 50.3, end: 51.1, length: 800, lanes: 2 }
  ];
  const TOLLS = [
    { id: 'TS-01', name: '青龙收费站', km: 6.2, lanes: 8 },
    { id: 'TS-02', name: '云岭收费站', km: 28.4, lanes: 6 },
    { id: 'TS-03', name: '石门收费站', km: 52.1, lanes: 6 }
  ];
  const ROOMS = [
    { id: 'MR-01', name: '监控中心机房', km: 0.3 },
    { id: 'MR-02', name: '青岭隧道管理站机房', km: 17.2 },
    { id: 'MR-03', name: '南岭隧道管理站机房', km: 33.4 },
    { id: 'MR-04', name: '石门养护工区机房', km: 52.6 }
  ];
  const SECTIONS = [
    { id: 'S1', name: 'K0—K15 起点段', from: 0, to: 15 },
    { id: 'S2', name: 'K15—K30 青岭段', from: 15, to: 30 },
    { id: 'S3', name: 'K30—K45 南岭段', from: 30, to: 45 },
    { id: 'S4', name: 'K45—K58 石门段', from: 45, to: 58 }
  ];
  function kmText(km) {
    const k = Math.floor(km), m = Math.round((km - k) * 1000);
    return 'K' + k + '+' + pad(m, 3);
  }
  function sectionOf(km) { return SECTIONS.find(s => km >= s.from && km < s.to) || SECTIONS[3]; }
  function tunnelOf(km) { return TUNNELS.find(t => km >= t.start && km <= t.end) || null; }

  /* ---------- 专业类别 ---------- */
  const CATS = {
    monitor: { name: '监控设施', color: '#2f7bff', icon: 'cam', total: 320 },
    comm:    { name: '通信设施', color: '#00b8d9', icon: 'net', total: 160 },
    toll:    { name: '收费设施', color: '#8b5cf6', icon: 'etc', total: 210 },
    power:   { name: '供配电设施', color: '#f59e0b', icon: 'pwr', total: 180 },
    tunnel:  { name: '隧道机电', color: '#10b981', icon: 'fan', total: 296 },
    room:    { name: '内场机房', color: '#64748b', icon: 'srv', total: 120 }
  };
  const STATUS = {
    online:  { name: '在线', color: '#16a34a', cls: 'ok' },
    warn:    { name: '异常', color: '#f59e0b', cls: 'warn' },
    offline: { name: '离线', color: '#94a3b8', cls: 'off' }
  };
  const LEVELS = { critical: '严重', major: '重要', minor: '一般', info: '提示' };

  /* ---------- 设备台账 ---------- */
  const devices = [];
  const byCode = {};
  let seq = 0;
  function addDevice(d) {
    seq++;
    const r = rng(d.code);
    const km = d.km;
    const t = tunnelOf(km);
    const dev = Object.assign({
      id: 'A' + pad(seq, 5),
      status: 'online',
      importance: pick(r, ['一般', '重要', '重要', '关键']),
      direction: pick(r, ['北向', '南向', '双向']),
      road: ROAD.name,
      section: sectionOf(km).name,
      tunnel: t ? t.name : (d.place || ''),
      place: d.place || (t ? t.name : ''),
      installDate: '20' + (18 + Math.floor(r() * 6)) + '-' + pad(1 + Math.floor(r() * 12), 2) + '-' + pad(1 + Math.floor(r() * 28), 2),
      runHours: 8000 + Math.floor(r() * 42000),
      lastComm: ago(Math.floor(r() * 4) + 1),
      alarms: [],
      repairs: Math.floor(r() * 5),
      lastRepair: fmtTime(ago(20000 + Math.floor(r() * 90000)), 'date'),
      serial: 'SN' + pad(hash(d.code) % 100000000, 8),
      sourceId: d.sourceId || ({ monitor: 'DS-01', comm: 'DS-02', toll: 'DS-03', power: 'DS-04', tunnel: 'DS-05', room: 'DS-06' })[d.cat],
      lng: +(113.2 + km * 0.011 + (r() - 0.5) * 0.004).toFixed(5),
      lat: +(28.62 + Math.sin(km * 0.32) * 0.05 + (r() - 0.5) * 0.003).toFixed(5)
    }, d);
    dev.kmText = kmText(km);
    devices.push(dev); byCode[dev.code] = dev;
    return dev;
  }

  /* --- 核心演示设备（场景关联锚点，全系统一致） --- */
  const HERO = {};
  // 场景5：摄像机集体离线
  ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04'].forEach((c, i) => {
    HERO[c] = addDevice({
      code: c, name: '青岭隧道北洞摄像机' + (i + 1), cat: 'monitor', type: '高清枪型摄像机',
      vendor: '华视智联', model: 'HV-IPC8200', km: 18.42 + i * 0.06, direction: '北向',
      place: '青岭隧道北洞', status: 'offline', importance: '关键',
      cabinet: 'CAB-03', switchPort: 'SW-12 / GE0/0/' + (i + 1), powerCircuit: 'CAB-03 PoE回路'
    });
    HERO[c].lastComm = new Date(2026, 10, 23, 9, 41 + (i % 2), 12 + i * 17);
  });
  HERO['SW-12'] = addDevice({
    code: 'SW-12', name: '青岭北洞接入交换机12', cat: 'comm', type: '工业接入交换机',
    vendor: '迅联网络', model: 'XL-IS4200-24P', km: 18.50, direction: '北向', place: '青岭隧道北洞',
    status: 'warn', importance: '关键', cabinet: 'CAB-03', uplink: 'FIBER-07'
  });
  HERO['FIBER-07'] = addDevice({
    code: 'FIBER-07', name: '青岭北洞上联光缆链路07', cat: 'comm', type: '光缆链路',
    vendor: '光子通信', model: 'GYTA-24B1', km: 18.10, direction: '北向', place: '青岭隧道—管理站',
    status: 'warn', importance: '关键', uplink: 'OTN-02'
  });
  HERO['CAB-03'] = addDevice({
    code: 'CAB-03', name: '青岭北洞外场机柜03', cat: 'power', type: '外场配电机柜',
    vendor: '中电恒能', model: 'ZH-ODC-380', km: 18.50, direction: '北向', place: '青岭隧道北洞',
    status: 'online', importance: '关键'
  });
  HERO['OTN-02'] = addDevice({
    code: 'OTN-02', name: '青岭管理站光传输设备02', cat: 'comm', type: '光传输设备',
    vendor: '光子通信', model: 'GZ-OTN8600', km: 17.2, place: '青岭隧道管理站机房', importance: '关键'
  });
  // 场景6：照明区域异常 Z-03
  HERO['PDB-02'] = addDevice({
    code: 'PDB-02', name: '青岭北洞照明配电柜02', cat: 'power', type: '照明配电柜',
    vendor: '中电恒能', model: 'ZH-LPD-220', km: 18.55, direction: '北向', place: '青岭隧道北洞配电硐室', importance: '关键'
  });
  HERO['BRK-03'] = addDevice({
    code: 'BRK-03', name: 'Z-03回路断路器', cat: 'power', type: '馈线断路器',
    vendor: '中电恒能', model: 'ZH-MCCB-160', km: 18.55, direction: '北向', place: 'PDB-02 配电柜', importance: '关键'
  });
  HERO['L-CIR-03'] = addDevice({
    code: 'L-CIR-03', name: 'Z-03照明供电回路', cat: 'tunnel', type: '照明回路',
    vendor: '隧安机电', model: '照明回路·220V', km: 18.75, direction: '北向', place: '青岭隧道北洞 Z-03', importance: '关键'
  });
  HERO['LC-01'] = addDevice({
    code: 'LC-01', name: '青岭北洞照明控制器01', cat: 'tunnel', type: '照明控制器',
    vendor: '隧安机电', model: 'TA-LC500', km: 18.55, direction: '北向', place: '青岭隧道北洞配电硐室', importance: '关键'
  });
  for (let i = 1; i <= 18; i++) {
    const c = 'LMP-03-' + pad(i, 2);
    HERO[c] = addDevice({
      code: c, name: 'Z-03分区LED灯具' + pad(i, 2), cat: 'tunnel', type: 'LED照明灯具',
      vendor: '朗明光电', model: 'LM-TL120W', km: 18.66 + i * 0.008, direction: '北向',
      place: '青岭隧道北洞 Z-03', status: 'warn', importance: '重要',
      circuit: 'L-CIR-03', zone: 'Z-03', controller: 'LC-01'
    });
  }
  // 场景8：风机
  for (let i = 1; i <= 4; i++) {
    const c = 'JF-' + pad(i, 2);
    HERO[c] = addDevice({
      code: c, name: '青岭北洞射流风机' + pad(i, 2), cat: 'tunnel', type: '射流风机',
      vendor: '风驰动力', model: 'FC-SDS-30', km: 18.0 + i * 0.3, direction: '北向',
      place: '青岭隧道北洞', importance: '关键', ratedPower: 30, fanIndex: i
    });
  }
  HERO['AF-01'] = addDevice({ code: 'AF-01', name: '青岭北洞轴流风机01', cat: 'tunnel', type: '轴流风机', vendor: '风驰动力', model: 'FC-AF-90', km: 17.85, direction: '北向', place: '青岭隧道北洞洞口', importance: '关键', ratedPower: 90 });
  HERO['COVI-01'] = addDevice({ code: 'COVI-01', name: '青岭北洞CO/VI检测器01', cat: 'tunnel', type: 'CO/VI检测器', vendor: '环测科技', model: 'HC-CV600', km: 18.6, direction: '北向', place: '青岭隧道北洞中部', importance: '关键' });
  HERO['COVI-02'] = addDevice({ code: 'COVI-02', name: '青岭北洞CO/VI检测器02', cat: 'tunnel', type: 'CO/VI检测器', vendor: '环测科技', model: 'HC-CV600', km: 19.3, direction: '北向', place: '青岭隧道北洞出口段', importance: '关键' });
  HERO['BRT-01'] = addDevice({ code: 'BRT-01', name: '青岭洞口亮度检测器', cat: 'tunnel', type: '洞外亮度检测器', vendor: '环测科技', model: 'HC-L20', km: 17.75, direction: '北向', place: '青岭隧道北洞口', importance: '重要' });
  // UPS 蓄电池组
  HERO['UPS-01'] = addDevice({ code: 'UPS-01', name: '监控中心UPS主机01', cat: 'room', type: 'UPS主机', vendor: '稳压时代', model: 'WY-UPS-120K', km: 0.3, place: '监控中心机房', importance: '关键' });
  HERO['BAT-01'] = addDevice({
    code: 'BAT-01', name: '监控中心UPS蓄电池组01', cat: 'power', type: 'UPS蓄电池组',
    vendor: '锂能电源', model: 'LN-12V100Ah×32', km: 0.3, place: '监控中心机房',
    status: 'warn', importance: '关键', cells: 32, installDate: '2019-06-18', sourceId: 'DS-04'
  });
  // 其它重点设备
  HERO['FDR-05'] = addDevice({ code: 'FDR-05', name: '青岭配电所馈线05', cat: 'power', type: '供配电馈线', vendor: '中电恒能', model: 'YJV22-10kV', km: 17.2, place: '青岭隧道管理站机房', importance: '关键' });
  HERO['CSW-01'] = addDevice({ code: 'CSW-01', name: '监控中心核心交换机01', cat: 'room', type: '核心交换机', vendor: '迅联网络', model: 'XL-CS9800', km: 0.3, place: '监控中心机房', importance: '关键', sourceId: 'DS-06' });
  HERO['CAM-057'] = addDevice({ code: 'CAM-057', name: '南岭隧道北洞摄像机57', cat: 'monitor', type: '高清枪型摄像机', vendor: '华视智联', model: 'HV-IPC8200', km: 31.9, direction: '北向', place: '南岭隧道北洞', importance: '重要' });

  /* --- 批量生成其余设备（数量与状态总数严格一致） --- */
  const VENDORS = {
    monitor: ['华视智联', '视通电子', '路眼科技'], comm: ['迅联网络', '光子通信', '恒信通信'],
    toll: ['捷通收费', '慧行科技', '路捷智能'], power: ['中电恒能', '稳压时代', '锂能电源'],
    tunnel: ['隧安机电', '风驰动力', '朗明光电', '环测科技'], room: ['云枢信息', '迅联网络', '稳压时代', '冷源环境']
  };
  // 各类型: [名称, 型号前缀, 数量, km分布方式]
  const PLAN = {
    monitor: [
      ['高清枪型摄像机', 'HV-IPC8200', 200, 'road'], ['车辆检测器', 'LT-VD300', 60, 'road'],
      ['气象检测器', 'HC-WS80', 20, 'spot'], ['视频事件检测设备', 'SY-AIV200', 20, 'road'],
      ['可变信息标志', 'LM-VMS-F', 20, 'spot']
    ],
    comm: [
      ['工业接入交换机', 'XL-IS4200', 70, 'road'], ['光传输设备', 'GZ-OTN8600', 29, 'station'],
      ['工业路由器', 'XL-IR6000', 20, 'station'], ['光缆链路', 'GYTA-24B1', 29, 'road'],
      ['通信电源', 'HX-PS48V', 12, 'station']
    ],
    toll: [
      ['ETC门架系统', 'JT-ETC-G60', 24, 'road'], ['RSU路侧单元', 'HX-RSU500', 48, 'road'],
      ['车道控制器', 'JT-LC210', 54, 'toll'], ['自动栏杆机', 'LJ-BG90', 54, 'toll'],
      ['车牌识别设备', 'SY-LPR800', 30, 'toll']
    ],
    power: [
      ['箱式变压器', 'ZH-BOX-630', 18, 'station'], ['配电柜', 'ZH-LPD-220', 56, 'station'],
      ['供配电馈线', 'YJV22-10kV', 60, 'road'], ['UPS主机', 'WY-UPS-60K', 14, 'station'],
      ['UPS蓄电池组', 'LN-12V100Ah', 14, 'station'], ['柴油发电机', 'KD-GF200', 15, 'station']
    ],
    tunnel: [
      ['LED照明灯具', 'LM-TL120W', 168, 'tunnel'], ['照明回路', '照明回路·220V', 30, 'tunnel'],
      ['射流风机', 'FC-SDS-30', 20, 'tunnel'], ['轴流风机', 'FC-AF-90', 8, 'tunnel'],
      ['CO/VI检测器', 'HC-CV600', 16, 'tunnel'], ['火灾报警主机', 'TA-FA800', 8, 'tunnel'],
      ['紧急电话', 'TA-ET100', 37, 'tunnel'], ['照明控制器', 'TA-LC500', 8, 'tunnel']
    ],
    room: [
      ['应用服务器', 'YS-R740', 40, 'room'], ['存储阵列', 'YS-AS5500', 16, 'room'],
      ['核心交换机', 'XL-CS9800', 8, 'room'], ['UPS主机', 'WY-UPS-120K', 8, 'room'],
      ['精密空调', 'LY-PEX080', 24, 'room'], ['动环监控主机', 'LY-DH300', 24, 'room']
    ]
  };
  const PREFIX = { monitor: 'MON', comm: 'COM', toll: 'TOL', power: 'PWR', tunnel: 'TUN', room: 'RM' };
  const counters = {};
  function nextCode(cat) {
    counters[cat] = (counters[cat] || 0) + 1;
    return PREFIX[cat] + '-' + pad(counters[cat], 3);
  }
  function kmFor(mode, r, idx) {
    if (mode === 'tunnel') { const t = TUNNELS[idx % 4]; return t.start + r() * (t.end - t.start); }
    if (mode === 'toll') { const t = TOLLS[idx % 3]; return t.km + (r() - 0.5) * 0.3; }
    if (mode === 'room') { const m = ROOMS[idx % 4]; return m.km + (r() - 0.5) * 0.15; }
    if (mode === 'station') { const spots = [0.3, 6.2, 17.2, 28.4, 33.4, 41.4, 52.1, 52.6]; return spots[idx % spots.length] + (r() - 0.5) * 0.2; }
    if (mode === 'spot') return 2 + (idx * 2.7) % 54 + r();
    return 0.5 + r() * 57;
  }
  Object.keys(PLAN).forEach(cat => {
    PLAN[cat].forEach(([type, model, count, mode]) => {
      // 扣除已建的核心设备数量
      const heroCount = Object.values(HERO).filter(h => h.cat === cat && h.type === type).length;
      const need = count - heroCount;
      for (let i = 0; i < need; i++) {
        const code = nextCode(cat);
        const r = rng(code);
        const km = kmFor(mode, r, i);
        const t = tunnelOf(km);
        const near = TOLLS.find(x => Math.abs(x.km - km) < 0.4);
        const rm = ROOMS.find(x => Math.abs(x.km - km) < 0.3);
        addDevice({
          code, name: (t ? t.name : near ? near.name : rm ? rm.name : ROAD.name) + type + pad(counters[cat], 2),
          cat, type, vendor: pick(r, VENDORS[cat]), model, km,
          place: t ? t.name : near ? near.name : rm ? rm.name : sectionOf(km).name,
          ratedPower: type === '射流风机' ? 30 : type === '轴流风机' ? 90 : undefined
        });
      }
    });
  });

  /* --- 状态精确分配：离线18 / 异常21 --- */
  const offlineTargets = { monitor: 3, comm: 2, toll: 4, power: 0, tunnel: 4, room: 1 };
  const offlinePool = {
    monitor: ['MON-041', 'MON-078', 'MON-133'],
    comm: ['COM-019', 'COM-052'],
    toll: ['TOL-023', 'TOL-061', 'TOL-097', 'TOL-142'],
    tunnel: ['TUN-104', 'TUN-118', 'TUN-152', 'TUN-171'],
    room: ['RM-031']
  };
  Object.keys(offlinePool).forEach(cat => {
    offlinePool[cat].forEach(code => {
      const d = byCode[code];
      if (d) { d.status = 'offline'; d.lastComm = ago(180 + Math.floor(rng(code)() * 2000)); }
    });
  });

  /* ---------- 告警 ---------- */
  const alarms = [];
  let alarmSeq = 0;
  function addAlarm(code, type, level, startMin, desc, status, endMin) {
    alarmSeq++;
    const a = {
      id: 'AL-' + pad(alarmSeq, 4), code, asset: code, type, level,
      start: ago(startMin), end: endMin != null ? ago(endMin) : null,
      status: status || 'active', desc,
      sourceId: byCode[code] ? byCode[code].sourceId : 'DS-01'
    };
    alarms.push(a);
    if (byCode[code]) byCode[code].alarms.push(a);
    return a;
  }
  // 场景5 时序（09:38—09:42）
  addAlarm('FIBER-07', '光功率劣化', 'major', 52, '接收光功率由 -12.4dBm 降至 -27.8dBm，低于门限 -25dBm', 'active');
  addAlarm('SW-12', '上联端口Down', 'critical', 49, '上联光口 GE0/0/25 状态 Down，误码率突增后链路中断', 'active');
  addAlarm('CAM-01', '设备离线', 'major', 48.8, '心跳丢失，视频码流中断', 'active');
  addAlarm('CAM-02', '设备离线', 'major', 48.5, '心跳丢失，视频码流中断', 'active');
  addAlarm('CAM-03', '设备离线', 'major', 48.2, '心跳丢失，视频码流中断', 'active');
  addAlarm('CAM-04', '设备离线', 'major', 47.9, '心跳丢失，视频码流中断', 'active');
  // 场景6（08:15）
  addAlarm('L-CIR-03', '回路电流异常', 'critical', 135, 'Z-03回路电流由 16.2A 突降至 0.4A，18盏灯具反馈异常', 'active');
  addAlarm('BRK-03', '断路器状态异常', 'major', 134, '断路器反馈信号与指令不一致（指令合闸/反馈分闸）', 'active');
  for (let i = 1; i <= 18; i++) addAlarm('LMP-03-' + pad(i, 2), '灯具反馈异常', 'minor', 133 - i * 0.1, '灯具无回馈，照度检测低于阈值', 'active');
  // UPS
  addAlarm('BAT-01', '单体电压离散', 'major', 2880, '#07/#12/#19 单体浮充电压偏低，内阻上升超过基线35%', 'active');
  // 其它散布告警（近7天）
  const miscAlarms = [
    ['MON-041', '设备离线', 'major', 300, 'active'], ['MON-078', '设备离线', 'major', 760, 'active'],
    ['MON-133', '图像质量异常', 'minor', 1500, 'active'], ['COM-019', '端口丢包', 'minor', 2200, 'active'],
    ['COM-052', '设备离线', 'major', 420, 'active'], ['TOL-023', '交易异常', 'major', 260, 'active'],
    ['TOL-061', '设备离线', 'major', 980, 'active'], ['TOL-097', '识别率下降', 'minor', 1600, 'active'],
    ['TOL-142', '设备离线', 'major', 2100, 'active'], ['TUN-104', '回路绝缘告警', 'minor', 3000, 'active'],
    ['TUN-118', '设备离线', 'major', 500, 'active'], ['TUN-152', '反馈超时', 'minor', 1300, 'active'],
    ['TUN-171', '设备离线', 'major', 3600, 'active'], ['RM-031', '设备离线', 'major', 640, 'active'],
    ['FDR-05', '负载率偏高', 'minor', 4300, 'resolved'], ['CSW-01', 'CPU利用率偏高', 'minor', 5100, 'resolved'],
    ['JF-02', '运行时长超保养周期', 'info', 6000, 'resolved'], ['CAM-057', '重启次数偏多', 'minor', 7000, 'resolved'],
    ['UPS-01', '旁路电压波动', 'minor', 8200, 'resolved'], ['MON-022', '码流中断', 'minor', 9000, 'resolved'],
    ['TOL-008', '栏杆机动作超时', 'minor', 9800, 'resolved'], ['TUN-021', '照度偏低', 'minor', 10500, 'resolved'],
    ['COM-006', '光功率偏低', 'minor', 11000, 'resolved'], ['PWR-014', '温度偏高', 'minor', 12000, 'resolved'],
    ['RM-012', '存储容量预警', 'info', 13000, 'resolved'], ['MON-095', '设备离线', 'major', 14000, 'resolved'],
    ['TOL-033', '通信超时', 'minor', 15000, 'resolved'], ['TUN-066', '风机振动偏大', 'minor', 16000, 'resolved'],
    ['CAM-02', '图像遮挡', 'minor', 17000, 'resolved'], ['SW-12', '端口CRC错误', 'minor', 18000, 'resolved']
  ];
  miscAlarms.forEach(([c, t, l, m, s]) => { if (byCode[c]) addAlarm(c, t, l, m, t + '（历史告警）', s, m - 60 - Math.floor(rng(c + t)() * 500)); });

  /* ---------- 设备关系 ---------- */
  const relations = [];
  function rel(s, t, type, status, note) { relations.push({ source: s, target: t, type, status: status || 'normal', note: note || '' }); }
  ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04'].forEach((c, i) => {
    rel(c, 'SW-12', '网络上联', 'down', 'GE0/0/' + (i + 1));
    rel('CAB-03', c, '供电回路', 'normal', 'PoE供电（经SW-12）');
  });
  rel('SW-12', 'FIBER-07', '光链路', 'down', '上联光口 GE0/0/25');
  rel('FIBER-07', 'OTN-02', '光链路', 'warn', '管理站侧收光正常');
  rel('CAB-03', 'SW-12', '供电回路', 'normal', 'AC220V→DC48V');
  rel('OTN-02', 'CSW-01', '网络上联', 'normal', '骨干环网');
  rel('PDB-02', 'BRK-03', '供电回路', 'warn', 'Z-03馈线');
  rel('BRK-03', 'L-CIR-03', '供电回路', 'down', '回路电流 0.4A');
  for (let i = 1; i <= 18; i++) rel('L-CIR-03', 'LMP-03-' + pad(i, 2), '供电回路', 'down', 'Z-03分组');
  rel('LC-01', 'L-CIR-03', '控制指令', 'warn', '调光/开关指令');
  rel('LC-01', 'SW-12', '网络上联', 'normal', '控制通信');
  rel('FDR-05', 'PDB-02', '供电回路', 'normal', '10kV/0.4kV');
  rel('UPS-01', 'BAT-01', '供电回路', 'warn', '直流母线');
  rel('UPS-01', 'CSW-01', '供电回路', 'normal', 'UPS输出');
  for (let i = 1; i <= 4; i++) rel('CAB-03', 'JF-' + pad(i, 2), '供电回路', 'normal', '风机动力回路');
  rel('COVI-01', 'SW-12', '网络上联', 'normal', '环境数据上送');

  /* ---------- 诊断事件 ---------- */
  // Historical records for one registered camera. These samples do not change its live status.
  const dropoutWindows = [
    {
      date: '2026-11-20', visit: '09:20:00', visitV: 229,
      episodes: [
        { loss: '08:41:03', seconds: 19, supply: '08:41:00', voltage: 174, dip: true, port: '08:41:02' },
        { loss: '08:50:08', seconds: 27, supply: '08:50:03', voltage: 178, dip: true, port: '08:50:07' },
        { loss: '08:58:14', seconds: 22, supply: '08:58:10', voltage: 176, dip: true, port: '08:58:12' }
      ]
    },
    {
      date: '2026-11-21', visit: '15:10:00', visitV: 230,
      episodes: [
        { loss: '14:17:08', seconds: 16, supply: '14:17:00', voltage: 229, dip: false, port: '14:17:06' },
        { loss: '14:29:13', seconds: 24, supply: '14:29:07', voltage: 230, dip: false, port: '14:29:10' },
        { loss: '14:35:22', seconds: 18, supply: '14:35:16', voltage: 229, dip: false, port: '14:35:19' }
      ]
    }
  ];
  const events = [
    {
      id: 'EV-1123-01', name: '青岭隧道北洞摄像机集体离线', cat: 'monitor', type: '设备离线',
      level: '严重', time: ago(48), km: 18.5, place: '青岭隧道北洞 K18+500',
      affected: ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04'], related: ['SW-12', 'FIBER-07', 'CAB-03', 'OTN-02'],
      status: '已生成候选原因', page: 'scene-camera', duration: '48分钟',
      summary: '4台摄像机在78秒内相继离线，共用接入交换机SW-12；上联光链路FIBER-07光功率劣化先于摄像机离线发生。',
      candidate: '优先排查 SW-12 上联光链路 FIBER-07（关联评分 86）', score: 86
    },
    {
      id: 'EV-1123-02', name: '青岭隧道Z-03照明分区异常', cat: 'tunnel', type: '照明区域异常',
      level: '严重', time: ago(135), km: 18.75, place: '青岭隧道北洞 Z-03分区',
      affected: Array.from({ length: 18 }, (_, i) => 'LMP-03-' + pad(i + 1, 2)),
      related: ['L-CIR-03', 'BRK-03', 'PDB-02', 'LC-01'],
      status: '现场待确认', page: 'scene-lighting', duration: '2小时15分钟',
      summary: 'Z-03分区18盏灯具同时失去反馈，回路电流0.4A；控制指令与断路器反馈不一致，异常集中于同一供电回路。',
      candidate: '优先检查 BRK-03 断路器及 L-CIR-03 回路（关联评分 82）', score: 82
    },
    {
      id: 'EV-1121-03', name: '监控中心UPS蓄电池组单体离散', cat: 'power', type: '运行参数异常',
      level: '重要', time: ago(2880), km: 0.3, place: '监控中心机房',
      affected: ['BAT-01'], related: ['UPS-01'], status: '已生成候选原因', page: 'ups', duration: '2天',
      summary: '#07/#12/#19单体浮充电压偏低、内阻较投运基线上升35%以上，建议核对性放电测试。',
      candidate: '疑似3节单体老化，建议容量核查后评估分批更新（方案测算）', score: 74
    },
    {
      id: 'EV-1123-04', name: '青龙收费站车道设备通信超时', cat: 'toll', type: '通信链路异常',
      level: '重要', time: ago(260), km: 6.2, place: '青龙收费站 3号车道',
      affected: ['TOL-023', 'TOL-061'], related: ['COM-019'], status: '分析中', page: 'diagnosis', duration: '4小时20分钟',
      summary: '2台车道设备交易/通信异常聚集，接入交换机COM-019存在端口丢包，正在关联分析。',
      candidate: '候选：COM-019 端口或车道链路（分析中）', score: 58
    },
    {
      id: 'EV-1122-05', name: '南岭隧道照明回路绝缘告警', cat: 'tunnel', type: '供电异常',
      level: '一般', time: ago(3000), km: 32.1, place: '南岭隧道北洞',
      affected: ['TUN-104'], related: [], status: '现场待确认', page: 'diagnosis', duration: '2天2小时',
      summary: '回路绝缘监测值低于预警阈值，未影响供电，建议结合下次巡检核查。',
      candidate: '候选：回路绝缘老化或接线盒受潮', score: 51
    },
    {
      id: 'EV-1120-06', name: '监控中心核心交换机CPU偏高', cat: 'room', type: '运行参数异常',
      level: '一般', time: ago(5100), km: 0.3, place: '监控中心机房',
      affected: ['CSW-01'], related: [], status: '已恢复', page: 'diagnosis', duration: '3小时40分钟（已恢复）',
      summary: 'CPU利用率短时达到82%，与视频调阅高峰重合，已自动恢复。',
      candidate: '已恢复：业务高峰负载，无需处置', score: 0
    },
    {
      id: 'EV-1120-08', name: '南岭北洞摄像机间歇掉线', cat: 'monitor', type: '间歇掉线',
      level: '一般', time: new Date(2026, 10, 20, 8, 41, 3), km: byCode['CAM-057'].km, place: byCode['CAM-057'].place,
      affected: ['CAM-057'], related: [], status: '现场待确认', page: 'diagnosis',
      duration: dropoutWindows.reduce((sum,w) => sum + w.episodes.reduce((s,r) => s + r.seconds, 0), 0) + '秒（累计）',
      summary: '两个历史时段均有短时视频中断，到场时设备已恢复在线。',
      candidate: '分时段核对机柜供电、通信端口与视频中断顺序', score: null, traceWindows: dropoutWindows
    },
    {
      id: 'EV-1119-07', name: 'K8路段气象检测器数据中断', cat: 'monitor', type: '设备离线',
      level: '一般', time: ago(6400), km: 8.29, place: 'K8+290 气象站',
      affected: ['MON-258'], related: [], status: '已确认/已恢复', page: 'diagnosis', duration: '已恢复',
      summary: '现场确认供电空开跳闸，复位后恢复。已确认故障原因：供电空开跳闸（确认记录）。',
      candidate: '已确认：供电空开跳闸', score: 0
    }
  ];

  /* ---------- 数据源 ---------- */
  const sources = [
    { id: 'DS-01', name: '视频监控平台', vendor: '华视智联 iVMS-Demo', cat: 'monitor', access: 'API接口', status: '正常', latency: 1.2, sync: ago(1), errors: 0, types: '在线状态/心跳/码流/图像质量/告警', api: 'REST /v2/devices · /v2/alarms', freq: '30秒轮询' },
    { id: 'DS-02', name: '通信网管系统', vendor: '迅联网络 NetView-Demo', cat: 'comm', access: '标准协议', status: '正常', latency: 2.8, sync: ago(1), errors: 2, types: '端口状态/丢包/误码/光功率/温度', api: 'SNMP v3 + Syslog', freq: '60秒采集' },
    { id: 'DS-03', name: '收费业务系统', vendor: '捷通收费 TollCore-Demo', cat: 'toll', access: '数据库只读视图', status: '正常', latency: 5.5, sync: ago(2), errors: 1, types: '设备状态/交易异常/识别异常/故障代码', api: 'Oracle 视图 V_DEVICE_STATUS', freq: '5分钟同步' },
    { id: 'DS-04', name: '电力监控系统', vendor: '中电恒能 PowerSC-Demo', cat: 'power', access: 'API接口', status: '延迟', latency: 46, sync: ago(6), errors: 12, types: '电压/电流/负载率/开关状态/电池参数', api: 'REST /api/realtime · Modbus网关', freq: '15秒采集' },
    { id: 'DS-05', name: '隧道控制系统', vendor: '隧安机电 TunnelSC-Demo', cat: 'tunnel', access: '边缘网关', status: '部分中断', latency: 8.4, sync: ago(3), errors: 26, types: '风机启停/照明回路/CO/VI/亮度/控制反馈', api: '边缘网关 EG-QL-01 · OPC UA', freq: '10秒采集' },
    { id: 'DS-06', name: '机房动环系统', vendor: '冷源环境 DCIM-Demo', cat: 'room', access: 'API接口', status: '正常', latency: 3.1, sync: ago(1), errors: 0, types: '温湿度/CPU/存储/电源/空调状态', api: 'REST /dcim/metrics', freq: '60秒轮询' },
    { id: 'DS-07', name: '养护台账文件', vendor: '运营单位台账导出', cat: 'power', access: '文件/批量同步', status: '正常', latency: null, sync: ago(1440), errors: 0, types: '资产台账/维修记录/备件更换（非实时）', api: 'CSV 批次 BATCH-1122', freq: '每日02:00' }
  ];
  sources.forEach(s => { s.deviceCount = devices.filter(d => d.sourceId === s.id).length; });

  const fieldMappings = [
    { src: 'device_code', dst: 'asset_code', rule: '编码映射表 MAP-01', source: 'DS-01' },
    { src: 'dev_status (0/1)', dst: 'status (online/offline)', rule: '枚举转换', source: 'DS-01' },
    { src: 'alarmLevel (1-4)', dst: 'level (info/minor/major/critical)', rule: '枚举转换', source: 'DS-01' },
    { src: 'port_rx_power', dst: 'telemetry.optical_power (dBm)', rule: '单位标准化', source: 'DS-02' },
    { src: 'TRANS_ERR_CNT', dst: 'telemetry.transaction_error', rule: '字段重命名', source: 'DS-03' },
    { src: 'Ia/Ib/Ic', dst: 'telemetry.current_a/b/c (A)', rule: '单位标准化', source: 'DS-04' },
    { src: 'fan_run_fb', dst: 'status.running (bool)', rule: '布尔转换', source: 'DS-05' },
    { src: 'ts_local', dst: 'timestamp (UTC+8)', rule: '时间对齐', source: 'DS-05' }
  ];
  const qualityIssues = [
    { rule: '采集时间超时', hits: 26, source: 'DS-05', detail: 'EG-QL-01 网关上送延迟>30s，涉及Z-04分区照度点位', last: ago(3) },
    { rule: '连续值突变', hits: 4, source: 'DS-04', detail: 'FDR-05 电流采样出现瞬时跳变，已标记质量位', last: ago(46) },
    { rule: '设备编码无法映射', hits: 2, source: 'DS-03', detail: 'TOL-新增车道设备2条记录待映射', last: ago(120) },
    { rule: '单位缺失', hits: 1, source: 'DS-04', detail: '电池温度字段缺少单位声明，按℃处理并标记', last: ago(300) },
    { rule: '数据重复', hits: 3, source: 'DS-02', detail: 'Syslog重复上送，已按消息ID去重', last: ago(500) }
  ];

  /* ---------- 时序生成 ---------- */
  function series(seed, n, base, amp, opt) {
    opt = opt || {};
    const r = rng(seed); const out = [];
    let v = base;
    for (let i = 0; i < n; i++) {
      const day = opt.daily ? Math.sin((i / n) * Math.PI * 2 * (opt.cycles || 1) - Math.PI / 2) : 0;
      v = base + day * amp * 0.6 + (r() - 0.5) * amp * 0.5 + (opt.drift ? opt.drift * i / n : 0);
      if (opt.dropAt != null && i >= opt.dropAt) v = opt.dropTo + (r() - 0.5) * amp * 0.08;
      if (opt.spikeAt != null && Math.abs(i - opt.spikeAt) < 2) v += opt.spike || amp;
      out.push(+v.toFixed(opt.fix != null ? opt.fix : 2));
    }
    return out;
  }
  function hoursAxis(n, stepH) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(fmtTime(new Date(NOW.getTime() - i * stepH * 3600000), i * stepH >= 24 ? 'md' : 'hm'));
    return out;
  }
  // hm 格式补充
  const _fmt = fmtTime;
  fmtTime = function (d, mode) {
    if (mode === 'hm') return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2);
    return _fmt(d, mode);
  };

  /* ---------- UPS 电池单体 ---------- */
  const cells = [];
  (function () {
    const r = rng('BAT-01-cells');
    const bad = { 7: 1, 12: 1, 19: 1 };
    for (let i = 1; i <= 32; i++) {
      const isBad = bad[i];
      cells.push({
        no: i,
        voltage: +(isBad ? 12.42 + r() * 0.2 : 13.52 + r() * 0.12).toFixed(2),
        resistance: +(isBad ? 8.6 + r() * 1.6 : 4.8 + r() * 0.9).toFixed(2),
        temp: +(isBad ? 31 + r() * 3 : 24 + r() * 3).toFixed(1),
        capacity: +(isBad ? 62 + r() * 8 : 88 + r() * 9).toFixed(0),
        status: isBad ? 'warn' : 'online'
      });
    }
  })();

  /* ---------- 现场任务与资源 ---------- */
  const tasks = [
    { id: 'FT-01', tunnel: '青岭隧道', km: 18.5, asset: 'JF-01', type: '风机季度检测', items: '振动/电流/绝缘检测', duration: 2.0, skill: '机电检测·中级', instrument: '振动分析仪+绝缘电阻表', window: '周三 09:00—12:00', traffic: '需封闭北洞检修道', source: '设备检测周期', group: 'A' },
    { id: 'FT-02', tunnel: '青岭隧道', km: 18.75, asset: 'L-CIR-03', type: '照明回路核查', items: '回路绝缘/断路器核查', duration: 1.5, skill: '电工作业·高压证', instrument: '绝缘电阻表+万用表', window: '周三 09:00—12:00', traffic: '需封闭北洞检修道', eventId: 'EV-1123-02', group: 'A' },
    { id: 'FT-03', tunnel: '青岭隧道', km: 18.5, asset: 'SW-12', type: '光链路排查', items: '光功率测试/熔接检查', duration: 1.0, skill: '通信维护·光缆证', instrument: 'OTDR+光功率计', window: '周三 09:00—14:00', traffic: '检修道作业', eventId: 'EV-1123-01', group: 'B' },
    { id: 'FT-04', tunnel: '南岭隧道', km: 32.1, asset: 'TUN-104', type: '照明回路绝缘核查', items: '绝缘检测/接线盒检查', duration: 1.5, skill: '电工作业·高压证', instrument: '绝缘电阻表+万用表', window: '周三 13:00—17:00', traffic: '需封闭北洞检修道', eventId: 'EV-1122-05', group: 'A' },
    { id: 'FT-05', tunnel: '南岭隧道', km: 32.6, asset: 'COVI-01', type: 'CO/VI标定', items: '标气标定/光路清洁', duration: 1.0, skill: '机电检测·中级', instrument: '标定气体套件', window: '周三 13:00—17:00', traffic: '检修道作业', source: '设备检测周期', group: 'A' },
    { id: 'FT-06', tunnel: '云峰隧道', km: 42.0, asset: 'TUN-152', type: '风机控制反馈核查', items: '控制回路/反馈信号', duration: 1.5, skill: '机电检测·中级', instrument: '万用表+信号发生器', window: '周四 09:00—12:00', traffic: '需封闭北洞检修道', source: '设备异常建议', group: 'C' },
    { id: 'FT-07', tunnel: '石门隧道', km: 50.7, asset: 'TUN-171', type: '紧急电话巡检', items: '通话测试/线路检查', duration: 1.0, skill: '通信维护·光缆证', instrument: '查线仪+万用表', window: '周四 09:00—14:00', traffic: '检修道作业', source: '计划性检查', group: 'B' },
    { id: 'FT-08', tunnel: '监控中心机房', km: 0.3, asset: 'BAT-01', type: 'UPS核对性放电', items: '容量测试/单体测量', duration: 3.0, skill: '电工作业·高压证', instrument: '放电仪+内阻测试仪', window: '周三 09:00—17:00', traffic: '无需交通管制', eventId: 'EV-1121-03', group: 'D' }
  ];
  const teams = [
    { id: 'TM-A', name: '机电一班', skills: ['机电检测·中级', '电工作业·高压证'], members: 3, vehicle: '养护车 粤A·D021', available: '周三 全天', instruments: ['振动分析仪', '绝缘电阻表', '万用表', '标定气体套件'] },
    { id: 'TM-B', name: '通信班', skills: ['通信维护·光缆证'], members: 2, vehicle: '通信作业车 粤A·D077', available: '周三/周四', instruments: ['OTDR', '光功率计', '查线仪', '万用表'] },
    { id: 'TM-C', name: '机电二班', skills: ['机电检测·中级'], members: 2, vehicle: '养护车 粤A·D035', available: '周四 全天', instruments: ['万用表', '信号发生器'] }
  ];

  /* ---------- 成本 ---------- */
  const costMonths = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const costCats = [
    { key: 'energy', name: '能源费用', color: '#2f7bff' },
    { key: 'parts', name: '备品备件', color: '#00b8d9' },
    { key: 'service', name: '维修服务', color: '#f59e0b' },
    { key: 'field', name: '现场作业', color: '#8b5cf6' },
    { key: 'emergency', name: '应急支出', color: '#ef4444' }
  ];
  const costMonthly = costMonths.map((m, i) => {
    const r = rng('cost' + m);
    return {
      month: m,
      energy: 38.2 + i * 1.1 + r() * 3, parts: 6.5 + r() * 4 + (i === 4 ? 5.2 : 0),
      service: 8.8 + r() * 3, field: 5.2 + r() * 2.4, emergency: i === 2 ? 6.8 : 0.8 + r() * 1.6
    };
  });
  const costRecords = [];
  (function () {
    const recs = [
      ['energy', 12.6, 'JF-01', '青岭隧道', '2026-11', '风机运行电费（含JF-01~04）', '供电局'],
      ['energy', 9.8, 'L-CIR-03', '青岭隧道', '2026-11', '照明回路电费（北洞）', '供电局'],
      ['energy', 6.2, 'UPS-01', '监控中心机房', '2026-11', '机房UPS及空调电费', '供电局'],
      ['parts', 4.8, 'BAT-01', '监控中心机房', '2026-10', '蓄电池单体更换×4', '锂能电源'],
      ['parts', 2.6, 'CAM-057', '南岭隧道', '2026-09', '摄像机电源模块×2', '华视智联'],
      ['parts', 3.4, 'TOL-061', '青龙收费站', '2026-10', '栏杆机机芯组件', '路捷智能'],
      ['service', 3.2, 'SW-12', '青岭隧道', '2026-11', '交换机维保服务（年费分摊）', '迅联网络'],
      ['service', 2.8, 'FDR-05', '青岭管理站', '2026-08', '馈线预防性试验', '中电恒能'],
      ['service', 2.2, 'CSW-01', '监控中心机房', '2026-07', '核心交换机原厂维保', '迅联网络'],
      ['field', 1.8, 'JF-02', '青岭隧道', '2026-10', '风机季度检测出车', '机电一班'],
      ['field', 1.5, 'TUN-104', '南岭隧道', '2026-11', '照明回路核查出车', '机电一班'],
      ['field', 1.2, 'MON-041', 'K12路段', '2026-11', '摄像机离线排查出车', '通信班'],
      ['emergency', 6.8, 'PDB-02', '青岭隧道', '2026-08', '配电柜应急抢修（雷击）', '中电恒能'],
      ['emergency', 1.4, 'TOL-023', '青龙收费站', '2026-11', '车道设备应急处置', '捷通收费'],
      ['service', 1.9, 'BAT-01', '监控中心机房', '2026-09', '电池组容量检测服务', '锂能电源'],
      ['parts', 1.6, 'LMP-03-05', '青岭隧道', '2026-07', 'LED驱动电源×6', '朗明光电']
    ];
    recs.forEach((x, i) => costRecords.push({ id: 'COST-' + pad(i + 1, 3), cat: x[0], amount: x[1], asset: x[2], location: x[3], month: x[4], desc: x[5], supplier: x[6] }));
  })();
  const deviceCostRank = [
    { code: 'BAT-01', name: 'UPS蓄电池组01', total: 9.6, note: '重复维修：近12个月单体更换3次' },
    { code: 'JF-01', name: '青岭射流风机组', total: 14.4, note: '能源费用为主（4台合计）' },
    { code: 'PDB-02', name: '照明配电柜02', total: 7.6, note: '含8月雷击应急抢修' },
    { code: 'TOL-061', name: '青龙收费站栏杆机', total: 5.2, note: '机芯组件更换2次' },
    { code: 'SW-12', name: '青岭接入交换机12', total: 4.1, note: '维保+光模块备件' },
    { code: 'CAM-057', name: '南岭摄像机57', total: 3.8, note: '电源模块重复故障' }
  ];

  /* ---------- 成效指标 ---------- */
  const kpis = [
    { key: 'coverage', name: '设备监测覆盖率', unit: '%', baseline: 61.5, current: 96.8, better: 'up', def: '有效接入并持续上报数据的设备数 / 纳入范围设备数', src: '统一数据底座·设备心跳', trend: [61.5, 72.4, 83.1, 90.2, 94.6, 96.8] },
    { key: 'integrity', name: '数据完整率', unit: '%', baseline: 82.3, current: 98.1, better: 'up', def: '有效数据点数 / 预期数据点数', src: '数据质量校验模块', trend: [82.3, 88.6, 92.4, 95.1, 97.2, 98.1] },
    { key: 'locate', name: '平均故障定位时间', unit: '小时', baseline: 6.8, current: 1.9, better: 'down', def: '根因确认时间 − 首次异常发现时间（已验证案例均值）', src: '诊断事件·现场确认记录', trend: [6.8, 5.2, 3.8, 2.9, 2.3, 1.9] },
    { key: 'accuracy', name: '根因诊断准确率', unit: '%', baseline: null, current: 78.6, better: 'up', def: '现场确认正确的诊断案例数 / 已验证诊断案例数（样本28例）', src: '诊断事件·验证状态', trend: [null, null, 64.3, 70.8, 75.0, 78.6] },
    { key: 'mileage', name: '单位任务行驶里程', unit: 'km/任务', baseline: 46.2, current: 27.5, better: 'down', def: '运维车辆总里程 / 完成的现场任务数', src: '任务统筹·车辆记录', trend: [46.2, 41.8, 36.5, 32.1, 29.4, 27.5] },
    { key: 'perTrip', name: '单次出车任务量', unit: '任务/次', baseline: 1.2, current: 2.6, better: 'up', def: '单次出车完成任务数的平均值', src: '任务统筹·任务包记录', trend: [1.2, 1.5, 1.8, 2.1, 2.4, 2.6] },
    { key: 'energy', name: '单位工况能耗', unit: 'kWh/千车·km', baseline: 3.42, current: 3.05, better: 'down', def: '按交通量、环境参数与运行时长归一化后的隧道机电能耗', src: '能耗记录·工况归一化', trend: [3.42, 3.36, 3.24, 3.16, 3.09, 3.05] },
    { key: 'cost', name: '设备年均运维成本', unit: '万元/百台', baseline: 18.6, current: 16.2, better: 'down', def: '设备相关维修、备件、服务和现场作业成本 / 设备年数', src: '成本记录（统计口径）', trend: [18.6, 18.1, 17.5, 17.0, 16.6, 16.2] }
  ];

  /* ---------- 基础配置 ---------- */
  const configs = [
    { id: 'CFG-01', name: '统一设备编码规则', type: '编码规则', cat: '全专业', updated: '2026-11-10', status: '启用', affected: 1286, detail: '规则：专业前缀-序号（MON/COM/TOL/PWR/TUN/RM），核心设备保留场景编码（CAM-01、SW-12等）。' },
    { id: 'CFG-02', name: '设备类别字典', type: '类别字典', cat: '全专业', updated: '2026-11-08', status: '启用', affected: 1286, detail: '六大专业类别与38个设备类型的字典定义，含参数模板绑定。' },
    { id: 'CFG-03', name: '厂家编码映射表 MAP-01', type: '编码映射', cat: '监控', updated: '2026-11-18', status: '启用', affected: 320, detail: '华视智联 device_code → 统一 asset_code；示例：HV-N-0182 → CAM-01。' },
    { id: 'CFG-04', name: '数据源字段映射', type: '字段映射', cat: '多专业', updated: '2026-11-20', status: '启用', affected: 1286, detail: '8条字段映射规则，见字段映射明细。' },
    { id: 'CFG-05', name: '供电/通信/控制关系', type: '设备关系', cat: '多专业', updated: '2026-11-21', status: '启用', affected: 64, detail: 'CAM-01~04→SW-12（端口1-4）；SW-12→FIBER-07；CAB-03供电；Z-03照明链路等。' },
    { id: 'CFG-06', name: '数据质量规则集', type: '质量规则', cat: '全专业', updated: '2026-11-15', status: '启用', affected: 1286, detail: '采集超时/单位缺失/连续值突变/编码无法映射/数据重复 5类规则。' },
    { id: 'CFG-07', name: '告警级别口径', type: '口径规则', cat: '全专业', updated: '2026-11-05', status: '启用', affected: 1286, detail: '严重/重要/一般/提示 四级，统一各厂家告警级别枚举。' }
  ];

  const linkedTasks = tasks.filter(t => t.eventId);
  const originalStatus = new Map(events.map(e => [e.id, e.status]));
  const reviewKey = taskId => 'om-task-review-v1:' + taskId;
  linkedTasks.forEach(t => { t.source = '诊断事件 ' + t.eventId; });
  const cameraEvent = events.find(e => e.id === 'EV-1123-01');
  const cameraTask = linkedTasks.find(t => t.eventId === cameraEvent.id);
  const cameraAssets = [...cameraEvent.affected, 'SW-12', 'FIBER-07'];
  const cameraBaseline = new Map(cameraAssets.map(code => [code, { status: byCode[code].status, lastComm: byCode[code].lastComm }]));
  const incidentAlarms = alarms.filter(a => cameraBaseline.has(a.asset) && a.status === 'active');
  const incidentLinks = relations.filter(r => cameraBaseline.has(r.source) && r.status !== 'normal')
    .map(link => ({ link, initial: link.status }));
  const catStats = {};

  function validCameraChecks(checks) {
    return checks && cameraEvent.affected.every(code => ['offline', 'frozen', 'live'].includes(checks.streams?.[code])) &&
      ['playback', 'stable', 'link'].every(key => typeof checks[key] === 'boolean');
  }
  function cameraOutcome(checks) {
    return validCameraChecks(checks) && checks.playback && checks.stable &&
      cameraEvent.affected.every(code => checks.streams[code] === 'live') ? 'verified' : 'unresolved';
  }
  function describeCameraChecks(checks) {
    if (!validCameraChecks(checks)) return '旧核验记录缺少逐路视频、录像回放及稳定观察结果，待补录。';
    const frozen = cameraEvent.affected.filter(code => checks.streams[code] === 'frozen');
    const offline = cameraEvent.affected.filter(code => checks.streams[code] === 'offline');
    return [
      frozen.length && (frozen.join('、') + ' 在线但画面冻结'),
      offline.length && (offline.join('、') + ' 仍离线'),
      '实时画面正常 ' + (cameraEvent.affected.length - frozen.length - offline.length) + '/4 路',
      '录像回放' + (checks.playback ? '通过' : '待复核'),
      '稳定观察' + (checks.stable ? '通过' : '待复核')
    ].filter(Boolean).join(' · ');
  }
  function applyCameraChecks(review) {
    const checks = validCameraChecks(review?.checks) ? review.checks : null;
    cameraEvent.recoverySummary = review ? describeCameraChecks(checks) : '';
    const hasSignal = checks && cameraEvent.affected.some(code => checks.streams[code] !== 'offline');
    const uplinkUp = hasSignal || checks?.link;
    for (const code of cameraAssets) {
      const device = byCode[code], initial = cameraBaseline.get(code);
      let status = initial.status;
      if (cameraEvent.affected.includes(code) && checks) status = { live: 'online', frozen: 'warn', offline: 'offline' }[checks.streams[code]];
      if ((code === 'SW-12' && uplinkUp) || (code === 'FIBER-07' && checks?.link)) status = 'online';
      device.status = status;
      device.lastComm = checks && status !== 'offline' ? NOW : initial.lastComm;
    }
    for (const alarm of incidentAlarms) {
      const cleared = checks && (cameraEvent.affected.includes(alarm.asset) ? checks.streams[alarm.asset] !== 'offline' : byCode[alarm.asset].status === 'online');
      alarm.status = cleared ? 'resolved' : 'active';
      alarm.end = cleared ? NOW : null;
    }
    for (const { link, initial } of incidentLinks) {
      const available = cameraEvent.affected.includes(link.source) ? checks && checks.streams[link.source] !== 'offline' :
        link.source === 'SW-12' ? uplinkUp : checks?.link;
      link.status = available ? 'normal' : initial;
    }
  }

  function syncTaskReviews() {
    for (const t of linkedTasks) {
      let record;
      try { record = JSON.parse(localStorage.getItem(reviewKey(t.id))); } catch {}
      t.review = record && ['verified', 'unresolved'].includes(record.outcome) && typeof record.note === 'string' ? record : null;
      if (t === cameraTask) {
        if (t.review) t.review.outcome = cameraOutcome(t.review.checks);
        applyCameraChecks(t.review);
      }
      const event = events.find(e => e.id === t.eventId);
      event.status = t.review ? (t.review.outcome === 'verified' ? '已恢复' : '待复核') : originalStatus.get(event.id);
    }
    Object.keys(CATS).forEach(c => { catStats[c] = stats(devices.filter(d => d.cat === c)); });
  }
  function saveCameraReview(checks, note) {
    if (!validCameraChecks(checks) || typeof note !== 'string') return false;
    syncTaskReviews();
    const previous = cameraTask.review;
    if (previous?.outcome === 'verified') return false;
    const history = Array.isArray(previous?.history) ? previous.history.slice() : [];
    if (previous) {
      const { outcome, time, checks, note } = previous;
      history.push({ outcome, time, checks, note });
    }
    const record = { outcome: cameraOutcome(checks), time: new Date().toISOString(), checks, note: note.trim().slice(0, 500), history };
    localStorage.setItem(reviewKey(cameraTask.id), JSON.stringify(record));
    syncTaskReviews();
    return true;
  }
  function saveTaskReview(task, outcome, note) {
    if (task === cameraTask || !linkedTasks.includes(task) || !['verified', 'unresolved'].includes(outcome) || !note.trim()) return false;
    const record = { outcome, note: note.trim().slice(0, 500), time: new Date().toISOString() };
    localStorage.setItem(reviewKey(task.id), JSON.stringify(record));
    syncTaskReviews();
    return true;
  }
  function clearTaskReviews() {
    linkedTasks.forEach(t => localStorage.removeItem(reviewKey(t.id)));
    syncTaskReviews();
  }
  const isOpenMajor = e => e.level === '严重' && !e.status.includes('已恢复');
  const recentAlarms = alarms.filter(a => a.start <= NOW && NOW - a.start < 24 * 3600000)
    .sort((a, b) => b.start - a.start);
  syncTaskReviews();

  /* ---------- 汇总统计 ---------- */
  function stats(list) {
    list = list || devices;
    const s = { total: list.length, online: 0, warn: 0, offline: 0 };
    list.forEach(d => s[d.status]++);
    s.onlineRate = (s.online / s.total * 100);
    return s;
  }

  /* ---------- 导出 ---------- */
  window.DB = {
    NOW, ROAD, TUNNELS, TOLLS, ROOMS, SECTIONS, CATS, STATUS, LEVELS,
    devices, byCode, HERO, alarms, relations, events, sources, fieldMappings, qualityIssues,
    cells, tasks, teams, costMonths, costCats, costMonthly, costRecords, deviceCostRank, kpis, configs,
    stats, catStats, series, hoursAxis, rng, kmText, sectionOf, tunnelOf, fmtTime, ago,
    recentAlarms, isOpenMajor, syncTaskReviews, saveTaskReview, saveCameraReview, describeCameraChecks, clearTaskReviews
  };
})();
