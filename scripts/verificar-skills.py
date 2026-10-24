"""Verifica skills, agentes y hooks de .claude en 1 llamada: encabezados, tamaños, memorias de agentes, nombres viejos colgados y sintaxis de hooks. Uso: python3 scripts/verificar-skills.py"""
import glob, os, re, subprocess

R = "/home/usuario/proyectos/Mercado"
os.chdir(R)


def encabezado(ruta):
    txt = open(ruta, encoding="utf8").read()
    if not txt.startswith("---\n"):
        return None, "no abre con ---", len(txt.encode())
    fin = txt.find("\n---", 4)
    if fin < 0:
        return None, "no cierra ---", len(txt.encode())
    fm = txt[4:fin]
    campos = {}
    clave = None
    for linea in fm.splitlines():
        m = re.match(r"^([A-Za-z_-]+):\s*(.*)$", linea)
        if m:
            clave = m.group(1)
            campos[clave] = m.group(2).strip()
        elif clave and linea.startswith((" ", "\t")):
            campos[clave] = (campos[clave] + " " + linea.strip()).strip()
    falta = [c for c in ("name", "description") if not campos.get(c)]
    return campos, ("falta " + ",".join(falta)) if falta else "ok", len(txt.encode())


total = 0
print("== skills activas")
for ruta in sorted(glob.glob(".claude/skills/*/SKILL.md")):
    if "/_archive/" in ruta:
        continue
    campos, estado, b = encabezado(ruta)
    total += b
    desc = (campos or {}).get("description", "").strip("\"'>|- ")
    aviso = "" if len(desc) <= 300 else f"  ⚠ description {len(desc)} > 300"
    print(f"  {os.path.basename(os.path.dirname(ruta)):28} {b:6} B  {estado}{aviso}")
print(f"  total SKILL.md activos: {total} B (antes ~64.300)")

print("== agentes")
for ruta in sorted(glob.glob(".claude/agents/*.agent.md")):
    campos, estado, b = encabezado(ruta)
    print(f"  {os.path.basename(ruta):24} {b:6} B  {estado}")

print("== memorias de agentes")
for ruta in sorted(glob.glob(".claude/agent-memory/*/MEMORY.md")):
    b = os.path.getsize(ruta)
    arch = os.path.join(os.path.dirname(ruta), "_archivo.md")
    print(f"  {ruta.split('/')[2]:10} {b:6} B" + (f"  (+ _archivo.md {os.path.getsize(arch)} B)" if os.path.exists(arch) else ""))

print("== nombres viejos que siguen colgados (fuera de _archive y archivos de memoria)")
viejos = r"audit-first|migration-planner|\bdreaming\b|adr-manager|checkout-squad|bsm-typography-rules|(^|[^a-z-])/preview\b"
r = subprocess.run(["rg", "-n", "--no-messages", "-e", viejos, "CLAUDE.md", "AGENTS.md", ".claude/rules", ".claude/agents",
                    ".claude/hooks", ".claude/skills", ".claude/commands", "-g", "!**/_archive/**", "-g", "!**/_archivo*.md"],
                   capture_output=True, text=True)
lineas = [l for l in r.stdout.splitlines() if l.strip()]
print("\n".join("  " + l[:170] for l in lineas[:25]) or "  ninguno")

print("== hooks: sintaxis y prueba de pre-tool-guard")
for h in sorted(glob.glob(".claude/hooks/*.mjs")):
    c = subprocess.run(["node", "--check", h], capture_output=True, text=True)
    if c.returncode:
        print("  ROTO", h, c.stderr[:200])
entrada = '{"session_id":"x","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"%s"}' % R
p = subprocess.run(["node", ".claude/hooks/pre-tool-guard.mjs"], input=entrada, capture_output=True, text=True)
print(f"  pre-tool-guard con 'ls': salida {p.returncode} {p.stderr[:150]}")
