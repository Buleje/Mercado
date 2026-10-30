// Lista blanca de `leer_get` (contrato §3.3). Lo prohibido gana siempre.
// Normaliza ANTES de comparar: %252e%252e evadió un filtro el 23-10 (memoria filtro-rutas-lista-negra-se-evade).

const PERMITIDO = [
  /^\/api\/admin\/(today-summary|inicio|dashboard|overview|ventas-overview|por-cobrar|agenda\/hoy|agenda\/calendario|documents)(\/|$)/,
  /^\/api\/admin\/forestal\/(ctp|gtf|lotes|lotes-aserrio|lotes-mixtos|wood-entries|cubicaciones|cubicaciones-trozas|plantaciones|anexos|distribuciones|reportes-diarios|especies|directorio|fletes|tramites|plan|loth|contratos|salidas-por-registrar|cuenta|operaciones)(\/|$)/,
  /^\/api\/(sales|orders|inventory|inventory-movements|products|purchases|compras|suppliers|customers|fiados|adelantos|rrhh|treasury|cash-registers|daily-report|daily-digest|tasks|notes|search|activity-log|audit-trail|stats)(\/|$)/,
  /^\/api\/cierre-diario\/preview(\/|$)/,
];

const PROHIBIDO = [
  /^\/api\/(auth|admin-users|api-keys|superadmin|cron|sync|backup|backups|debug-tenant-leak|internal|dev|webhooks)(\/|$)/,
  /^\/api\/admin\/(security|export-all|clear-data|seed-data|demo-products|backup|2fa|n8n)(\/|$)/,
];
const SUBCADENAS_PROHIBIDAS = ["/export", "/csv", "/ics", "/purga", "/anular-dia", "/statement-link", "/shares"];
/**
 * 2.ª pasada de seguridad (29-10, MEDIO): `/api/admin/documents/<id>/share` devolvía el token del enlace público.
 * Cualquier SEGMENTO que nombre un enlace para compartir o un token queda afuera: share/shares/share-lote,
 * token(s), link(s), statement-link, enlace(s)/enlace-firma, public/publico, compartir. Medido 29-10 en app/api: son
 * products/share, admin/documents/{share,shares,[id]/share,folders/share-lote,folders/[id]/share}, fiados/statement-link,
 * orders/[id]/public, orders/[id]/tracking/share y adelantos/[id]/enlace-firma; ninguna herramienta del catálogo las usa.
 */
const SEGMENTO_DE_ENLACE = /\/(?:[a-z0-9_-]*(?:share|token|link|enlace)[a-z0-9_-]*|public|publico|compartir|compartidos?)(?=\/|$)/;

const no = (motivo) => ({ ok: false, motivo });

/**
 * Decodifica hasta que no cambie. Si sigue cambiando tras 6 vueltas o falla, se rechaza.
 * @param {string} s
 */
function decodificarHastaEstable(s) {
  let actual = s;
  for (let i = 0; i < 6; i++) {
    let sig;
    try { sig = decodeURIComponent(actual); } catch { return null; }
    if (sig === actual) return actual;
    actual = sig;
  }
  return null;
}

/**
 * Solo el CAMINO (sin query): la query va aparte en `query` y la arma el cliente con searchParams.
 * 29-10 (revisión de seguridad): «/api/sales%3F/../../api/admin/export-all» pasaba porque se cortaba en el «?» ya
 * decodificado y `new URL` del cliente resolvía el «..». Ahora se rechaza todo «?»/«#» (crudo o codificado), se
 * normaliza con `new URL(...).pathname`, la ruta tiene que quedar IGUAL al normalizarla, y lo que se compara contra
 * la lista es exactamente lo que se manda al panel (`ruta` del resultado).
 * @param {string} ruta  ej. "/api/sales" (sin «?»)
 * @returns {{ ok: boolean, motivo: string, ruta?: string }}
 */
export function rutaLecturaPermitida(ruta) {
  if (typeof ruta !== "string" || ruta.length === 0 || ruta.length > 500) return no("ruta vacía o demasiado larga");
  if (/[?#]/.test(ruta)) return no("la ruta va sin «?» ni «#»: pasa los filtros aparte, en `query`");
  // Nada codificado: ninguna ruta de la lista blanca lo necesita (los ids son letras y números) y «%3F», «%2e» o
  // «%65» son justo cómo se evade el filtro (hallazgo 1). Los filtros con tildes o espacios van en `query`.
  if (ruta.includes("%")) return no("la ruta va sin «%» (nada codificado): los valores con tildes o espacios van en `query`");
  const completa = decodificarHastaEstable(ruta);
  if (completa === null) return no("ruta que no se puede normalizar");
  if (/[\x00-\x1f\x7f]/.test(completa)) return no("caracteres de control");
  if (/[?#]/.test(completa)) return no("«?» o «#» escondidos en la ruta");
  if (completa.includes("..")) return no("«..» no permitido");
  if (completa.includes("\\")) return no("barra invertida no permitida");
  if (completa.includes(";")) return no("«;» no permitido");
  if (completa.includes("//")) return no("«//» no permitido");
  if (!/^[A-Za-z0-9_\-./]+$/.test(completa)) return no("la ruta solo lleva letras sin tilde, números, «-», «_», «.» y «/»");
  let normal;
  try { normal = new URL(completa, "http://x").pathname; } catch { return no("ruta que no se puede normalizar"); }
  if (normal !== completa) return no("la ruta cambia al normalizarla («/./», «..» o similar)");
  if (!normal.startsWith("/api/")) return no("solo rutas /api/");
  const bajo = normal.toLowerCase();
  if (PROHIBIDO.some((r) => r.test(bajo))) return no("ruta prohibida (auth, usuarios, claves, backups, cron, sync…)");
  const sub = SUBCADENAS_PROHIBIDAS.find((s) => bajo.includes(s));
  if (sub) return no(`ruta prohibida (contiene ${sub})`);
  const enlace = SEGMENTO_DE_ENLACE.exec(bajo);
  if (enlace) return no(`ruta prohibida: «${enlace[0]}» es un enlace para compartir o un token (devolvería el acceso público)`);
  // Lo permitido se compara con la ruta tal cual (mayúsculas incluidas): /api/SALES no es /api/sales.
  if (!PERMITIDO.some((r) => r.test(normal))) return no("ruta fuera de la lista blanca de lectura");
  return { ok: true, motivo: "ok", ruta: normal };
}
