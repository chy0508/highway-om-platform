'use strict';
const RoadData=(()=>{
  const sites = [
    {id:'A', name:'石门隧道',km:8,counts:[12,4,28,6], factor:.92,window:'11/23 09:00–11:00'},
    {id:'B', name:'云岭隧道',km:12,counts:[16,6,36,8],factor:1,window:'11/23 10:00–12:00'},
    {id:'C', name:'松岚隧道',km:20,counts:[12,4,30,6],factor:1.12,window:'11/23 14:00–16:00'}
  ];
  const events=[
    {id:'camera',site:'B',title:'监控点集中离线',code:'QLD-EV-1123-03',time:'09:42',type:'视频监控',severity:'高',impact:4},
    {id:'lights',site:'C',title:'照明回路无反馈',code:'QLD-EV-1123-02',time:'09:26',type:'隧道照明',severity:'高',impact:3},
    {id:'pulse',site:'A',title:'监控端口间歇掉线',code:'QLD-EV-1123-01',time:'08:58',type:'通信网络',severity:'中',impact:1}
  ];
  const candidates=[
    {id:'ETC-A01',name:'收费车道控制器',budget:12000,risk:1,impact:'影响收费车道',cost:9200},
    {id:'CAM-B02',name:'同杆监控摄像机',budget:4600,risk:2,impact:'关键视野盲区',cost:3100},
    {id:'SW-C02',name:'接入交换机',budget:3600,risk:3,impact:'备用链路可接管',cost:1500}
  ];
  const meters={light:{sun:{high:438,low:369},cloud:{high:361,low:300}},fan:{sun:{high:508,low:299},cloud:{high:508,low:299}}};

  const tasks=[
    {site:'A',crew:'机电一班',meter:'V-01',start:540,end:660,duration:40},
    {site:'B',crew:'机电一班',meter:'V-01',start:600,end:720,duration:40},
    {site:'C',crew:'机电二班',meter:'V-02',start:840,end:960,duration:40}
  ];
  return {sites,events,candidates,meters,tasks};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RoadData;
