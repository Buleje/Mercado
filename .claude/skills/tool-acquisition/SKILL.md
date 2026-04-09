---
name: tool-acquisition
description: Skill de autopoder — busca, evalúa, instala, CONECTA y CREA nuevas librerías npm, MCPs, agentes ecc, skills, slash commands, hooks y herramientas externas para potenciar las capacidades del agente y del proyecto Bodega San Martín. Activar cuando detecto un gap de capacidad, cuando una tarea repetitiva podría ser una librería nueva, o cuando el usuario diga "potencia", "mejora tus skills", "instala lo necesario", "autoequipate", "si falta algo baja la librería", "crea un MCP", "crea una skill", "crea un agente".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
argument-hint: [gap-o-capacidad-a-cubrir]
---

# Tool Acquisition — Autoequipamiento del agente

Esta skill convierte al agente en un operador que **detecta gaps de capacidad y los cubre instalando O CREANDO la herramienta correcta**, en vez de quedarse esperando que Brandon mande a hacerlo.

> **Regla de oro:** "Si hay una librería/MCP/skill/plugin que resuelve esto mejor que yo hacerlo a mano, la INSTALO yo, la pruebo yo, y reporto el resultado. Y si NO existe una herramienta que resuelva el gap, la CREO yo — skill nueva, agente nuevo, slash command nuevo, hook nuevo o incluso MCP server nuevo. No le pido permiso para cada paso."

> **Autoridad ampliada 2026-04-08 (Brandon):** "si apruebo lo recomendado usa o instala el MCP y haz los cambios e incorpora en la memoria o skill persistente eso que uses los MCP o los crees, al igual de tools, skills y demás cosas para que hagas los cambios tú mismo a esas herramientas o acciones". La autoridad ya no se limita a **instalar** — incluye **usar, configurar, crear y modificar** MCPs, tools, skills, agentes, hooks y slash commands dentro del proyecto y del perfil global del usuario.

---

## 🎯 Cuándo activar esta skill

**Triggers explícitos** (frases del usuario):
- "potencia tus skills", "mejorate", "autoequipate"
- "si falta algo bajá la librería"
- "instala lo necesario", "agregá lo que hace falta"
- "¿podés hacer X?" → si la respuesta es "no con las tools actuales", activar

**Triggers implícitos** (yo los detecto):
- Estoy reinventando algo que seguro ya existe como npm package
- Un tarea repetitiva del proyecto podría ser una librería (ej. recomputación de totales, cache de Redis, scheduler)
- El usuario pide una integración (WhatsApp, SUNAT, DHL, pagos) que tiene SDK oficial
- Hay un MCP server público que me daría una capacidad nueva (figma, notion, linear, playwright)
- Un skill del plugin ecc ya resolvió un problema parecido en otro proyecto

---

## 🔭 Workflow de 6 pasos — SIEMPRE seguir en orden

### Paso 1 — Nombrar el gap (1 frase)

Antes de instalar nada, escribir en voz alta qué capacidad me falta:
```
GAP: "No puedo generar facturas PDF con QR SUNAT sin pegarme 200 líneas de jsPDF a mano"
```

Si no puedo escribir el gap en 1 frase, NO estoy listo para instalar — estoy adivinando.

### Paso 2 — Buscar candidatos (3 fuentes, en orden)

| Fuente | Cómo buscar | Cuándo |
|---|---|---|
| **npm / GitHub stars** | `WebSearch "mejor librería [gap] 2026 typescript npm"` | Tarea de código normal |
| **Vercel Marketplace** | `WebFetch https://vercel.com/marketplace` o Skill `vercel:marketplace` | Base de datos, auth, storage, email, search |
| **Plugin ecc agents/skills** | Revisar `C:\Users\Usuario\.claude\plugins\cache\ecc\ecc\` o `reference_ecc_plugin.md` | Workflow de código, review, testing, agentes |
| **MCP servers públicos** | `WebSearch "mcp server [gap]"` o https://github.com/modelcontextprotocol/servers | Nueva capacidad del agente (no del código) |
| **Context7 docs** | MCP `context7` para verificar APIs actuales | Siempre antes de instalar — para evitar copiar docs viejos |

### Paso 3 — Filtro 5/5 (aprobar antes de instalar)

Calificar cada candidato del 1 al 5:

| Criterio | Pregunta |
|---|---|
| **Mantenimiento** | ¿Último commit < 6 meses? ¿Downloads > 1000/sem en npm? |
| **Compatibilidad** | ¿Funciona con Next.js 16 + React 19 + Node 24? ¿Sin peer deps rotos? |
| **Licencia** | ¿MIT / Apache 2.0 / BSD? (NO GPL si el proyecto va a ser comercial) |
| **Tamaño** | ¿Pesa < 100 KB minified? (si es frontend) |
| **Alternativa existente** | ¿Ya hay algo en el proyecto que hace lo mismo? Si sí, NO instalar |

**Solo instalar si pasa con ≥ 4/5.** Si queda en 3/5, anotar en `docs/TECH-DEBT.md` y seguir haciéndolo a mano.

### Paso 4 — Instalar con seguridad

#### Para librerías npm:
```bash
cd bodega-san-martin

# 1. Instalar como dependencia normal o dev
npm install <paquete>
# o
npm install -D <paquete>

# 2. Verificar que no rompió nada
npm run lint
npx tsc --noEmit
npm run test

# 3. Actualizar package.json comentario si es necesario
```

#### Para MCP servers:
1. Abrir `~/.claude.json` o settings del harness
2. Agregar el server en `mcpServers` con placeholders si hay API keys
3. Reiniciar Claude Code (aviso a Brandon: "reinicia Claude Code para activar el MCP nuevo")
4. Verificar con `ListMcpResourcesTool`

#### Para skills de plugin ecc:
Ya están disponibles por namespace (`ecc:xxx`). Solo documentar cuándo usarla — no hay instalación.

#### Para agentes del proyecto:
Crear archivo en `bodega-san-martin/.claude/agents/<nombre>.md` siguiendo el patrón de los agentes existentes (ver `AGENTS.md`).

### Paso 5 — Probar en un ejemplo mínimo

ANTES de integrar a código de producción, hacer una prueba aislada:
```typescript
// scripts/test-nueva-libreria.mjs
import { thing } from "nueva-libreria";
console.log(await thing.hello());
```
Ejecutar. Si funciona → integrar. Si no → desinstalar y volver al Paso 2 con otro candidato.

### Paso 6 — Reportar en palabras simples

Cerrar con este formato:

```
✅ Instalé: <paquete>@<versión>
📋 Para qué sirve: <1 línea palabras simples>
🧪 Probado con: <ejemplo mínimo ejecutado>
🔁 Dónde lo voy a usar primero: <módulo del proyecto>
⚠️ Notas: <si hay peer warnings, reinicio pendiente, etc>
```

---

## 🏛️ Mandato de completeness — NIVEL 4 ENTERPRISE (2026-04-08)

> Brandon subió la vara el 2026-04-08: *"tablas completas, cosas completas bien hechas y elaboradas para que no tengas errores, actualiza el skill ambición a algo más grande y profesional"*.

**Regla nueva:** toda tool que instales o crees debe salir en estado **Nivel 4 completo**, no como prototipo. Eso significa:

| # | Checkpoint | Cómo se verifica |
|---|---|---|
| 1 | **Instalada con versión pinneada** | `npm install pkg@X.Y.Z` no `npm install pkg` |
| 2 | **Types instalados** | Si es JS, `@types/pkg` también |
| 3 | **Wrapper propio en `lib/`** | Nunca importar la lib cruda en 20 lugares — crear `lib/integrations/<tool>.ts` con tipo de retorno fijo |
| 4 | **Tests unitarios del wrapper** | Mínimo 3 tests (happy path + error path + edge case) |
| 5 | **Logger + Sentry en catches** | `logger.error` + `reportCriticalError` en todo catch del wrapper |
| 6 | **Feature flag si es riesgoso** | `lib/feature-flags.ts` para apagar en caliente si rompe prod |
| 7 | **ADR si agrega dep crítica** | auth/pagos/DB → siempre ADR en `docs/adr/` |
| 8 | **Documentación del wrapper** | JSDoc + sección en `CLAUDE.md` + ejemplo en `docs/examples/` si aplica |
| 9 | **Bundle size medido** (si frontend) | `npm run analyze` antes y después |
| 10 | **Verificación de no-breaking** | `npm run lint && npx tsc --noEmit && npm run test && npm run build` todos verdes |

**Si una tool sale con < 7/10 checkpoints, NO está lista.** Volvés y la completás, no entregás parcialmente.

**Anti-patrón prohibido:** "instalo la lib, pego 3 líneas de código de ejemplo, y ya". Eso es Nivel 2, no Nivel 4. Todo tool acquisition debe venir con wrapper + tests + logs + docs.

---

## 🚦 Safety checks — irrompibles

```
❌ NUNCA instalar paquetes con < 100 downloads/sem (salvo que sea del autor conocido)
❌ NUNCA instalar algo que el lock file no permita (conflicto de peer deps) sin confirmar
❌ NUNCA ejecutar post-install scripts sospechosos sin leerlos (riesgo supply chain)
❌ NUNCA instalar en directorio equivocado — siempre dentro de bodega-san-martin/
❌ NUNCA mezclar `npm install` y `pnpm install` — el proyecto usa npm, respetar
❌ NUNCA olvidar correr lint + tsc + test después de instalar
❌ NUNCA instalar GPL en código que va a vender (LTS comercial futuro)
❌ NUNCA entregar una instalación con < 7/10 checkpoints del mandato de completeness
❌ NUNCA dejar una tool instalada sin wrapper en lib/ (import directo en 10 archivos = deuda)
❌ NUNCA crear una skill/agente/MCP sin ejemplo real funcionando + tests + docs
```

```
✅ SIEMPRE usar context7 para verificar la API actual antes de escribir código con la librería
✅ SIEMPRE actualizar CLAUDE.md si la librería cambia el stack
✅ SIEMPRE crear ADR en docs/adr/ si agrega una dependencia crítica (auth, pagos, DB)
✅ SIEMPRE reportar tamaño del bundle después (npm run analyze) si es frontend
```

---

## 🧰 Catálogo de capacidades por tipo de gap

Esta tabla es la referencia rápida. Mantener actualizada cuando descubro un gap nuevo.

| Gap típico en Bodega | Herramienta recomendada | Fuente |
|---|---|---|
| Generar PDF con QR SUNAT | `jspdf` + `qrcode` o **Nutrient DWS API** | ecc skill `nutrient-document-processing` |
| Procesar audio/video | `fal-ai` SDK | ecc skill `fal-ai-media` |
| Enviar WhatsApp | `twilio` + template HSM (ver plantilla en lib/integrations) | npm |
| Scraping ético | `playwright` ya instalado | MCP existente |
| Vector search / embeddings | `@neondatabase/serverless` + pgvector | Vercel Marketplace |
| Cola de jobs | `bullmq` ya instalado | repo existente |
| Rate limiting distribuido | `@upstash/ratelimit` + `@upstash/redis` | Vercel Marketplace |
| Full-text search | pg_trgm ya instalado (bloque C) | Supabase |
| Chat buyer↔seller | `@supabase/realtime-js` | Skill `supabase` |
| Uploads de fotos | `@vercel/blob` | Skill `vercel-storage` |
| Mapas + geolocalización | `leaflet` ya instalado | repo existente |
| OCR de DNI / facturas | **fal.ai** (`qwen-ocr` variant) o Nutrient | ecc skill |
| Detección de fraude | Vercel BotID + heurísticas custom | Vercel plataforma |
| AI Agent durable | `workflow` + `@workflow/ai` (Vercel Workflow DevKit) | Skill `vercel:workflow` |

---

## 🏗️ Crear nuevas capacidades (cuando instalar no alcanza)

A veces el gap no lo cubre ninguna librería existente. En ese caso YO la creo.
**Autoridad ampliada:** puedo crear skills, agentes, slash commands, hooks y MCP servers sin pedir permiso, siempre que el resultado pase el Filtro 5/5 y respete los safety checks.

### Decisión rápida — ¿Instalar o crear?

| Situación | Qué hacer |
|---|---|
| Existe una librería npm con > 1k downloads/sem que resuelve el 80% del gap | **Instalar** (workflow 6 pasos de arriba) |
| Existe un MCP público que da la capacidad | **Instalar** el MCP |
| Hay un skill de ecc/plugin que ya cubre el escenario | **Usar** el skill existente |
| El gap es muy específico de Bodega San Martín (flujo, rol, dominio) | **Crear** una skill local en `bodega-san-martin/.claude/skills/` |
| Necesito un especialista en un área del proyecto (ej. delivery-routing-expert) | **Crear** un agente en `bodega-san-martin/.claude/agents/` |
| Tarea repetitiva que quiero invocar rápido (`/xxx`) | **Crear** un slash command en `bodega-san-martin/.claude/commands/` (si existe) o usar el skill directo |
| Proteger contra un comando peligroso o validar pre-commit | **Crear** un hook en `bodega-san-martin/.claude/hooks/` |
| Necesito una capacidad externa de agente (hablarle a una API/DB/servicio nuevo) | **Crear** un MCP server propio bajo `bodega-san-martin/.claude/mcp/` |

### Patrones de creación

#### A) Crear una skill local del proyecto

Ubicación: `bodega-san-martin/.claude/skills/<nombre>/SKILL.md`

Estructura mínima:
```md
---
name: <nombre>
description: Qué resuelve y cuándo activar (incluir triggers de frases comunes)
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
argument-hint: [contexto]
---

# <Título>

## Cuándo activar
## Workflow de N pasos
## Safety checks
## Ejemplo real
## Why / How to apply
```

Después: verificar que aparezca en la lista de skills cargadas (reinicio del harness si es necesario).

#### B) Crear un agente invocable del proyecto

Ubicación: `bodega-san-martin/.claude/agents/<nombre>.md`

Leer primero cualquier agente existente (`backend-platform-engineer`, `frontend-engineer`, `database-engineer`) para copiar el formato de frontmatter y el tono en español.

#### C) Crear un hook pre/post tool

Ubicación: `bodega-san-martin/.claude/hooks/<nombre>.<sh|ts|mjs>`

Registrar en `~/.claude/settings.json` o en el hook config del proyecto. Probar con una operación real antes de confiar.

#### D) Crear un MCP server propio

Usar el workflow de la skill `ecc:mcp-server-patterns` (si está disponible) o bien:
1. `npm init -y` dentro de `bodega-san-martin/.claude/mcp/<nombre>/`
2. Instalar `@modelcontextprotocol/sdk`
3. Implementar tools/resources/prompts siguiendo el SDK
4. Registrar en `mcpServers` de `~/.claude.json`
5. Reiniciar Claude Code

Un MCP propio tiene sentido cuando:
- Necesito exponer lógica del proyecto como tools del agente (ej. "listar rutas de delivery activas")
- Quiero que otros proyectos del usuario reutilicen la capacidad
- La integración externa no tiene SDK de Node maduro y prefiero encapsularla

#### E) Crear un slash command (si el proyecto lo permite)

Bodega San Martín carga slash commands desde `~/.claude/` (global) y plugins. Para comandos locales, el harness del usuario usa la convención `bodega-san-martin/.claude/commands/<nombre>.md` (verificar con un `ls`). El archivo `.md` con frontmatter `name:` + `description:` + body se convierte en `/<nombre>`.

### Reglas irrompibles al CREAR

```
❌ NUNCA crear una skill que duplique funcionalidad de una ecc o global existente (primero revisar)
❌ NUNCA crear un agente sin describir claramente cuándo NO usarlo
❌ NUNCA crear un MCP server sin revisar security review (maneja tokens, DB?, exec?)
❌ NUNCA dejar placeholders `TODO` sin resolver en la skill creada — se rompe sola después
❌ NUNCA crear un hook que bloquee comandos sin documentarlo en danger_zones.md
```

```
✅ SIEMPRE documentar en CLAUDE.md o AGENTS.md cuando creo un agente nuevo
✅ SIEMPRE cross-reference con principal_ambitious_evolution.md si la skill nueva aspira a nivel 3
✅ SIEMPRE probar la skill/agente creado con una tarea real antes de marcar como terminado
✅ SIEMPRE reportar en palabras simples: "creé skill X que hace Y, la activo diciendo Z"
```

### Ejemplo real — Creación de skill nueva

**Gap detectado:** "Necesito un flujo estándar para cuando armo bloques SQL de marketplace, porque siempre se me olvida un paso."

**Decisión:** No hay skill existente → la creo.

**Ubicación:** `bodega-san-martin/.claude/skills/marketplace-sql-blocks/SKILL.md`

**Contenido:** Workflow de 6 pasos (diseño → SQL → DB class → route handlers → tests → aplicar manual).

**Reporte a Brandon:**
> "Creé la skill `marketplace-sql-blocks` en `.claude/skills/`. La activo automáticamente cuando me pidas 'siguiente bloque de marketplace'. Incluye la decisión de usar `$queryRawUnsafe` hasta que se sincronice el schema. Tarda 30 s en cargar al reiniciar."

---

## 🔗 Skills que esta skill potencia

Esta skill se activa ANTES que estas otras, para asegurar que la herramienta correcta esté instalada:

- `vercel-storage` — antes de subir imágenes del marketplace
- `supabase` — antes de usar Realtime para el chat del bloque D
- `vercel:workflow` — antes de armar workflows durables (delivery tracking async)
- `vercel:ai-sdk` — antes de tocar el IA Coach
- `ecc:documentation-lookup` — antes de escribir código con una librería nueva
- `ecc:security-review` — después de instalar algo que toca auth o pagos

---

## 🧪 Ejemplo real — Cómo aplicaría en el bloque D

**Gap detectado:** "Para el chat in-app del bloque D2, necesito realtime sin reinventar WebSockets."

**Candidatos evaluados:**

| Opción | Mantenimiento | Compat | Licencia | Tamaño | Alternativa | Score |
|---|---|---|---|---|---|---|
| Supabase Realtime | 5/5 | 5/5 | MIT | ~50KB | No existe | **5/5** ✅ |
| Pusher | 5/5 | 5/5 | Closed | ~30KB | Caro | 3/5 |
| socket.io custom | 5/5 | 4/5 | MIT | ~80KB | Mucho boilerplate | 3/5 |

**Ganador:** Supabase Realtime (ya tengo Supabase en el stack, score 5/5).

**Instalación:**
```bash
cd bodega-san-martin
npm install @supabase/realtime-js
npm run lint && npx tsc --noEmit && npm run test
```

**Reporte:** "Instalé @supabase/realtime-js. Sirve para que dos pantallas del marketplace se sincronicen al segundo. Probado con ejemplo mínimo OK. Lo voy a usar en `components/marketplace/chat/*` cuando haga D2."

---

## 📝 Why

Brandon compite contra ERPs grandes con presupuesto cero. Su ventaja es **velocidad de adopción**: si una herramienta nueva le da superpoderes, tiene que estar en el stack en horas, no en semanas. Este skill me obliga a pensar como un CTO que compra herramientas, no como un junior que todo lo hace a mano porque "así aprende".

## How to apply

1. Cada vez que detecto un gap → activar esta skill automáticamente
2. Nunca instalar sin pasar el Filtro 5/5
3. Siempre reportar en palabras simples, no en jerga técnica
4. Siempre actualizar el catálogo con lo aprendido
5. Siempre correr lint + tsc + test después de instalar
