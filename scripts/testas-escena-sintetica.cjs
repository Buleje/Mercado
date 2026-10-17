'use strict';
// Escena SINTÉTICA para el banco de «Medir por foto» (testas-cv.ts, 16-10): hoja A4 con ArUco 180 mm → homografía → círculos (Hough) → borde radial → elipse → Ø.
// Mide la GEOMETRÍA (escala, perspectiva, ajuste), no la segmentación de fotos reales.
// Ø CON CORTEZA (Brandon 16-10): la corteza es un anillo oscuro y rugoso de 1-3 cm, de grosor que varía alrededor de la testa (vetas y motas, no anillos);
// ~12 % de las trozas vienen descortezadas (y ~8 % de las puntas la perdieron). La verdad = Ø medio del borde de AFUERA (madera + 2 × grosor medio).
// Cara de adelante (F2): la misma carga vista desde el otro lado = espejada, cada punta corrida σ 5 cm (curvatura) y con otro Ø (conicidad),
// las hojas cambiadas de lado (249 a la izquierda) y un poco giradas: el emparejado no puede depender de qué hoja es cuál.
// Escenas DIFÍCILES (F4, «tocar la troza que no ve»): 7.º argumento barro|sombra|tapada|contraste, una por escena (cada una se cuenta aparte):
// barro = 1-3 manchas oscuras que cruzan el borde de ~60 % de las testas; sombra = 3 bordes de sombra dura (×0,42) que cortan la carga;
// tapada = 4 trozas con una vecina corrida encima que les tapa el 30 %; contraste = madera, corteza y hueco a ~15 niveles de gris.
// Cada troza lleva `dif` (lo que la afecta) y `toque` (dónde la tocaría el operador: el centro de lo que se ve de ella).
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
const LADO=180,ANCHO=2200,ALTO_MAX=1600,SIGMA_PUNTA=50;
// Hoja A4 210×297: (x, y) esquina de abajo-izq en mm del plano (y arriba), girada `ang` grados alrededor de su centro.
const hojaEn=(h,u,v)=>{const t=h.ang*Math.PI/180,[cu,cv]=[105,148.5],[du,dv]=[u-cu,v-cv];return [h.x+cu+du*Math.cos(t)-dv*Math.sin(t),h.y+cv+du*Math.sin(t)+dv*Math.cos(t)];};
const MARCO={u:15,v:297-20};// esquina de arriba-izq del marcador, en mm de la hoja
async function cargarCv(){let cv=require(path.join(RAIZ,'node_modules/@techstark/opencv-js'));if(cv instanceof Promise||typeof cv.then==='function')cv=await cv;else if(!cv.Mat)await new Promise(r=>(cv.onRuntimeInitialized=r));return cv;}
function apilar(){const logs=[];let x=0,fallos=0;
  while(fallos<60){const Dcon=MUESTRA[Math.floor(rnd()*MUESTRA.length)]*10*(0.95+0.1*rnd());const e=0.06*rnd();
    const sinCorteza=rnd()<0.12,bark=sinCorteza?0:10+20*rnd(),D=Dcon-2*bark;
    const a=D/2*(1+e),b=D/2*(1-e),R=a+1.5*bark+2;if(x+2*R>ANCHO)x=0;const cx=x+R;let cy=R;
    for(const L of logs){const dx=cx-L.cx,rr=R+L.R;if(Math.abs(dx)<rr)cy=Math.max(cy,L.cy+Math.sqrt(rr*rr-dx*dx));}
    if(cy+R>ALTO_MAX){fallos++;x=cx+R;continue;}logs.push({n:logs.length,cx,cy,a,b,ang:rnd()*180,R,bark,sinCorteza});x=cx+R+rnd()*25;}
  return logs;}
/** La otra punta de cada troza, vista desde adelante: espejo, corrida, otro Ø y otra corteza; sin encimarse. */
function caraDeAdelante(logs){const f=logs.map(L=>{const k=0.85+0.27*rnd(),bark=L.sinCorteza||rnd()<0.08?0:Math.min(32,Math.max(8,L.bark*(0.75+0.5*rnd())));
    const a=L.a*k,b=L.b*k;return {n:L.n,cx:ANCHO-L.cx+SIGMA_PUNTA*gauss(),cy:L.cy+SIGMA_PUNTA*gauss(),a,b,ang:(180-L.ang+5*gauss()+360)%180,R:a+1.5*bark+2,bark,sinCorteza:bark===0};});
  for(let it=0;it<80;it++){for(let i=0;i<f.length;i++)for(let j=i+1;j<f.length;j++){const A=f[i],B=f[j],dx=B.cx-A.cx,dy=B.cy-A.cy,d=Math.hypot(dx,dy)||1,s=A.R+B.R-d;if(s>0){A.cx-=dx/d*s/2;A.cy-=dy/d*s/2;B.cx+=dx/d*s/2;B.cy+=dy/d*s/2;}}
    for(const L of f){L.cx=Math.min(ANCHO-L.R,Math.max(L.R,L.cx));L.cy=Math.min(ALTO_MAX-L.R,Math.max(L.R,L.cy));}}
  return f;}
/** La elipse con corteza de la troza en mm del plano (y arriba): ¿cae (x, y) adentro? cv.ellipse gira en la imagen (y abajo): acá el ángulo va al revés. */
const dentro=(L,x,y)=>{const t=-L.ang*Math.PI/180,dx=x-L.cx,dy=y-L.cy,u=dx*Math.cos(t)+dy*Math.sin(t),v=-dx*Math.sin(t)+dy*Math.cos(t);return (u/(L.a+L.bark))**2+(v/(L.b+L.bark))**2<=1;};
const muestras=L=>{const r=L.a+L.bark,pts=[];for(let i=0;i<28;i++)for(let j=0;j<28;j++){const x=L.cx-r+(i+0.5)/14*r,y=L.cy-r+(j+0.5)/14*r;if(dentro(L,x,y))pts.push([x,y]);}return pts;};
/** tapada: 4 trozas con la vecina más cercana (no mucho más chica: si no, queda adentro y el borde se ve entero) corrida hacia ellas hasta taparles el 30 % (la vecina va encima: se dibuja al final). */
function tapar(logs){const usados=new Set();let n=0;
  for(const A of [...logs].sort(()=>rnd()-0.5)){if(n>=4)break;if(usados.has(A))continue;
    const B=logs.filter(L=>L!==A&&!usados.has(L)&&L.a+L.bark>=0.7*(A.a+A.bark)).sort((p,q)=>Math.hypot(p.cx-A.cx,p.cy-A.cy)-Math.hypot(q.cx-A.cx,q.cy-A.cy))[0];if(!B)break;
    const pts=muestras(A),d0=Math.hypot(B.cx-A.cx,B.cy-A.cy),[ux,uy]=[(B.cx-A.cx)/d0,(B.cy-A.cy)/d0];let [lo,hi]=[0,d0];
    for(let it=0;it<22;it++){const s=(lo+hi)/2;B.cx=A.cx+ux*s;B.cy=A.cy+uy*s;if(pts.filter(([x,y])=>dentro(B,x,y)).length/pts.length>0.3)lo=s;else hi=s;}
    B.cx=A.cx+ux*hi;B.cy=A.cy+uy*hi;B.encima=true;usados.add(A);usados.add(B);n++;}
  for(const L of logs){if(L.encima)continue;const pts=muestras(L),vis=pts.filter(([x,y])=>!logs.some(E=>E.encima&&dentro(E,x,y)));L.tapadaPct=Math.round(100*(1-vis.length/pts.length));
    if(L.tapadaPct>=10&&vis.length){(L.dif??=[]).push('tapada');L.toque=[vis.reduce((s,p)=>s+p[0],0)/vis.length,vis.reduce((s,p)=>s+p[1],0)/vis.length];}}}
/** sombra: 3 bordes rectos de sombra dura que cruzan la carga (adentro de un número impar de semiplanos = sombra; las hojas no: el banco mide desde la 248 y una sombra sobre ella cambia de qué hoja se mide); marca las trozas que un borde corta por la cara (`sombra`) y las que quedan enteras a la sombra (`en-sombra`). */
function sombras(logs){const lineas=Array.from({length:3},()=>{const th=(0.15+0.7*rnd())*Math.PI;return {x:300+1600*rnd(),y:200+1200*rnd(),nx:Math.cos(th),ny:Math.sin(th)};});
  const enSombra=(x,y)=>lineas.filter(l=>(x-l.x)*l.nx+(y-l.y)*l.ny>0).length%2===1;
  for(const L of logs){if(lineas.some(l=>Math.abs((L.cx-l.x)*l.nx+(L.cy-l.y)*l.ny)<0.6*(L.a+L.bark)))(L.dif??=[]).push('sombra');else if(enSombra(L.cx,L.cy))(L.dif??=[]).push('en-sombra');}return lineas;}
function dibujar(cv,logs,hojas,correa,dif={}){const m=new cv.Mat(PH,PW,cv.CV_8UC1,new cv.Scalar(dif.contraste?52:38));const S=v=>new cv.Scalar(v),Pt=(x,y)=>{const p=P(x,y);return new cv.Point(Math.round(p[0]),Math.round(p[1]));};
  const rect=(x1,y1,x2,y2,v)=>cv.rectangle(m,Pt(x1,y2),Pt(x2,y1),S(v),-1);
  const poli=(pts,v)=>{const mat=cv.matFromArray(pts.length,1,cv.CV_32SC2,pts.flatMap(p=>[Math.round(p[0]),Math.round(p[1])]));const vec=new cv.MatVector();vec.push_back(mat);cv.fillPoly(m,vec,S(v),cv.LINE_AA);vec.delete();mat.delete();};
  const cuadroHoja=(h,u0,v0,u1,v1,v)=>poli([[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,w])=>P(...hojaEn(h,u,w))),v);
  rect(X0,Y0,X1,0,70);rect(X0,0,0,1700,95);rect(ANCHO,0,X1,1700,95);
  for(const h of hojas){cuadroHoja(h,0,0,210,297,232);const c=LADO/6,{u,v}=MARCO;cuadroHoja(h,u,v-LADO,u+LADO,v,15);const bits=ARUCO[h.id];
    for(let r=0;r<4;r++)for(let k=0;k<4;k++)if((bits>>(15-(r*4+k)))&1){const uu=u+(k+1)*c,vv=v-(r+1)*c;cuadroHoja(h,uu,vv-c,uu+c,vv,232);}}
  for(const L of [...logs.filter(l=>!l.encima),...logs.filter(l=>l.encima)]){const c=Pt(L.cx,L.cy),base=dif.contraste?84+22*rnd():135+70*rnd(),gb=dif.contraste?base-12-8*rnd():Math.min(base-45,60+45*rnd());
    if(L.bark>0){// corteza: borde de afuera = la elipse corrida por su normal un grosor que varía (media = L.bark)
      const t=L.ang*Math.PI/180,[k1,k2,f1,f2]=[2+Math.floor(rnd()*2),5+2*Math.floor(rnd()*2),rnd()*6.283,rnd()*6.283];
      const grosor=f=>L.bark*(1+0.3*Math.sin(k1*f+f1)+0.2*Math.sin(k2*f+f2));
      const enBorde=(f,s)=>{const [ex,ey]=[L.a*Math.cos(f),L.b*Math.sin(f)],[nx0,ny0]=[L.b*Math.cos(f),L.a*Math.sin(f)],nn=Math.hypot(nx0,ny0),g=s*grosor(f);
        const [px,py]=[ex+nx0/nn*g,ey+ny0/nn*g];return [c.x+(px*Math.cos(t)-py*Math.sin(t))*PP,c.y+(px*Math.sin(t)+py*Math.cos(t))*PP];};
      poli(Array.from({length:240},(_,i)=>enBorde(i*2*Math.PI/240,1)),gb);
      for(let j=0;j<70;j++){const f=rnd()*6.283,p0=enBorde(f,0.1),p1=enBorde(f,0.55+0.3*rnd());cv.line(m,new cv.Point(Math.round(p0[0]),Math.round(p0[1])),new cv.Point(Math.round(p1[0]),Math.round(p1[1])),S(gb-20-20*rnd()),2,cv.LINE_AA);}
      for(let j=0;j<40;j++){const p=enBorde(rnd()*6.283,0.2+0.6*rnd());cv.circle(m,new cv.Point(Math.round(p[0]),Math.round(p[1])),1+Math.floor(rnd()*2),S(gb+(rnd()<0.5?-22:22)),-1,cv.LINE_AA);}}
    cv.ellipse(m,c,new cv.Size(Math.round(L.a*PP),Math.round(L.b*PP)),L.ang,0,360,S(base),-1,cv.LINE_AA);
    const n=4+Math.floor(rnd()*5);for(let k=1;k<=n;k++){const s=k/(n+1)*(0.9+0.1*rnd());cv.ellipse(m,c,new cv.Size(Math.round(L.a*s*PP),Math.round(L.b*s*PP)),L.ang,0,360,S(base-(dif.contraste?6:15)),2,cv.LINE_AA);}
    for(let k=Math.floor(rnd()*4);k>0;k--){const t=rnd()*6.283,l=0.85*L.b;cv.line(m,c,Pt(L.cx+l*Math.cos(t),L.cy+l*Math.sin(t)),S(base-(dif.contraste?28:70)),3,cv.LINE_AA);}
    if(rnd()<0.3){const t=rnd()*6.283,l=0.5*L.b;cv.circle(m,Pt(L.cx+l*Math.cos(t),L.cy+l*Math.sin(t)),Math.round(0.25*L.b*PP),S(base-(dif.contraste?18:45)),-1,cv.LINE_AA);}
    if(dif.barro&&rnd()<0.6){(L.dif??=[]).push('barro');const t=L.ang*Math.PI/180,aImg=(u,v)=>[c.x+(u*Math.cos(t)-v*Math.sin(t))*PP,c.y+(u*Math.sin(t)+v*Math.cos(t))*PP];
      const mancha=(u,v,rb)=>{const v0=70+30*rnd();poli(Array.from({length:20},(_,i)=>{const f=i*2*Math.PI/20,r=rb*(0.7+0.6*rnd());return aImg(u+r*Math.cos(f),v+r*Math.sin(f));}),v0);
        for(let j=0;j<25;j++){const f=rnd()*6.283,r=rb*0.8*Math.sqrt(rnd()),p=aImg(u+r*Math.cos(f),v+r*Math.sin(f));cv.circle(m,new cv.Point(Math.round(p[0]),Math.round(p[1])),1+Math.floor(rnd()*3),S(v0+(rnd()<0.5?-15:15)),-1,cv.LINE_AA);}};
      for(let j=1+Math.floor(rnd()*3);j>0;j--){const f=rnd()*6.283,k=0.8+0.25*rnd();mancha(L.a*k*Math.cos(f),L.b*k*Math.sin(f),(0.22+0.15*rnd())*L.b);}
      if(rnd()<0.5){const f=rnd()*6.283,k=0.2+0.3*rnd();mancha(L.a*k*Math.cos(f),L.b*k*Math.sin(f),(0.15+0.1*rnd())*L.b);}}}
  if(correa)cv.line(m,Pt(0,880),Pt(ANCHO,940),S(50),Math.round(35*PP),cv.LINE_AA);
  if(dif.lineas){const d=m.data;for(let py=0;py<PH;py++){const y=Y1-py/PP;for(let px=0;px<PW;px++){const x=px/PP+X0;if(hojas.some(h=>x>h.x-25&&x<h.x+235&&y>h.y-25&&y<h.y+322))continue;let s=0;for(const l of dif.lineas)if((x-l.x)*l.nx+(y-l.y)*l.ny>0)s++;if(s%2){const i=py*PW+px;d[i]=Math.round(d[i]*0.42);}}}}
  cv.GaussianBlur(m,m,new cv.Size(0,0),1.3);return m;}
const QUAD={frente:[[100,212],[1900,212],[1900,1287],[100,1287]],gira15:[[80,150],[1920,260],[1920,1240],[80,1350]],gira30:[[60,80],[1900,330],[1860,1170],[100,1420]]};
async function camara(cv,plano,quad,sigma){const sP=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,PW,0,PW,PH,0,PH]),dP=cv.matFromArray(4,1,cv.CV_32FC2,quad.flat().map(v=>v*ESC));
  const H=cv.getPerspectiveTransform(sP,dP),cam=new cv.Mat();cv.warpPerspective(plano,cam,H,new cv.Size(2000*ESC,1500*ESC),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(30));
  if(sigma>0)cv.GaussianBlur(cam,cam,new cv.Size(0,0),sigma);const d=cam.data;for(let i=0;i<d.length;i++){const x=i%(2000*ESC);d[i]=Math.max(0,Math.min(255,d[i]*(0.82+0.3*x/(2000*ESC))+5*gauss()));}
  const jpg=await sharp(Buffer.from(d),{raw:{width:2000*ESC,height:1500*ESC,channels:1}}).jpeg({quality:85}).toBuffer();const raw=await sharp(jpg).extractChannel(0).raw().toBuffer();if(raw.length!==cam.data.length)throw new Error('canales '+raw.length);cam.data.set(raw.subarray(0,cam.data.length));
  sP.delete();dP.delete();H.delete();return {cam,jpg,jpgKB:Math.round(jpg.length/1024)};}

// Uso: node scripts/testas-escena-sintetica.cjs <seed> <frente|gira15|gira30> <sigma> [carpeta] [atras|adelante] [barro|sombra|tapada|contraste]
//   → escena-<seed>-<quad>[-adelante][-<dificil>].jpg + .json (verdad en mm del plano de la hoja 248 —su esquina de arriba-izq, sus ejes, y hacia abajo—; `n` = qué troza es, igual en las dos caras)
(async()=>{const cv=await cargarCv();const sd=+(process.argv[2]||1),q=process.argv[3]||'gira15',sig=+(process.argv[4]||0.8),cara=process.argv[6]==='adelante'?'adelante':'atras',DIF=process.argv[7]||'';
  seed=sd*7919;const atras=apilar();const giro=()=>(rnd()-0.5)*4;
  const hojasAtras=[{x:-450,y:650,id:248,ang:giro()},{x:2240,y:650,id:249,ang:giro()}];
  const logs=cara==='adelante'?caraDeAdelante(atras):atras;
  const hojas=cara==='adelante'?[{x:-450,y:650+(rnd()-0.5)*160,id:249,ang:2*giro()},{x:2240,y:650+(rnd()-0.5)*160,id:248,ang:2*giro()}]:hojasAtras;
  if(DIF==='tapada')tapar(logs);const lineas=DIF==='sombra'?sombras(logs):null;if(DIF==='contraste')for(const L of logs)(L.dif??=[]).push('contraste');
  const plano=dibujar(cv,logs,hojas,true,{contraste:DIF==='contraste',barro:DIF==='barro',lineas});const {cam,jpg,jpgKB}=await camara(cv,plano,QUAD[q],sig);
  const h=hojas.find(x=>x.id===248),[ox,oy]=hojaEn(h,MARCO.u,MARCO.v),t=h.ang*Math.PI/180;
  const aHoja=(X,Y)=>{const [dx,dy]=[X-ox,Y-oy];return [dx*Math.cos(t)+dy*Math.sin(t),-(-dx*Math.sin(t)+dy*Math.cos(t))];};
  const verdad=logs.map(L=>{const [x,y]=aHoja(L.cx,L.cy),D=L.a+L.b+2*L.bark;
    return {n:L.n,x,y,dif:L.dif??[],tapadaPct:L.tapadaPct??0,toque:aHoja(...(L.toque??[L.cx,L.cy])),dCm:Math.round(D)/10,dExactoCm:D/10,maderaCm:Math.round(L.a+L.b)/10,cortezaMm:Math.round(L.bark*10)/10,aMm:L.a+L.bark};});
  const base=path.join(OUT,`escena-${sd}-${q}${cara==='adelante'?'-adelante':''}${DIF?'-'+DIF:''}`);fs.writeFileSync(base+'.jpg',jpg);fs.writeFileSync(base+'.json',JSON.stringify({seed:sd,quad:q,sigma:sig,cara,dificil:DIF||null,trozas:verdad},null,1));
  console.log(base+'.jpg',jpgKB+' KB',logs.length+' trozas',logs.filter(L=>!L.bark).length+' sin corteza');cam.delete();plano.delete();})().catch(e=>{console.error('FALLO',e&&e.stack||e);process.exit(1);});
