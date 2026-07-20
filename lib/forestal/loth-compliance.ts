/**
 * loth-compliance — score + chequeos de cumplimiento del Libro TH (ADR-305).
 *
 * Gemelo de `ctp-compliance.ts` para el LO-TH. Traduce las anomalías que ya
 * calcula `detectAnomalias` (`loth-constants.ts`, servidas por
 * `/api/admin/forestal/plan?analytics=1`) + el estado de la carátula a un
 * veredicto de "¿el libro resiste una fiscalización de OSINFOR ahora?".
 *
 * PURO y sin deps (client+server safe): NO importar `lib/db/*` ni componentes.
 * Que el panel y el reporte imprimible consuman ESTE archivo garantiza que nunca
 * muestren números distintos del mismo hecho (la lección del fuera-de-plazo).
 *
 * Filosofía heredada del CTP:
 *  - CITES NO resta (es legal con permiso; un score que castiga lo incorregible
 *    enseña a ignorarlo). Se recuerda, no se penaliza.
 *  - Los "bloqueos" (chequeos error activos) impiden dar por bueno el libro; las
 *    advertencias no bloquean pero conviene mirarlas.
 */

export type LothComplianceTone = "success" | "warning" | "error";
export type LothNavTarget = "analitica" | "secciones" | "plan" | "caratula";
export type LothSeverity = "error" | "warning";

/** Una anomalía tal como la devuelve `detectAnomalias`. */
export interface LothAnomaly {
  level: "error" | "warn";
  code: string;
  message: string;
  species?: string;
}

export interface LothComplianceInput {
  anomalias: LothAnomaly[];
  caratula: { titularName?: string | null; tituloHabilitante?: string | null; resolucionNumber?: string | null } | null;
  /** Total de líneas registradas en el libro (para el subtítulo del panel/reporte). */
  totalLineas: number;
  /** Especies CITES del libro SIN permiso en el catálogo (informativo, NO resta score). */
  citesSinPermiso?: string[];
}

export interface LothCheck {
  key: string;
  count: number;
  severity: LothSeverity;
  /** Puntos que resta este chequeo cuando está activo (count>0). */
  penalty: number;
  title: string;
  okTitle: string;
  description: string;
  action: string;
  navTarget: LothNavTarget;
  navigateLabel: string;
}

export interface LothComplianceResult {
  score: number;
  tone: LothComplianceTone;
  checks: LothCheck[];
  problemas: LothCheck[];
  enOrden: LothCheck[];
  bloqueos: number;
  advertencias: number;
  readiness: "ready" | "warning" | "error";
  breakdown: { key: string; label: string; puntos: number; casos: number }[];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Lista los primeros N nombres y resume el resto ("A, B y 3 más"). */
function listar(items: string[], max = 3): string {
  if (items.length === 0) return "";
  const head = items.slice(0, max).join(", ");
  return items.length > max ? `${head} y ${items.length - max} más` : head;
}

export function computeLothCompliance(input: LothComplianceInput): LothComplianceResult {
  const byCode = (code: string) => input.anomalias.filter((a) => a.code === code);
  const speciesOf = (code: string) => byCode(code).map((a) => a.species).filter((s): s is string => !!s);

  const exceso = byCode("exceso_autorizado");
  const trozadoTala = byCode("trozado_gt_talado");
  const rendAserrio = byCode("rend_aserrio_imposible");
  const trozaFantasma = byCode("troza_fantasma");
  const saldoBajo = byCode("saldo_bajo");
  const fueraPlazo = byCode("fuera_de_plazo");

  const caratulaIncompleta =
    !input.caratula || !input.caratula.titularName?.trim() || !input.caratula.tituloHabilitante?.trim();

  const citesSinPermiso = input.citesSinPermiso ?? [];

  const checks: LothCheck[] = [
    {
      key: "caratula",
      count: caratulaIncompleta ? 1 : 0,
      severity: "error",
      penalty: 15,
      title: "Carátula del libro incompleta",
      okTitle: "Carátula del libro configurada",
      description:
        "Un libro sin titular ni título habilitante no identifica de qué autorización sale la madera ante OSINFOR.",
      action: "Completá titular + título habilitante en 'Configurar carátula'.",
      navTarget: "caratula",
      navigateLabel: "Configurar carátula",
    },
    {
      key: "exceso",
      count: exceso.length,
      severity: "error",
      penalty: 40,
      title: `${exceso.length} ${plural(exceso.length, "especie supera", "especies superan")} el volumen autorizado`,
      okTitle: "Aprovechamiento dentro de lo autorizado",
      description:
        exceso.length > 0
          ? `Movilizar más de lo autorizado por el POA es la infracción que sanciona OSINFOR: ${listar(speciesOf("exceso_autorizado"))}.`
          : "Ninguna especie movilizó más de su volumen autorizado.",
      action: "Revisá el Balance por especie y frená la movilización de la especie excedida.",
      navTarget: "analitica",
      navigateLabel: "Ver analítica",
    },
    {
      key: "rendAserrio",
      count: rendAserrio.length,
      severity: "error",
      penalty: 20,
      title: "Rendimiento del aserrío imposible",
      okTitle: "Rendimiento del aserrío coherente",
      description:
        rendAserrio.length > 0
          ? "Se despachó más producto (m³) del que entró como materia prima consumida — rendimiento >100%."
          : "El producto despachado no supera la materia prima consumida.",
      action: "Verificá cantidades de consumo vs. despacho de producto.",
      navTarget: "analitica",
      navigateLabel: "Ver analítica",
    },
    {
      key: "trozadoTala",
      count: trozadoTala.length,
      severity: "error",
      penalty: 20,
      title: `${trozadoTala.length} ${plural(trozadoTala.length, "especie con trozado", "especies con trozado")} mayor a lo talado`,
      okTitle: "Trozado consistente con lo talado",
      description:
        trozadoTala.length > 0
          ? `Imposible físicamente (no se troza más de lo tumbado) — revisá la captura: ${listar(speciesOf("trozado_gt_talado"))}.`
          : "Ninguna especie trozó más volumen del que se taló.",
      action: "Revisá los volúmenes de Tala vs. Trozado de esas especies.",
      navTarget: "secciones",
      navigateLabel: "Ver secciones",
    },
    {
      key: "plazo",
      count: fueraPlazo.length,
      severity: "warning",
      penalty: 10,
      title: "Líneas registradas fuera de plazo",
      okTitle: "Registro dentro del plazo",
      description:
        fueraPlazo.length > 0
          ? fueraPlazo[0].message
          : "Todas las líneas se registraron dentro del plazo SERFOR.",
      action: "Registrá las operaciones apenas ocurren para no acumular atraso.",
      navTarget: "secciones",
      navigateLabel: "Ver secciones",
    },
    {
      key: "trozaFantasma",
      count: trozaFantasma.length,
      severity: "warning",
      penalty: 10,
      title: `${trozaFantasma.length} ${plural(trozaFantasma.length, "troza despachada", "trozas despachadas")} sin trozado previo`,
      okTitle: "Toda troza despachada tiene su trozado",
      description:
        trozaFantasma.length > 0
          ? "Una troza que se movilizó sin figurar en Trozado corta la cadena de custodia."
          : "Cada troza movilizada figura registrada en Trozado.",
      action: "Registrá el trozado de esas trozas o corregí el código.",
      navTarget: "secciones",
      navigateLabel: "Ver secciones",
    },
    {
      key: "saldoBajo",
      count: saldoBajo.length,
      severity: "warning",
      penalty: 5,
      title: `${saldoBajo.length} ${plural(saldoBajo.length, "especie con saldo bajo", "especies con saldo bajo")}`,
      okTitle: "Saldos de aprovechamiento holgados",
      description:
        saldoBajo.length > 0
          ? `Queda menos del 10% del volumen autorizado: ${listar(speciesOf("saldo_bajo"))}.`
          : "Ninguna especie está por agotar su saldo autorizado.",
      action: "Planificá el cierre del aprovechamiento de esas especies.",
      navTarget: "analitica",
      navigateLabel: "Ver analítica",
    },
    {
      // CITES es LEGAL con permiso archivado → recordatorio, NUNCA resta score
      // (un score que castiga lo incorregible enseña a ignorarlo — regla del CTP).
      key: "cites",
      count: citesSinPermiso.length,
      severity: "warning",
      penalty: 0,
      title: `${citesSinPermiso.length} ${plural(citesSinPermiso.length, "especie CITES sin permiso", "especies CITES sin permiso")} cargado`,
      okTitle: "Especies CITES con su permiso cargado",
      description:
        citesSinPermiso.length > 0
          ? `Especies protegidas en el libro sin permiso en el catálogo: ${listar(citesSinPermiso)}. Es legal con permiso archivado — cargalo para acreditarlo ante OSINFOR.`
          : "Cada especie CITES del libro tiene su permiso cargado (o no hay CITES).",
      action: "Cargá el N° de permiso en Configurar carátula → Permisos CITES.",
      navTarget: "caratula",
      navigateLabel: "Configurar carátula",
    },
  ];

  const problemas = checks
    .filter((c) => c.count > 0)
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const enOrden = checks.filter((c) => c.count <= 0);
  const bloqueos = problemas.filter((c) => c.severity === "error").length;
  const advertencias = problemas.filter((c) => c.severity === "warning").length;

  const totalRestado = problemas.reduce((a, c) => a + c.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - totalRestado));
  const tone: LothComplianceTone = bloqueos > 0 ? "error" : advertencias > 0 ? "warning" : "success";
  const readiness = bloqueos > 0 ? "error" : advertencias > 0 ? "warning" : "ready";

  const breakdown = checks
    .filter((c) => c.penalty > 0)
    .map((c) => ({ key: c.key, label: c.okTitle, puntos: c.count > 0 ? c.penalty : 0, casos: c.count }));

  return { score, tone, checks, problemas, enOrden, bloqueos, advertencias, readiness, breakdown };
}
