export const meta = {
  name: 'panel-ola',
  whenToUse: 'Correr una ola del plan «panel unificado» (docs/panel/plan-unificacion-2026-10.md) con args de .claude/autonomo/panel/args-olas.json más sp (scratchpad).',
  description: 'Una ola del plan panel unificado: carriles en paralelo (diseño + revisión + arreglo), integrador y verificación',
  phases: [
    { title: 'Construir', detail: 'carriles de la ola en paralelo' },
    { title: 'Diseño', detail: 'pasada de diseño paso a paso (pantallas y modales)' },
    { title: 'Revisar', detail: 'reviewer / security y arreglo' },
    { title: 'Integrar', detail: 'registros de pestañas, alias y barra' },
    { title: 'Verificar', detail: 'gates, enlaces viejos, roles, medición por vista' },
  ],
}

const OLA = args.ola
const CARRILES = args.carriles
const SEGURIDAD = new Set(args.seguridad || [])
const OPUS = new Set(args.opus || [])
const SIN_DISENO = new Set(args.sinDiseno || [])
const SOLO_LECTURA = new Set(args.soloLectura || [])
const PLAN_JSON = '/home/usuario/proyectos/Mercado/.claude/autonomo/panel/plan.json'
// Scratchpad de la sesión que corre la ola: pasalo en args.sp (el de la sesión del 09-10 ya no existe).
const SP = args.sp || '/tmp/claude-1000/-home-usuario-proyectos-Mercado/ce6f086b-a736-4d2b-be95-41a0a8c6777a/scratchpad'

const BUILD = {
  type: 'object',
  properties: {
    carril: { type: 'string' }, hecho: { type: 'boolean' }, resumen: { type: 'string' },
    archivos: { type: 'array', items: { type: 'string' } }, mensajeCommit: { type: 'string' },
    evidencia: { type: 'string' }, pendientes: { type: 'string' }, paraAcelerar: { type: 'string' },
  },
  required: ['carril', 'hecho', 'resumen', 'archivos', 'mensajeCommit', 'evidencia', 'pendientes', 'paraAcelerar'],
}

const COMUN = `PLAN APROBADO POR BRANDON: docs/panel/plan-unificacion-2026-10.md (leé primero la tabla «Decisiones de Brandon» del principio, después §1, §2 en lo tuyo, §4, §5, §6 y §7.0). Tu instrucción completa está en el JSON del plan: \`node -e 'const p=require("${PLAN_JSON}");const c=p.olas.find(o=>o.n===${OLA}).carriles.find(c=>c.k===process.argv[1]);console.log(c.prompt);console.log("ARCHIVOS:",c.archivos.join(" "))' <TU_CLAVE>\`.
DECISIONES QUE MANDAN SOBRE EL PLAN si algo choca: grupo «Gestión» (Mi Plata, Equipo, Documentos dentro); botones y filtros de 48 px (h-12); UNA sola tarjeta de cifra = StatCard del DS con lo mejor de KpiTile; Fiados en Ventas y caja › Me deben; Delivery dentro de Pedidos y reparto; el cajero ve lo que su rol permite (bandera + security); lotes con QR dentro de Libro CTP › Despacho. Todo lo demás de «Decide Brandon» queda COMO HOY.
OPERACIÓN: checkout principal, nunca worktree; NO uses git para escribir (ni stash, ni checkout, ni reset, ni commit: commitea el hilo principal al cerrar la ola). \`git show HEAD:<archivo>\` para ver lo anterior. \`ls\` antes de crear. NUNCA \`pkill -f\`/\`pgrep -f\`. Scratchpad: ${SP}/panel/<TU_CLAVE>/. Servidor http://localhost:3000. Si /login no contesta, NO lo reinicies ni mates procesos: un vigía lo levanta solo en ≤8 min; reintentá cada 2 min hasta 12 min y, si sigue caído, seguí sin captura y decilo en «pendientes». qa-capturas ya da por visto el tour de bienvenida (sin eso, /admin sin ?tab saltaba al Asistente IA). \`npm run typecheck\` UNA vez al final (hace fila solo). Capturas con \`node scripts/qa-capturas.mjs --candado …\`.
ENTREGA: con StructuredOutput (donde tu instrucción pida «reporte en TEXTO», va dentro de «resumen»; ni el integrador commitea: deja archivos y mensajeCommit, los commits los hace el hilo principal al cerrar la ola). «archivos» = rutas relativas al repo de TODO lo que tocaste o creaste o borraste (nada de .claude/ ni del scratchpad). mensajeCommit: Conventional, subject en minúscula ≤90 caracteres, cuerpo en español con líneas ≤100 caracteres, y al final estas dos líneas exactas:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JsjnVjJbxADYZSRBW8WXFx`

const prompt = (c) => `${COMUN}\n\nTU CLAVE: ${c.k} — ${c.titulo} (ola ${OLA}).${SOLO_LECTURA.has(c.k) ? '\nESTE CARRIL ES SOLO LECTURA EN ESTA CORRIDA: auditá y proponé (archivos=[] , hecho=true), NO edites nada; lo que haga falta cambiar va en «pendientes» con archivo:línea para que Brandon lo apruebe.' : ''}\nOTROS CARRILES DE ESTA OLA (no toques sus archivos): ${CARRILES.filter((x) => x.k !== c.k).map((x) => x.k + ' ' + x.titulo).join(' · ')}`

const disenoPaso = async (c, build) => {
  if (!build || !build.hecho || c.tipo !== 'frontend' || SIN_DISENO.has(c.k) || SOLO_LECTURA.has(c.k) || !build.archivos.length) return build
  const d = await agent(`${COMUN}\n\nPASADA DE DISEÑO paso a paso del carril ${c.k} («${c.titulo}»). Archivos del carril: ${build.archivos.join(', ')}. Resumen del constructor: ${build.resumen.slice(0, 1500)}
1) Capturas de lo que este carril cambió en pantalla, incluidos los modales que abre: claro y oscuro a 1280 y a 400 px. 2) Revisá contra el contrato de diseño (§5 del plan) y las decisiones: un título por vista (SectionTitle) y CardTitle en bloques, ⓘ en vez de párrafos, botones y filtros h-12 con los primitivos del DS, StatCard única, tablas DataTable, checks/switches del DS, modales AdminModal con pie, gráficos con COLOR_CONCEPTO, movimiento con tokens, ≤2 niveles de pestañas, vacíos y cargas del DS, oscuro y 400 px sin desborde. 3) ARREGLÁ vos lo que encuentres SOLO en esos archivos y repetí la captura. Entregá el mismo formato con la lista FINAL de archivos; en «evidencia», las rutas de las capturas antes/después.`, { label: `diseno:${c.k}`, phase: 'Diseño', schema: BUILD, agentType: 'frontend' })
  if (d && d.hecho) return { ...d, archivos: [...new Set([...build.archivos, ...d.archivos])], mensajeCommit: build.mensajeCommit }
  return build
}

const revisar = async (c, build) => {
  if (!build || !build.hecho) return { build, review: null, fix: null }
  if (SOLO_LECTURA.has(c.k) || !build.archivos.length) return { build, review: 'APROBADO (solo lectura)', fix: null }
  const esSeg = SEGURIDAD.has(c.k)
  const review = await agent(`Revisión con contexto fresco del carril ${c.k} («${c.titulo}», ola ${OLA}) del plan «panel unificado» (docs/panel/plan-unificacion-2026-10.md: leé las Decisiones de Brandon, §1, §5 y §7.0). Archivos: ${build.archivos.join(', ')}. Diff: \`git diff -- <archivos>\` y \`git status --short -- <archivos>\`. Resumen del constructor: ${build.resumen.slice(0, 2000)}
Criterios: hace lo de su instrucción (node -e con la clave ${c.k} en ${PLAN_JSON}); NADA se perdió (cada función, campo y dato del lugar viejo está en el nuevo o enlazado; los ids viejos siguen abriendo); ningún plan, rol, rubro ni plantilla pierde lo que veía (permiso por origen); no tocó archivos de otros carriles ni registros que no le tocan; sin cambios de cálculo, endpoints ni datos salvo que su instrucción lo diga; contrato de diseño y decisiones (48 px, StatCard única); sin hex, oscuro, 400 px, tuteo, ≤300 líneas por componente. ${esSeg ? 'SEGURIDAD: es control de acceso (rol/plan/vista): buscá escaladas de privilegio (un rol que ve o hace algo que antes no podía SIN que Brandon lo aprobara), datos entre negocios y bypass por URL.' : ''} NO edites. ≤35 llamadas. Reporte en TEXTO: primera línea «APROBADO» o «CAMBIOS», después la lista con archivo:línea.`, { label: `revisar:${c.k}`, phase: 'Revisar', agentType: esSeg ? 'security' : 'reviewer', model: esSeg || OPUS.has(c.k) ? undefined : 'sonnet' })
  let fix = null
  if (review && /^\s*CAMBIOS/i.test(review)) {
    fix = await agent(`${prompt(c)}\n\nYA CONSTRUISTE este carril (archivos: ${build.archivos.join(', ')}). El revisor pidió cambios:\n${review}\nAplicá sólo eso (sin tocar archivos de otros carriles), verificá lo que cambie y \`npm run typecheck\`. Entregá el mismo formato con la lista FINAL de archivos.`, { label: `arreglar:${c.k}`, phase: 'Revisar', schema: BUILD, agentType: c.tipo })
  }
  return { build, review, fix }
}

const normales = CARRILES.filter((c) => !c.integrador)
const integradores = CARRILES.filter((c) => c.integrador)

phase('Construir')
const res = await pipeline(
  normales,
  (c) => agent(prompt(c), { label: `construir:${c.k}`, phase: 'Construir', schema: BUILD, agentType: c.tipo }),
  (b, c) => disenoPaso(c, b),
  (b, c) => revisar(c, b),
)
const out = Object.fromEntries(normales.map((c, i) => [c.k, res[i]]))

for (const c of integradores) {
  phase('Integrar')
  const previos = Object.entries(out).map(([k, v]) => `${k}: ${v && v.build ? (v.fix && v.fix.hecho ? v.fix : v.build).resumen.slice(0, 600) : 'no terminó'}`).join('\n')
  const b = await agent(`${prompt(c)}\n\nLOS CARRILES DE LA OLA YA TERMINARON. Sus pedidos de alta están en ${SP}/panel/registro/*.json y sus resúmenes:\n${previos}`, { label: `integrar:${c.k}`, phase: 'Integrar', schema: BUILD, agentType: c.tipo })
  out[c.k] = await revisar(c, b)
}

phase('Verificar')
const archivos = [...new Set(Object.values(out).flatMap((v) => (v && v.build ? [...v.build.archivos, ...(v.fix ? v.fix.archivos : [])] : [])))]
const verif = await agent(`${COMUN}\n\nVERIFICACIÓN DE LA OLA ${OLA} (§7.7 del plan), SIN editar código de producto: 1) \`npm run typecheck\` y \`npm run test:guardianes\`; 2) los tests de la ola (panel-sin-perdida, destino-tab, admin-subvistas-sincronizadas, admin-module-standards y los que existan de los carriles); 3) qa-capturas de los enlaces viejos que esta ola movió → caen en su lugar nuevo (1 corrida con pasos que naveguen a cada uno —carga completa con ?tab= y navegación dentro del panel— y midan tab/vista final y el h1), más 1 captura de cada pantalla nueva o fusionada en claro 1280 (mirá vos 2-3 de ellas) y pageerrors = 0; 4) \`rol-probe --todos\` si existe (memoria qa-usuarios-por-rol); 5) medición por vista de lo tocado (scripts/medir-orden-admin.mjs o el de K4 si ya existe) → reports/orden-admin/ola${OLA}.json. Archivos de la ola: ${archivos.join(' ')}. Entregá con StructuredOutput: hecho=true si todo verde; «evidencia» = cada gate con su resultado; «pendientes» = lo rojo con archivo:línea y a qué carril le toca; archivos=[] (no edites), mensajeCommit = "".`, { label: 'verificar', phase: 'Verificar', schema: BUILD })
log(Object.entries(out).map(([k, v]) => `${k}=${v && v.build && v.build.hecho ? (v.review ? String(v.review).trim().split(/\s/)[0] : 'sin revisión') : 'no'}`).join(' ') + ` · verificación=${verif && verif.hecho ? 'verde' : 'con pendientes'}`)
return { carriles: out, verificacion: verif }
