import{mkdirSync as mk,readdirSync as rd,readFileSync as rf,writeFileSync as wf}from'node:fs';
import{join as J}from'node:path';
const IN=process.env.MAKEFUN_INPUT_DIR??'/input',OUT=process.env.MAKEFUN_OUTPUT_DIR??'/output',U='udlr',srt=(a,b)=>a-b,Z=()=>new Uint8Array(N),M=()=>new Int32Array(N).fill(-1);
let G,S,N,GB,GL,PL,O;
function P(t){
 const ls=t.split('\n').map(s=>s.replace(/\r$/,''));
 while(ls.length&&!ls.at(-1))ls.pop();
 const w=Math.max(0,...ls.map(s=>s.length)),h=ls.length;
 S=w+2;N=S*(h+2);O=[-S,S,-1,1];G=new Array(N).fill('#');GB=[];GL=[];PL=-1;
 ls.forEach((ln,y)=>{for(let x=0;x<ln.length;x++){
  const c=ln[x],i=(y+1)*S+x+1;
  if(' .$*@+'.includes(c))G[i]=' ';
  if('.*+'.includes(c))GL.push(i);
  if('$*'.includes(c))GB.push(i);
  if('@+'.includes(c))PL=i;
 }});
}
function R(pl){
 const hr=(pl/S)|0,hc=[],hs=new Set,seen=Z(),rooms=[];
 for(let i=hr*S,j=i+S;i<j;i++)if(G[i]!='#'){hc.push(i);hs.add(i)}
 for(let i=0;i<N;i++){
  if(G[i]=='#'||hs.has(i)||seen[i])continue;
  const cells=[],st=[i];seen[i]=1;
  while(st.length){const c=st.pop();cells.push(c);for(const d of O){const n=c+d;if(G[n]!='#'&&!hs.has(n)&&!seen[n]){seen[n]=1;st.push(n)}}}
  const cs=new Set(cells);
  rooms.push({cells,bx:GB.filter(b=>cs.has(b)),gl:GL.filter(g=>cs.has(g)),po:cells.filter(c=>O.some(d=>hs.has(c+d)))});
 }
 return{hc,hs,rooms};
}
function B(dom,bx,fr){
 const dist=M(),par=M(),bs=new Set(bx),q=[fr];
 dist[fr]=0;
 for(let h=0;h<q.length;h++){const c=q[h];for(const d of O){const n=c+d;if(dist[n]<0&&dom[n]&&!bs.has(n)){dist[n]=dist[c]+1;par[n]=c;q.push(n)}}}
 return[dist,par];
}
function pm(par,fr,to){let s='',c=to;while(c!=fr){const p=par[c];if(p<0)return null;s=U[O.indexOf(c-p)]+s;c=p}return s}
function rp(dom,pl,bx,po){if(!po)return true;const d=B(dom,bx,pl)[0];return po.some(p=>d[p]>=0)}
function sim(b0,pl,mv){
 const bx=new Set(b0);let p=pl;
 for(const ch of mv){const d=O[U.indexOf(ch)],np=p+d;
  if(G[np]=='#')return null;
  if(bx.has(np)){const nb=np+d;if(G[nb]=='#'||bx.has(nb))return null;bx.delete(np);bx.add(nb)}
  p=np}
 return{bx,p};
}
function A(dom,dst,b0,gl,ent,po,bud,req){
 const gs=gl,gt=new Set(gs),n=b0.length;
 if(!n)return{p:0,m:'',s:ent[0],e:ent[0],b:[]};
 const DG=gs.map(g=>B(dst,[],g)[0]);
 const hu=bx=>{const m=bx.length,q=bx.map((_,i)=>i);let best=1/0;
  const rec=k=>{if(k==m){let s=0;for(let i=0;i<m;i++){const d=DG[q[i]][bx[i]];if(d<0)return;s+=d}if(s<best)best=s;return}
   for(let i=k;i<m;i++){[q[k],q[i]]=[q[i],q[k]];rec(k+1);[q[k],q[i]]=[q[i],q[k]]}};
  rec(0);return best};
 const key=(bx,p)=>bx+'|'+p;
 const w=i=>G[i]=='#',cd=c=>!gt.has(c)&&((w(c-S)&&w(c-1))||(w(c-S)&&w(c+1))||(w(c+S)&&w(c-1))||(w(c+S)&&w(c+1)));
 const hp=[],less=(a,b)=>a.f!=b.f?a.f<b.f:a.h!=b.h?a.h<b.h:a.c<b.c;
 const push=e=>{hp.push(e);let i=hp.length-1;while(i>0){const p=i-1>>1;if(!less(hp[i],hp[p]))break;[hp[i],hp[p]]=[hp[p],hp[i]];i=p}};
 const pop=()=>{const t=hp[0],l=hp.pop();if(hp.length){hp[0]=l;let i=0;for(;;){const a=2*i+1,b=a+1;let m=i;if(a<hp.length&&less(hp[a],hp[m]))m=a;if(b<hp.length&&less(hp[b],hp[m]))m=b;if(m==i)break;[hp[i],hp[m]]=[hp[m],hp[i]];i=m}}return t};
 const cl=new Map;let cnt=0;
 const bs=b0,h0=hu(bs);
 if(h0==1/0)return null;
 for(const e of ent){const k=key(bs,e);if(cl.has(k))continue;cl.set(k,{g:0,par:null,mv:''});push({f:h0,h:h0,g:0,c:cnt++,k,b:bs,p:e})}
 let ex=0;
 while(hp.length){
  const cur=pop(),rec=cl.get(cur.k);
  if(!rec||rec.g!=cur.g)continue;
  if(cur.b.every((v,i)=>v==gs[i])&&(!req||rp(dom,cur.p,cur.b,po))){
   let m2='',k=cur.k,rk;
   while(k!==null){const r=cl.get(k);m2=r.mv+m2;rk=k;k=r.par}
   return{p:cur.g,m:m2,s:+rk.split('|')[1],e:cur.p,b:cur.b};
  }
  if(++ex>bud)return null;
  const[dist,par]=B(dom,cur.b,cur.p),bset=new Set(cur.b);
  for(let bi=0;bi<n;bi++){const b=cur.b[bi];
   for(const d of O){const ds=b+d,st=b-d;
    if(!dst[ds]||bset.has(ds)||dist[st]<0||cd(ds))continue;
    const nb=[...cur.b];nb[bi]=ds;nb.sort(srt);
    const h=hu(nb);if(h==1/0)continue;
    const g2=cur.g+1,k2=key(nb,b),old=cl.get(k2);
    if(old&&old.g<=g2)continue;
    cl.set(k2,{g:g2,par:cur.k,mv:pm(par,cur.p,st)+U[O.indexOf(d)]});
    push({f:g2+h,h,g:g2,c:cnt++,k:k2,b:nb,p:b});
   }
  }
 }
 return null;
}
function SR(det,room){
 const dom=Z(),dst=Z(),es=new Set;
 for(const c of room.cells)dom[c]=dst[c]=1;
 for(const c of det.hc)dom[c]=1;
 for(const p of room.po)for(const d of O)if(det.hs.has(p+d))es.add(p+d);
 const ent=[...es].sort(srt);
 const r=A(dom,dst,room.bx,room.gl,ent,room.po,6e5,false);
 if(!r)return null;
 if(rp(dom,r.e,r.b,room.po))return{...r,x:true};
 const r2=A(dom,dst,room.bx,room.gl,ent,room.po,6e5,true);
 if(r2&&r2.p==r.p)return{...r2,x:true};
 return{...r,x:false};
}
function SL(t){
 P(t);
 const det=R(PL),af=Z(),gset=new Set(GL);
 for(let i=0;i<N;i++)af[i]=+(G[i]!='#');
 const done=bx=>bx.size==gset.size&&[...bx].every(b=>gset.has(b));
 let ok=det.rooms.length>0,cb=0,cg=0;
 for(const r of det.rooms){if(r.bx.length!=r.gl.length)ok=false;if(r.bx.length&&!r.po.length)ok=false;cb+=r.bx.length;cg+=r.gl.length}
 if(cb!=GB.length||cg!=GL.length)ok=false;
 if(ok){
  const sols=[];
  for(const r of det.rooms){if(!r.bx.length){sols.push(null);continue}const s=SR(det,r);if(!s){ok=false;break}sols.push(s)}
  if(ok){
   const ord=det.rooms.map((_,i)=>i).sort((a,b)=>(sols[a]&&sols[a].x?0:1)-(sols[b]&&sols[b].x?0:1)||a-b);
   let bx=new Set(GB),pl=PL,mv='';
   for(const ri of ord){const s=sols[ri];if(!s)continue;
    const wk=pm(B(af,[...bx],pl)[1],pl,s.s);
    if(wk===null){ok=false;break}
    for(const seg of[wk,s.m]){const sm=sim([...bx],pl,seg);if(!sm){ok=false;break}bx=sm.bx;pl=sm.p;mv+=seg}
    if(!ok)break;
   }
   if(ok&&done(bx))return mv;
   ok=false;
  }
 }
 const r=A(af,af,GB,GL,[PL],null,2e5,false);
 if(r){const sm=sim(GB,PL,r.m);if(sm&&done(sm.bx))return r.m}
 return '';
}
for(const id of rd(IN).sort()){
 let m='';
 try{m=SL(rf(J(IN,id,'level.txt'),'utf8'))}catch{}
 mk(J(OUT,id),{recursive:true});
 wf(J(OUT,id,'solution.txt'),m+'\n');
}
