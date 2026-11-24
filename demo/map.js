'use strict';
// Normalized survey coordinates for the fictional corridor; screen and controls share anchors.
const RoadMap=(()=>{
  const anchors={O:[.105,.765],A:[.36,.61],B:[.60,.425],C:[.845,.27]};
  const route=[[-.05,.90],[.105,.765],[.18,.70],[.245,.735],[.29,.71],[.36,.61],[.406,.525],[.46,.508],[.51,.526],[.552,.50],[.60,.425],[.655,.36],[.71,.37],[.766,.346],[.845,.27],[.913,.235],[1.04,.12]];
  function rand(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
  function draw(canvas){
    if(!canvas)return;
    const rect=canvas.getBoundingClientRect(), w=rect.width,h=rect.height;
    if(!w||!h)return;
    const scale=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
    const c=canvas.getContext('2d');c.scale(scale,scale);
    const pt=(p)=>[p[0]*w,p[1]*h];
    function smooth(points,color,width,shadow){
      const a=points.map(pt);
      c.save();c.lineWidth=width;c.strokeStyle=color;c.lineJoin='round';c.lineCap='round';
      if(shadow){c.shadowColor=shadow;c.shadowBlur=8;}
      c.beginPath();c.moveTo(...a[0]);
      for(let i=1;i<a.length-1;i++){const next=a[i+1];c.quadraticCurveTo(...a[i],(a[i][0]+next[0])/2,(a[i][1]+next[1])/2);}
      c.lineTo(...a.at(-1));c.stroke();c.restore();
    }
    const grad=c.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#142a3c');grad.addColorStop(.55,'#203d4c');grad.addColorStop(1,'#142a3b');
    c.fillStyle=grad;c.fillRect(0,0,w,h);
    const noise=rand(3399);
    for(let i=0;i<130;i++){
      let x=noise()*w,y=noise()*h,r=4+noise()*35;
      c.beginPath();
      for(let j=0;j<7;j++){let a=j*Math.PI/3.5;let k=r*(.4+noise()*.7);c.lineTo(x+Math.cos(a)*k*1.5,y+Math.sin(a)*k);}
      c.closePath();c.fillStyle=['#65847712','#081b2514','#8c99810a'][i%3];c.fill();
    }
    // Marching squares of a smooth relief field yields continuous contour lines.
    const step=7,cols=Math.ceil(w/step)+1,rows=Math.ceil(h/step)+1;
    const vals=Array.from({length:rows},(_,j)=>Array.from({length:cols},(_,i)=>{
      const x=i*step/w*4.0,y=j*step/h*2.4;
      return Math.sin(x*2.3+y*.9)+.63*Math.sin(y*3.5-x*.7)+.31*Math.cos(x*4.2+y*2.8)+.14*Math.sin(y*6.4-x*1.2)+.07*Math.cos(x*8.6-y*6.1);
    }));
    for(let level=-1.9;level<2;level+=.13){
      c.beginPath();
      for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){
        let v=[vals[j][i],vals[j][i+1],vals[j+1][i+1],vals[j+1][i]],p=[[i*step,j*step],[(i+1)*step,j*step],[(i+1)*step,(j+1)*step],[i*step,(j+1)*step]],hits=[];
        for(let k=0;k<4;k++){let n=(k+1)%4;if((v[k]<level)!==(v[n]<level)){let f=(level-v[k])/(v[n]-v[k]);hits.push([p[k][0]+(p[n][0]-p[k][0])*f,p[k][1]+(p[n][1]-p[k][1])*f]);}}
        for(let k=0;k+1<hits.length;k+=2){c.moveTo(...hits[k]);c.lineTo(...hits[k+1]);}
      }
      c.strokeStyle='rgba(148,195,199,.20)';c.lineWidth=.78;c.stroke();
    }
    const water=[[.26,-.12],[.29,.04],[.42,.11],[.48,.20],[.45,.31],[.41,.42],[.45,.55],[.54,.65],[.54,.79],[.50,.92],[.59,1.14]];
    smooth(water,'#537e92',14);smooth(water,'#325b70',11);
    const roads=[[[0,.32],[.18,.36],[.25,.48],[.36,.61],[.395,.79],[.46,1.1]],[[.62,-.1],[.65,.12],[.60,.425],[.69,.60],[.84,.63],[1.1,.556]],[[.77,1.05],[.76,.71],[.85,.53],[.845,.27],[.91,-.04]],[[.04,.99],[.28,.88],[.40,.92],[.57,.83],[.68,.87],[.86,.74],[1.1,.76]]];
    roads.forEach(r=>{smooth(r,'#263638',4);smooth(r,'#8c948374',2.0);});
    for(let i=0;i<70;i++){
      const x=(i%2?.78:.18)+(noise()-.5)*.21,y=(i%2?.76:.44)+(noise()-.5)*.24;
      c.save();c.translate(x*w,y*h);c.rotate(-.28);c.fillStyle='#b4b5a429';c.fillRect(0,0,3+noise()*8,2+noise()*4);c.restore();
    }
    smooth(route,'#0d2434',10);smooth(route,'#3d9b92',6);smooth(route,'#9cebd5',3);
    c.font='11px "Microsoft YaHei", sans-serif';c.fillStyle='#bdcdd8b8';
    [['石 门 山',.21,.22],['云 岭 山 地',.61,.16],['松 岚 林 场',.80,.85],['青 岚 河',.54,.72]].forEach(([t,x,y])=>c.fillText(t,x*w,y*h));
    c.fillStyle='#183547';c.fillRect(.245*w,.79*h,37,16);c.strokeStyle='#8fbdc999';c.strokeRect(.245*w,.79*h,37,16);
    c.fillStyle='#c7efe4';c.font='10px monospace';c.fillText('QLEX',.245*w+6,.79*h+12);
  }
  function profile(canvas,series){
    if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height,scale=Math.min(devicePixelRatio||1,2);
    canvas.width=w*scale;canvas.height=h*scale;
    const c=canvas.getContext('2d');c.scale(scale,scale);
    const left=38,right=16,top=12,bottom=24,plotH=h-top-bottom;
    const peak=Math.ceil(Math.max(...series.map(p=>Math.max(p.base,p.proposed)))/10)*10;
    const points=field=>series.map(p=>[left+(w-left-right)*p.hour/24,top+plotH*(1-p[field]/peak)]);
    c.font='10px monospace';c.fillStyle='#526b80';c.lineWidth=1;
    for(let i=0;i<4;i++){let y=top+i*plotH/3;c.strokeStyle='#dbe6ef';c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();c.fillText(String(Math.round(peak*(1-i/3))),4,y+4);}
    const p=points('proposed');c.beginPath();c.moveTo(p[0][0],top+plotH);p.forEach(a=>c.lineTo(...a));c.lineTo(p.at(-1)[0],top+plotH);c.closePath();
    const area=c.createLinearGradient(0,top,0,top+plotH);
    area.addColorStop(0,'#9bded0');
    area.addColorStop(1,'#effaf7');
    c.fillStyle=area;c.fill();
    [[points('base'),'#73869b',[5,4]],[p,'#087367',[]]].forEach(([a,color,dash])=>{c.beginPath();c.setLineDash(dash);c.strokeStyle=color;c.lineWidth=2.4;a.forEach((xy,i)=>i?c.lineTo(...xy):c.moveTo(...xy));c.stroke();});c.setLineDash([]);
    c.fillStyle='#526b80';
    ['00:00','06:00','12:00','18:00','24:00'].forEach((t,i)=>c.fillText(t,left-10+i*(w-left-right-8)/4,h-5));
  }
  return {anchors,draw,profile};
})();
