import json, glob, os, sys, time, re
from datetime import datetime
dias = float(sys.argv[1]) if len(sys.argv) > 1 else 7
lim = time.time() - dias * 86400
uses = {}; stats = {}; errs = {}
def ts(s):
    try: return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
    except: return None
for f in glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl')) + glob.glob(os.path.expanduser('~/.claude/projects/*/*/subagents/*.jsonl')):
    if os.path.getmtime(f) < lim: continue
    for line in open(f, errors='ignore'):
        try: d = json.loads(line)
        except: continue
        t = ts(d.get('timestamp', ''))
        m = d.get('message') or {}
        c = m.get('content')
        if not isinstance(c, list): continue
        for b in c:
            if b.get('type') == 'tool_use':
                n = b['name']; inp = b.get('input', {})
                if n == 'Bash':
                    cmd = inp.get('command', '')
                    mm = re.search(r'(?:^|[;&|\s])(pc2(?: fondo)? [a-z_-]+|claude-chrome|claude-escritorio|buscar |explorer\.exe|tipear\.sh|wsp\.sh|cmd\.exe /c start)', cmd)
                    if not mm: continue
                    n = 'bash:' + mm.group(1).strip()
                elif not (n.startswith('mcp__desktop-control__') or n.startswith('mcp__chrome-sesion__')): continue
                uses[b['id']] = (n, t)
            elif b.get('type') == 'tool_result' and b.get('tool_use_id') in uses:
                n, t0 = uses.pop(b['tool_use_id'])
                txt = b.get('content'); txt = json.dumps(txt, ensure_ascii=False) if not isinstance(txt, str) else txt
                bad = b.get('is_error') or re.search(r'"found":\s*false|PARADA|ERROR|Error:|no encontr|timeout', txt[:400] or '')
                s = stats.setdefault(n, [0, 0, []]); s[0] += 1
                if bad: s[1] += 1; errs.setdefault(n, []).append(txt[:160].replace('\n', ' '))
                if t0 and t: s[2].append(t - t0)
rows = sorted(stats.items(), key=lambda kv: -kv[1][0])
print(f"{'herramienta':45} llamadas fallas  mediana_s  p90_s")
for n, (k, e, d) in rows[:30]:
    d = sorted(d); med = d[len(d)//2] if d else 0; p90 = d[int(len(d)*.9)] if d else 0
    print(f"{n[:45]:45} {k:8} {e:6} {med:9.1f} {p90:6.1f}")
print('\n== muestras de fallas ==')
for n in sorted(errs, key=lambda x: -len(errs[x]))[:10]:
    from collections import Counter
    for txt, k in Counter(errs[n]).most_common(3): print(f"{k:3} {n[:40]} | {txt[:130]}")
