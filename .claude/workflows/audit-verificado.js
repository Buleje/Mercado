export const meta = {
  name: 'audit-verificado',
  description: 'Auditoría multi-dimensión con verificación adversarial de cada hallazgo (anti-inflado)',
  whenToUse: 'Cuando Brandon pide auditar un módulo/área. args = { target: "ruta o área", dimensions?: ["seguridad","bugs","perf","ux","multi-tenant"] }',
  phases: [
    { title: 'Auditar', detail: 'un finder por dimensión, en paralelo' },
    { title: 'Verificar', detail: 'cada hallazgo lo intenta REFUTAR un escéptico con evidencia directa' },
  ],
}

// Patrón codificado de la lección "auditores inflan — trust BUT verify":
// ~7 de 16 hallazgos históricos fueron falsos positivos. Acá ningún hallazgo
// llega al reporte sin sobrevivir a un refutador con evidencia directa.

const target = (args && args.target) || 'el área indicada en la conversación'
const DIMENSIONS = (args && args.dimensions) || ['seguridad (OWASP, IDOR, CSRF, tenant leak)', 'bugs de lógica', 'performance', 'multi-tenant (tenantId, cache keys)', 'UX/typography (reglas bsm)']

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          evidence: { type: 'string', description: 'snippet o comando exacto que demuestra el problema' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'evidence', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    isReal: { type: 'boolean' },
    reason: { type: 'string', description: 'evidencia directa que confirma o refuta' },
  },
  required: ['isReal', 'reason'],
}

const results = await pipeline(
  DIMENSIONS,
  d => agent(
    `Audita ${target} en el repo /home/usuario/proyectos/Mercado buscando SOLO problemas de: ${d}.
Reglas: lee el código real (no asumas), incluye evidencia concreta (snippet + file:line) por hallazgo.
Contexto del proyecto: Next 16 + Prisma 7 multi-tenant (tenantId 1er param, lib/db/*.db.ts única vía a Prisma, no force-dynamic, Zod safeParse). Máximo 8 hallazgos, los más graves.`,
    { label: `audit:${d.split(' ')[0]}`, phase: 'Auditar', schema: FINDINGS_SCHEMA }
  ),
  review => parallel((review.findings || []).map(f => () =>
    agent(
      `Sos un escéptico. Intenta REFUTAR este hallazgo de auditoría con evidencia directa del repo /home/usuario/proyectos/Mercado (lee el archivo real, corre grep preciso, considera rewrites/middleware/wrappers que el auditor pudo no ver).
Hallazgo: ${f.title} en ${f.file}${f.line ? ':' + f.line : ''}
Evidencia del auditor: ${f.evidence}
Historial del proyecto: ~44% de hallazgos de auditores automáticos fueron falsos positivos (applyRateLimit ES síncrono; reviews "mock" eran reales; canonical relativo es válido). Si hay CUALQUIER duda razonable, isReal=false.`,
      { label: `verify:${(f.file || '').split('/').pop()}`, phase: 'Verificar', schema: VERDICT_SCHEMA }
    ).then(v => ({ ...f, verdict: v }))
  ))
)

const all = results.filter(Boolean).flat().filter(Boolean)
const confirmed = all.filter(f => f.verdict && f.verdict.isReal)
const refuted = all.filter(f => !f.verdict || !f.verdict.isReal)

log(`${confirmed.length} confirmados · ${refuted.length} refutados (falsos positivos filtrados)`)

return {
  target,
  confirmados: confirmed.sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low'].indexOf(b.severity)),
  refutados: refuted.map(f => ({ title: f.title, file: f.file, porQue: f.verdict ? f.verdict.reason : 'verificador no respondió' })),
}
