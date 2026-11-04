# Fallos de herramientas por tipo en los chats de este proyecto (04-11). Uso: python3 scripts/dev-helpers/fallos-herramientas.py [días=2]
import json,glob,os,time,collections,re,sys
dias=float(sys.argv[1]) if len(sys.argv)>1 else 2
lim=time.time()-dias*86400
base=os.path.expanduser('~/.claude/projects/-home-usuario-proyectos-Mercado')
files=[f for f in glob.glob(base+'/*.jsonl')+glob.glob(base+'/*/subagents/*.jsonl') if os.path.getmtime(f)>lim]
err=collections.Counter(); ejemplos=collections.defaultdict(list); tools=collections.Counter(); n=0
pend={}
for f in files:
  try:
    for line in open(f,errors='ignore'):
      try: d=json.loads(line)
      except: continue
      m=d.get('message') or {}
      c=m.get('content')
      if not isinstance(c,list): continue
      for b in c:
        if b.get('type')=='tool_use':
          pend[b.get('id')]=b.get('name'); tools[b.get('name')]+=1; n+=1
        if b.get('type')=='tool_result' and b.get('is_error'):
          name=pend.get(b.get('tool_use_id'),'?')
          txt=b.get('content')
          if isinstance(txt,list): txt=' '.join(x.get('text','') for x in txt if isinstance(x,dict))
          txt=str(txt)[:200].replace('\n',' ')
          k=re.sub(r'[0-9]+','N',txt[:70])
          err[(name,k)]+=1
          if len(ejemplos[(name,k)])<1: ejemplos[(name,k)].append(txt)
  except Exception as e: pass
print('archivos',len(files),'llamadas',n,'errores',sum(err.values()))
for (k,v) in err.most_common(25): print(v,k[0],'|',ejemplos[k][0][:160])
