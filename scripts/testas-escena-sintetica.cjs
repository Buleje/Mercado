'use strict';
// Escena SINTÉTICA para el banco de «Medir por foto» (testas-cv.ts, 16-10): hoja A4 con ArUco 180 mm → homografía → círculos (Hough) → borde radial → elipse → Ø.
// Mide la GEOMETRÍA (escala, perspectiva, ajuste), no la segmentación de fotos reales.
const fs=require('fs'),path=require('path');
const RAIZ=path.resolve(__dirname,'..');
const sharp=require(path.join(RAIZ,'node_modules/sharp'));
const OUT=path.resolve(process.argv[5]||path.join(RAIZ,'reports/testas-banco'));fs.mkdirSync(OUT,{recursive:true});const ESC=2;
let seed=1;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const gauss=()=>{let u=0,v=0;while(!u)u=rnd();while(!v)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
const MUESTRA=[65,57,47,44,52,47,45,44,46,36,44,37,56,44,40,37,42,38,50,45,50,42,49,46,74,52,37,36,43,41,36,32,44,38,60,54,49,41];
const src=fs.readFileSync(path.join(RAIZ,'lib/camaras/aruco-4x4-250.ts'),'utf8');
const ARUCO=[...src.slice(src.indexOf('= [')+3,src.indexOf('];')).matchAll(/\d+/g)].map(m=>+m[0]);
const X0=-480,X1=2700,Y0=-100,Y1=1800,PP=1.5,PW=Math.round((X1-X0)*PP),PH=Math.round((Y1-Y0)*PP);
const P=(x,y)=>[(x-X0)*PP,(Y1-y)*PP];
const LADO=180,IDS=[248,249];
const HOJAS=[{x:-450,y:650,id:248},{x:2240,y:650,id:249}];// hoja A4 210×297 (x izq, y abajo)
const marcEsq=h=>{const xm=h.x+15,yt=h.y+297-20;return [[xm,yt],[xm+LADO,yt],[xm+LADO,yt-LADO],[xm,yt-LADO]];};
async function cargarCv(){let cv=require(path.join(RAIZ,'node_modules/@techstark/opencv-js'));if(cv instanceof Promise||typeof cv.then==='function')cv=await cv;else if(!cv.Mat)await new Promise(r=>(cv.onRuntimeInitialized=r));return cv;}
function apilar(){const logs=[];let x=0,fallos=0;
  while(fallos<60){const D=MUESTRA[Math.floor(rnd()*MUESTRA.length)]*10*(0.95+0.1*rnd());const e=0.06*rnd();
    const a=D/2*(1+e),b=D/2*(1-e),bark=12+15*rnd(),R=a+bark;if(x+2*R>2200)x=0;const cx=x+R;let cy=R;
    for(const L of logs){const dx=cx-L.cx,rr=R+L.R;if(Math.abs(dx)<rr)cy=Math.max(cy,L.cy+Math.sqrt(rr*rr-dx*dx));}
    if(cy+R>1600){fallos++;x=cx+R;continue;}logs.push({cx,cy,a,b,ang:rnd()*180,R,bark,D:a+b});x=cx+R+rnd()*25;}
  return logs;}
function dibujar(cv,logs,correa){const m=new cv.Mat(PH,PW,cv.CV_8UC1,new cv.Scalar(38));const S=v=>new cv.Scalar(v),Pt=(x,y)=>{const p=P(x,y);return new cv.Point(Math.round(p[0]),Math.round(p[1]));};
  const rect=(x1,y1,x2,y2,v)=>cv.rectangle(m,Pt(x1,y2),Pt(x2,y1),S(v),-1);
  rect(X0,Y0,X1,0,70);rect(X0,0,0,1700,95);rect(2200,0,X1,1700,95);
  for(const h of HOJAS){rect(h.x,h.y,h.x+210,h.y+297,232);const E=marcEsq(h),c=LADO/6;rect(E[0][0],E[3][1],E[1][0],E[0][1],15);const v=ARUCO[h.id];
    for(let r=0;r<4;r++)for(let k=0;k<4;k++)if((v>>(15-(r*4+k)))&1){const xx=E[0][0]+(k+1)*c,yy=E[0][1]-(r+1)*c;rect(xx,yy-c,xx+c,yy,232);}}
  for(const L of logs){const c=Pt(L.cx,L.cy),base=135+70*rnd();
    cv.ellipse(m,c,new cv.Size(Math.round((L.a+L.bark)*PP),Math.round((L.b+L.bark)*PP)),L.ang,0,360,S(55+30*rnd()),-1,cv.LINE_AA);
    cv.ellipse(m,c,new cv.Size(Math.round(L.a*PP),Math.round(L.b*PP)),L.ang,0,360,S(base),-1,cv.LINE_AA);
    const n=4+Math.floor(rnd()*5);for(let k=1;k<=n;k++){const s=k/(n+1)*(0.9+0.1*rnd());cv.ellipse(m,c,new cv.Size(Math.round(L.a*s*PP),Math.round(L.b*s*PP)),L.ang,0,360,S(base-15),2,cv.LINE_AA);}
    for(let k=Math.floor(rnd()*4);k>0;k--){const t=rnd()*6.283,l=0.85*L.b;cv.line(m,c,Pt(L.cx+l*Math.cos(t),L.cy+l*Math.sin(t)),S(base-70),3,cv.LINE_AA);}
    if(rnd()<0.3){const t=rnd()*6.283,l=0.5*L.b;cv.circle(m,Pt(L.cx+l*Math.cos(t),L.cy+l*Math.sin(t)),Math.round(0.25*L.b*PP),S(base-45),-1,cv.LINE_AA);}}
  if(correa)cv.line(m,Pt(0,880),Pt(2200,940),S(50),Math.round(35*PP),cv.LINE_AA);
  cv.GaussianBlur(m,m,new cv.Size(0,0),1.3);return m;}
const QUAD={frente:[[100,212],[1900,212],[1900,1287],[100,1287]],gira15:[[80,150],[1920,260],[1920,1240],[80,1350]],gira30:[[60,80],[1900,330],[1860,1170],[100,1420]]};
async function camara(cv,plano,quad,sigma){const sP=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,PW,0,PW,PH,0,PH]),dP=cv.matFromArray(4,1,cv.CV_32FC2,quad.flat().map(v=>v*ESC));
  const H=cv.getPerspectiveTransform(sP,dP),cam=new cv.Mat();cv.warpPerspective(plano,cam,H,new cv.Size(2000*ESC,1500*ESC),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(30));
  if(sigma>0)cv.GaussianBlur(cam,cam,new cv.Size(0,0),sigma);const d=cam.data;for(let i=0;i<d.length;i++){const x=i%(2000*ESC);d[i]=Math.max(0,Math.min(255,d[i]*(0.82+0.3*x/(2000*ESC))+5*gauss()));}
  const jpg=await sharp(Buffer.from(d),{raw:{width:2000*ESC,height:1500*ESC,channels:1}}).jpeg({quality:85}).toBuffer();const raw=await sharp(jpg).extractChannel(0).raw().toBuffer();if(raw.length!==cam.data.length)throw new Error('canales '+raw.length);cam.data.set(raw.subarray(0,cam.data.length));
  sP.delete();dP.delete();H.delete();return {cam,jpg,jpgKB:Math.round(jpg.length/1024)};}

// Uso: node scripts/testas-escena-sintetica.cjs <seed> <frente|gira15|gira30> <sigma> [carpeta] → escena-<seed>-<quad>.jpg + .json (verdad en mm del plano de la hoja 248, y hacia abajo)
(async()=>{const cv=await cargarCv();const sd=+(process.argv[2]||1),q=process.argv[3]||'gira15',sig=+(process.argv[4]||0.8);
  seed=sd*7919;const logs=apilar();const plano=dibujar(cv,logs,true);const {cam,jpg,jpgKB}=await camara(cv,plano,QUAD[q],sig);
  const xm=HOJAS[0].x+15,yt=HOJAS[0].y+297-20;
  const verdad=logs.map(L=>({x:L.cx-xm,y:yt-L.cy,dCm:Math.round(L.D)/10,dExactoCm:L.D/10,aMm:L.a,bMm:L.b}));
  const base=path.join(OUT,`escena-${sd}-${q}`);fs.writeFileSync(base+'.jpg',jpg);fs.writeFileSync(base+'.json',JSON.stringify({seed:sd,quad:q,sigma:sig,trozas:verdad},null,1));
  console.log(base+'.jpg',jpgKB+' KB',logs.length+' trozas');cam.delete();plano.delete();})().catch(e=>{console.error('FALLO',e&&e.stack||e);process.exit(1);});
