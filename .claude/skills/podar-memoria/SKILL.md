---
name: podar-memoria
description: "Poda la memoria del proyecto sin borrar nada: baja MEMORY.md, manda lo vencido a _archivo-index.md y avisa de hubs desactualizados. Usar cuando Brandon diga «limpia la memoria», «consolida la memoria» o «dreaming», o cuando MEMORY.md pase de 20 KB."
user-invocable: true
allowed-tools: Read, Edit, Bash, Grep
argument-hint: "[tamaño objetivo en KB]"
---

# Podar la memoria

`MEMORY.md` se carga entero en cada sesión; el tope es 200 líneas o 25 KB y lo que pase no entra. Meta: ≤ 15 KB.

1. Medir: `cd ~/.claude/projects/-home-usuario-proyectos-Mercado/memory && wc -c -l MEMORY.md`
2. Marcar lo vencido (una línea, no un archivo):
   - directivas cuya fecha de fin ya pasó («modo autónomo», «cargar mientras dure»);
   - resultados de una noche, un día o un plan EJECUTADO/CERRADO (ya están en `git log`);
   - líneas que un hub ya lista.
   Se quedan las DIRECTIVAS vigentes, las REGLAS DURAS, los gotchas de stack y los hubs.
3. Mover cada línea con Edit exacto a `_archivo-index.md`, bajo `## <tema> (movido del índice DD-MM)`. Releer `MEMORY.md` justo antes de editar: otros agentes le agregan líneas. Ningún archivo de memoria se toca ni se borra.
4. Hubs: la salida muestra enlaces reales vs el «— N memorias» de `MEMORY.md`, y los enlaces rotos:
   `for h in hub-*.md; do echo "$h $(rg -c '^- \[' $h) | MEMORY.md: $(rg -o "\($h\)[^\[]*— [0-9]+ memorias" MEMORY.md | rg -o '[0-9]+ memorias')"; rg -o '\]\(([^)#]+\.md)\)' -r '$1' $h | while read f; do [ -f "$f" ] || echo "  roto: $f"; done; done`
5. Reportar: tabla `Línea | Motivo | A dónde`, KB antes → después y los hubs a corregir (solo avisar).
