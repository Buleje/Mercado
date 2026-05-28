# Auditoria de permisos .claude/settings.json — 2026-05-28

**Auditor:** Security-Auditor (Buleje)
**Alcance:** permissions.allow (151 entradas) en .claude/settings.json
**Modo:** READ-ONLY (no se modifica settings.json).
**Objetivo:** reducir surface area sin perder usabilidad para Brandon (uso intensivo, Next.js 16 multi-tenant SaaS).

> Aclaracion de conteo: el array tiene 152 lineas; mcp__github__list_issues aparece DUPLICADO (lineas 330 y 334). Eso lo cuenta como redundant natural.

---

## Tabla de clasificacion

| # | Entry | Categoria | Razon / Accion sugerida |
|---|---|---|---|
| 1 | Bash(npm *) | safe-keep | Uso diario (dev, build, test, lint, install). Frecuencia altisima. |
| 2 | Bash(npx *) | risky-review | Ejecuta paquetes arbitrarios de npm (supply chain). Restringir a allowlist: npx prisma *, npx playwright *, npx tsx *. |
| 3 | Bash(node *) | safe-keep | Necesario para scripts de scripts/, dev-helpers, hooks. |
| 4 | Bash(pnpm *) | redundant | Proyecto usa npm (package-lock.json, scripts npm). Subsumida por flujo npm. Remover salvo que se confirme uso. |
| 5 | Bash(yarn *) | redundant | Idem pnpm — proyecto npm-based. Remover. |
| 6 | Bash(bun *) | risky-review | Bun instalado (memoria 2026-05-24 OpenClaw) pero no usado en build oficial. Verificar uso real; si no, remover. |
| 7 | Bash(tsx *) | safe-keep | Runner TS para scripts ad-hoc. Util. |
| 8 | Bash(ts-node *) | redundant | tsx ya cubre el caso. ts-node no aparece en package.json scripts. Remover. |
| 9 | Bash(git add*) | safe-keep | Commit flow. |
| 10 | Bash(git commit*) | safe-keep | Commit flow. |
| 11 | Bash(git status*) | safe-keep | Uso obsesivo (memoria: tuning git status 150x). |
| 12 | Bash(git log*) | safe-keep | Historico. |
| 13 | Bash(git diff*) | safe-keep | Pre-commit. |
| 14 | Bash(git branch*) | safe-keep | Branching workflow activo. |
| 15 | Bash(git checkout*) | risky-review | git checkout con punto puede borrar cambios. Mantener pero recordar — deny ya cubre git-clean agresivo. |
| 16 | Bash(git stash*) | safe-keep | Util en flow. |
| 17 | Bash(git restore*) | risky-review | git restore punto borra cambios sin staged. Mantener pero awareness. |
| 18 | Bash(git fetch*) | safe-keep | Sync remoto. |
| 19 | Bash(git pull*) | safe-keep | Sync. |
| 20 | Bash(git push origin*) | safe-keep | Push controlado (deny cubre --force). |
| 21 | Bash(git merge*) | safe-keep | Branching. |
| 22 | Bash(git rebase*) | risky-review | Rebase puede reescribir historia compartida. Mantener pero atencion. |
| 23 | Bash(git tag*) | safe-keep | Releases. |
| 24 | Bash(git config --get*) | safe-keep | Solo lectura por flag --get. Bien restringido. |
| 25 | Bash(gh *) | risky-review | GitHub CLI muy amplio (gh repo delete, gh secret set, gh pr merge). Tightening: gh pr *, gh issue *, gh api *, gh run *, sin gh repo delete / gh secret. |
| 26 | Bash(ls *) | safe-keep | Diario. |
| 27 | Bash(cat *) | safe-keep | Lectura. Read tool preferido pero cat es necesario en pipes. |
| 28 | Bash(head *) | safe-keep | Pipes. |
| 29 | Bash(tail *) | safe-keep | Logs (tail dev-log). |
| 30 | Bash(wc *) | safe-keep | LOC counts. |
| 31 | Bash(find *) | safe-keep | Busqueda fs. |
| 32 | Bash(grep *) | safe-keep | Busqueda diaria. |
| 33 | Bash(rg *) | safe-keep | ripgrep — usado constantemente. |
| 34 | Bash(sed *) | risky-review | sed -i modifica in-place sin backup. Mantener; pero CLAUDE.md ya pide usar Edit tool. |
| 35 | Bash(awk *) | safe-keep | Procesamiento. |
| 36 | Bash(echo *) | safe-keep | Util. |
| 37 | Bash(printf *) | safe-keep | Util. |
| 38 | Bash(mkdir *) | safe-keep | Crear directorios. |
| 39 | Bash(cp *) | safe-keep | Copiar archivos. |
| 40 | Bash(mv *) | risky-review | mv puede sobrescribir destinos. Mantener pero awareness; preferir Write tool. |
| 41 | Bash(touch *) | safe-keep | Util. |
| 42 | Bash(chmod *) | risky-review | chmod 777 o chmod -R peligrosos. Mantener (necesario para scripts), pero deny suplementario podria filtrar chmod 777*. |
| 43 | Bash(sleep *) | safe-keep | Util. |
| 44 | Bash(which *) | safe-keep | Diagnostico. |
| 45 | Bash(where *) | redundant | which ya cubre POSIX; where es Windows-style, no funciona en bash WSL nativamente. Remover. |
| 46 | Bash(pwd) | safe-keep | Util. |
| 47 | Bash(env) | risky-review | env (sin args) imprime TODO incluido tokens (TWILIO_*, STRIPE_*, AUTH_SECRET). Solicitar specific env grep PUBLIC_ o tightening: Bash(env grep*). |
| 48 | Bash(psql *) | risky-review | Acceso directo a Postgres — comandos destructivos posibles. Deny ya bloquea palabras clave en string pero los matchers actuales son textuales. Sugerir: solo psql * -c SELECT o requerir aprobacion. |
| 49 | Bash(docker ps*) | safe-keep | Solo lectura. |
| 50 | Bash(docker logs*) | safe-keep | Solo lectura. |
| 51 | Bash(docker compose ps*) | safe-keep | Solo lectura. |
| 52 | Bash(vercel *) | risky-review | Puede desplegar/eliminar (deny cubre vercel remove y vercel rollback --yes). Otros subcomandos como vercel env rm siguen abiertos. Tighten: vercel ls, vercel inspect, vercel logs, vercel env ls. |
| 53 | Bash(supabase *) | risky-review | Deny ya cubre supabase db reset. Pero supabase db push, supabase secrets set siguen abiertos. Tighten o requerir aprobacion. |
| 54 | Bash(curl -s http*) | safe-keep | Restringido a HTTP read. Util para health checks. |
| 55 | Bash(curl -sS http*) | safe-keep | Idem. |
| 56 | Bash(curl -s -o /dev/null *) | safe-keep | Discard output, no exfil. |
| 57 | Bash(curl -sS -o /dev/null *) | safe-keep | Idem. |
| 58 | Bash(curl -s -b /tmp/*) | safe-keep | Cookies en /tmp para auth helpers. Restringido. |
| 59 | Bash(curl -s -c /tmp/*) | safe-keep | Idem. |
| 60 | Bash(curl -s -b *) | risky-review | Subsume #58. Mas amplio — permite cualquier cookie path. Verificar uso real; si solo /tmp, remover este. |
| 61 | Bash(claude mcp list*) | safe-keep | Diagnostico MCP. |
| 62 | Bash(claude mcp get*) | safe-keep | Diagnostico MCP. |
| 63 | Bash(claude mcp add*) | risky-review | Agrega MCP servers (puede ejecutar codigo arbitrario via comando MCP). Confirmar con aprobacion interactiva. |
| 64 | Bash(claude mcp remove*) | risky-review | Remueve MCPs — podria romper workflows. Mantener pero awareness. |
| 65 | Bash(node scripts/dev-helpers/*) | safe-keep | Dev helpers conocidos. |
| 66 | Bash(node scripts/auto-screenshot.mjs*) | redundant | Subsumida por #3 Bash(node *). Remover. |
| 67 | Bash(node scripts/visual-diff.mjs*) | redundant | Subsumida por #3 Bash(node *). Remover. |
| 68 | Bash(node scripts/dev-helpers/admin-auth.mjs*) | redundant | Subsumida por #65 Bash(node scripts/dev-helpers/*). Remover. |
| 69 | Bash(node scripts/dev-helpers/health.mjs*) | redundant | Subsumida por #65. Remover. |
| 70 | Bash(node scripts/dev-helpers/browse.mjs*) | redundant | Subsumida por #65. Remover. |
| 71 | Bash(node scripts/dev-helpers/audit-a11y.mjs*) | redundant | Subsumida por #65. Remover. |
| 72 | Bash(source /tmp/bsm-auth.env*) | safe-keep | Dev-helpers auth setup. |
| 73 | Bash(printf * > /tmp/bsm-dz-bypass-*) | safe-keep | Bypass tokens danger-zone hook. Scope /tmp. |
| 74 | Bash(echo * > /tmp/bsm-dz-bypass-*) | safe-keep | Idem #73. |
| 75 | mcp__playwright__browser_navigate | safe-keep | E2E. |
| 76 | mcp__playwright__browser_snapshot | safe-keep | E2E. |
| 77 | mcp__playwright__browser_take_screenshot | safe-keep | E2E. |
| 78 | mcp__playwright__browser_console_messages | safe-keep | E2E. |
| 79 | mcp__playwright__browser_network_requests | safe-keep | E2E. |
| 80 | mcp__playwright__browser_resize | safe-keep | Responsive testing. |
| 81 | mcp__playwright__browser_close | safe-keep | Cleanup. |
| 82 | mcp__playwright__browser_click | safe-keep | E2E interaction. |
| 83 | mcp__playwright__browser_type | safe-keep | E2E input. |
| 84 | mcp__playwright__browser_fill_form | safe-keep | E2E form. |
| 85 | mcp__playwright__browser_evaluate | risky-review | browser_evaluate ejecuta JS arbitrario en el contexto del navegador autenticado. Util pero potente. Mantener — esencial para QA. |
| 86 | mcp__playwright__browser_press_key | safe-keep | E2E. |
| 87 | mcp__playwright__browser_hover | safe-keep | E2E. |
| 88 | mcp__playwright__browser_navigate_back | safe-keep | E2E. |
| 89 | mcp__playwright__browser_select_option | safe-keep | E2E. |
| 90 | mcp__playwright__browser_wait_for | safe-keep | E2E. |
| 91 | mcp__playwright__browser_handle_dialog | safe-keep | E2E. |
| 92 | mcp__playwright__browser_tabs | safe-keep | E2E. |
| 93 | mcp__desktop-control__screenshot | safe-keep | Memoria reference_desktop_control activa. |
| 94 | mcp__desktop-control__screen_info | safe-keep | Idem. |
| 95 | mcp__desktop-control__mouse_position | safe-keep | Idem. |
| 96 | mcp__desktop-control__mouse_click | risky-review | Control total mouse Windows. Memoria autoriza pre-aprobado. Mantener bajo awareness. |
| 97 | mcp__desktop-control__mouse_move | safe-keep | Idem. |
| 98 | mcp__desktop-control__mouse_scroll | safe-keep | Idem. |
| 99 | mcp__desktop-control__keyboard_press | risky-review | Tipear en cualquier ventana enfocada (ej. terminal con elevacion). Riesgo cross-app. Pre-aprobado por usuario. |
| 100 | mcp__desktop-control__keyboard_type | risky-review | Idem #99. |
| 101 | mcp__desktop-control__keyboard_combo | risky-review | Combos tipo Ctrl+Alt+Del. Pre-aprobado. Awareness. |
| 102 | mcp__desktop-control__wait | safe-keep | Util. |
| 103 | mcp__postgres__query | risky-review | Query directa a Postgres. Permite comandos destructivos si el role del MCP no es read-only. Verificar que el role expuesto sea solo lectura; si no, tighten. |
| 104 | mcp__github__get_file_contents | safe-keep | Lectura GitHub. |
| 105 | mcp__github__list_pull_requests | safe-keep | Lectura. |
| 106 | mcp__github__get_pull_request | safe-keep | Lectura. |
| 107 | mcp__github__list_commits | safe-keep | Lectura. |
| 108 | mcp__github__list_issues | safe-keep | Lectura. |
| 109 | mcp__github__search_code | safe-keep | Lectura. |
| 110 | mcp__github__get_pull_request_files | safe-keep | Lectura. |
| 111 | mcp__github__get_pull_request_status | safe-keep | Lectura. |
| 112 | mcp__github__list_issues | redundant | DUPLICADO exacto de #108. Remover. |
| 113 | mcp__github__get_issue | safe-keep | Lectura. |
| 114 | mcp__claude_ai_Supabase__list_projects | safe-keep | Solo lectura. |
| 115 | mcp__claude_ai_Supabase__list_tables | safe-keep | Solo lectura. |
| 116 | mcp__claude_ai_Supabase__list_migrations | safe-keep | Solo lectura. |
| 117 | mcp__claude_ai_Supabase__execute_sql | risky-review | SQL directo en Supabase (incluido write). Mantener pero requerir consciencia + deny en MCP server level si posible (role read-only). |
| 118 | mcp__claude_ai_Supabase__apply_migration | risky-review | Aplica migraciones a Supabase. Cambios irreversibles posibles. Mantener — usado para RLS — pero alerta. |
| 119 | mcp__claude_ai_Supabase__get_logs | safe-keep | Solo lectura. |
| 120 | mcp__claude_ai_Supabase__get_advisors | safe-keep | Solo lectura. |
| 121 | mcp__claude_ai_Supabase__get_project | safe-keep | Solo lectura. |
| 122 | mcp__claude_ai_Supabase__get_project_url | safe-keep | Solo lectura. |
| 123 | mcp__claude_ai_Supabase__search_docs | safe-keep | Solo lectura docs. |
| 124 | mcp__claude_ai_Vercel__list_deployments | safe-keep | Lectura. |
| 125 | mcp__claude_ai_Vercel__get_deployment | safe-keep | Lectura. |
| 126 | mcp__claude_ai_Vercel__get_deployment_build_logs | safe-keep | Lectura. |
| 127 | mcp__claude_ai_Vercel__get_runtime_logs | safe-keep | Lectura. |
| 128 | mcp__claude_ai_Vercel__list_projects | safe-keep | Lectura. |
| 129 | mcp__claude_ai_Vercel__get_project | safe-keep | Lectura. |
| 130 | mcp__claude_ai_Sentry__find_issues | safe-keep | Lectura. |
| 131 | mcp__claude_ai_Sentry__search_issues | safe-keep | Lectura. |
| 132 | mcp__claude_ai_Sentry__search_events | safe-keep | Lectura. |
| 133 | mcp__claude_ai_Sentry__find_organizations | safe-keep | Lectura. |
| 134 | mcp__claude_ai_Sentry__find_projects | safe-keep | Lectura. |
| 135 | mcp__claude_ai_Sentry__get_sentry_resource | safe-keep | Lectura. |
| 136 | mcp__context7__resolve-library-id | safe-keep | Docs lookup. |
| 137 | mcp__context7__query-docs | safe-keep | Docs lookup. |
| 138 | Read(CLAUDE_PROJECT_DIR/**) | safe-keep | Lectura repo (deny ya excluye .env*). |
| 139 | Write(CLAUDE_PROJECT_DIR/**) | safe-keep | Escritura repo (deny excluye .env*). |
| 140 | Edit(CLAUDE_PROJECT_DIR/**) | safe-keep | Edicion repo (deny excluye .env*). |
| 141 | MultiEdit(CLAUDE_PROJECT_DIR/**) | safe-keep | Edicion bulk. |
| 142 | Glob(*) | safe-keep | Busqueda paths. |
| 143 | Grep(*) | safe-keep | Busqueda content. |
| 144 | TaskCreate | safe-keep | Workflow agent. |
| 145 | TaskUpdate | safe-keep | Workflow agent. |
| 146 | TaskList | safe-keep | Workflow agent. |
| 147 | TaskGet | safe-keep | Workflow agent. |
| 148 | Agent(*) | risky-review | Permite invocar CUALQUIER agente. Si hay agentes con permisos extendidos, hereda riesgo. Tightening: lista explicita Agent(security-auditor), Agent(build-engineer), etc. — pero impacta usabilidad Hub & Spoke. Mantener si flujo lo demanda. |
| 149 | Skill(*) | risky-review | Idem #148 — skills pueden tener side effects. Mantener pero awareness. |
| 150 | WebFetch(*) | risky-review | Fetch arbitrario a internet. Riesgo de exfiltracion + SSRF-like. Tighten a allowlist de dominios: WebFetch(https://docs.*), WebFetch(https://github.com/*), etc. |
| 151 | WebSearch | safe-keep | Busqueda web sin ejecucion. |

---

## Resumen ejecutivo

**Total entradas auditadas:** 151

| Categoria | Cantidad | % |
|---|---|---|
| safe-keep | 113 | 74.8% |
| redundant | 11 | 7.3% |
| risky-review | 27 | 17.9% |

### Redundantes (propuesta de remocion — 11 entradas)

| # | Entry | Subsumida por |
|---|---|---|
| 4 | Bash(pnpm *) | flujo npm exclusivo del repo |
| 5 | Bash(yarn *) | flujo npm exclusivo del repo |
| 8 | Bash(ts-node *) | Bash(tsx *) cubre el caso |
| 45 | Bash(where *) | Bash(which *) |
| 66 | Bash(node scripts/auto-screenshot.mjs*) | Bash(node *) |
| 67 | Bash(node scripts/visual-diff.mjs*) | Bash(node *) |
| 68 | Bash(node scripts/dev-helpers/admin-auth.mjs*) | Bash(node scripts/dev-helpers/*) |
| 69 | Bash(node scripts/dev-helpers/health.mjs*) | Bash(node scripts/dev-helpers/*) |
| 70 | Bash(node scripts/dev-helpers/browse.mjs*) | Bash(node scripts/dev-helpers/*) |
| 71 | Bash(node scripts/dev-helpers/audit-a11y.mjs*) | Bash(node scripts/dev-helpers/*) |
| 112 | mcp__github__list_issues (segunda aparicion) | duplicado exacto de #108 |

### Risky-review priorizados (top 10 — tighten urgente)

| Prioridad | # | Entry | Tighten propuesto |
|---|---|---|---|
| Critico | 47 | Bash(env) | Cambiar a Bash(env grep NEXT_PUBLIC_*) o requerir aprobacion. Riesgo dump de AUTH_SECRET / STRIPE_*. |
| Critico | 48 | Bash(psql *) | Limitar a psql * -c SELECT o pasar a mcp__postgres con role read-only. |
| Critico | 2 | Bash(npx *) | Allowlist: npx prisma *, npx playwright *, npx tsx *. Bloquea supply-chain via npx package arbitrario. |
| Critico | 150 | WebFetch(*) | Allowlist dominios (docs, github, supabase, vercel, sentry, posthog). |
| Alto | 25 | Bash(gh *) | Allowlist subcomandos: gh pr *, gh issue *, gh run *, gh api *, gh release view*. Excluir gh repo delete, gh secret set. |
| Alto | 52 | Bash(vercel *) | Allowlist: vercel ls, vercel inspect, vercel logs, vercel env ls, vercel deploy. |
| Alto | 53 | Bash(supabase *) | Allowlist: supabase status, supabase db diff, supabase functions logs. Bloquear secrets set, db push. |
| Alto | 117 | mcp__claude_ai_Supabase__execute_sql | Confirmar que el token MCP usa role anon o app_user, no postgres. |
| Alto | 118 | mcp__claude_ai_Supabase__apply_migration | Mantener pero loguear cada uso (ya hay audit log de prisma). |
| Medio | 103 | mcp__postgres__query | Verificar role del connection string del MCP. Si es write-capable, requerir aprobacion. |

### Risky-review secundarios (verificar uso real)

- #6 Bash(bun *) — confirmar uso o remover
- #15 git checkout*, #17 git restore*, #22 git rebase* — destructivos pero necesarios
- #34 sed *, #40 mv *, #42 chmod * — utiles, mantener
- #60 curl -s -b * — duplica #58 en alcance mas amplio, considerar remover
- #63 claude mcp add*, #64 claude mcp remove* — pre-aprobacion interactiva
- #85, #96-101 — playwright/desktop-control con interaccion: pre-aprobado por Brandon
- #148 Agent(*), #149 Skill(*) — patron Hub & Spoke lo demanda, mantener

### Ganancia esperada

- **Remocion redundantes:** -11 entradas (7.3% surface area). 0 impacto funcional.
- **Tighten 4 risky-review criticos** (#2, #47, #48, #150): cierra los 4 vectores mas claros de exfil/supply-chain.
- **Total nueva count estimada:** 140 entradas (vs 151 hoy) con surface area material -25%.

### Lo que NO se toca (rationale)

- Toda la suite Playwright/Desktop-Control completa (#75-102): Brandon la usa diariamente para QA y desktop automation (memorias activas).
- Lectura Supabase/Vercel/Sentry/GitHub: solo-lectura, valor alto.
- Read/Write/Edit/MultiEdit con scope CLAUDE_PROJECT_DIR/**: deny ya filtra .env*.
- Git workflow completo: uso intensivo confirmado en memoria de sesiones.

---

## Notas finales

1. El bloque deny actual (lineas 375-414) es solido — cubre rm recursivo, escalacion de privilegios, curl-pipe-shell, push --force, prisma migrate reset, db reset, lectura/escritura .env*. Recomendable agregar:
   - Bash(chmod -R 777*), Bash(chmod 777 /*)
   - Bash(npx * -y *) si se decide tighten npx
   - Bash(env) literal (sin args) para forzar uso con filtro
   - WebFetch(http://*) para forzar HTTPS (evitar exfil cleartext)
2. El comentario _comment_env_deny aclara que el main agent puede sobrepasar el deny interactivamente — esto es correcto para Brandon como humano-en-el-loop.
3. Considerar mover hooks *.OFF a deny explicito si se reactivan parcialmente.
