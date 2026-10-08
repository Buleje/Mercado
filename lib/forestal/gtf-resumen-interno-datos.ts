/**
 * gtf-resumen-interno-datos — de las APIs del libro a la entrada del «Resumen
 * interno» de una GTF (`gtf-resumen-interno`). Lee sólo lo que ya publican:
 *
 *   · `/api/admin/forestal/loth?section=despacho_troza|despacho_producto&planId=…&solo=1`
 *     → las líneas de Despacho del permiso, cada troza con la medida de su
 *       Trozado (`trozado`, whitelist del servidor). De ahí salen las de ESTA
 *       guía (R2, R3) y el orden para el saldo (R4).
 *   · `/api/admin/forestal/plan?balance=<planId>` → el autorizado (R4).
 *   · `/api/admin/forestal/loth/aserradero?ids=<trozados>` → qué pasó en el
 *     Libro CTP con cada troza (R3).
 *
 * Un pedido que falla no tumba la hoja: su parte sale «sin dato» y se dice en
 * `avisos`. Las funciones de mapeo son puras (las prueba
 * `forestal-gtf-resumen-interno.test.ts`); `leerResumenInterno` es la única
 * que hace `fetch`.
 */

import { leerGtfDatos } from "./ctp-gtf-datos";
import { mismoNumeroGtf } from "./gtf-talonario";
import { piezasDeItems } from "./loth-guia-despacho";
import { fichaDeGuiaImportada } from "./loth-importar-guia-ficha";
import type { LothEntryDTO } from "./loth-constants";
import { MAX_IDS_ASERRADERO, type PiezaCtp, type RespuestaAserradero } from "./loth-trace-aserradero";
import type { EntradaResumenInterno, LineaDelResumen, PasoCtp, PiezaDelResumen } from "./gtf-resumen-interno";

/** Lo que el resumen lee de la guía (la forma de `/api/admin/forestal/gtf`). */
export interface GuiaParaResumen {
  id: string;
  gtfNumber: string;
  gtfDate: string | null;
  planId?: string | null;
  items: unknown;
  volumenTotalM3: string | number | null;
  piezasTotal: number | null;
  gtfDatos?: unknown;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Las trozas de la lista de la guía, con sus dos códigos. */
export function piezasDelResumen(items: unknown): PiezaDelResumen[] {
  return piezasDeItems(items).map((p) => ({
    codigo: p.codigo,
    codigoGuia: p.codigoGuia ?? null,
    arbol: p.arbol,
    especie: p.comun,
    d1M: p.diamMayorM,
    d2M: p.diamMenorM,
    largoM: p.lengthM,
    m3: p.volumeM3,
  }));
}

/** Una línea de Despacho de la API: los m³ de la troza son los de su Trozado. */
export function lineaDelResumen(e: Pick<LothEntryDTO, "gtfNumber" | "entryDate" | "trozaCode" | "volumeM3" | "quantity" | "unit" | "section" | "treeCode" | "trozado">): LineaDelResumen {
  const m3 =
    e.section === "despacho_producto"
      ? e.unit === "m3"
        ? num(e.quantity)
        : null
      : num(e.trozado?.volumeM3) ?? num(e.volumeM3);
  return {
    gtfNumber: e.gtfNumber,
    dia: (e.entryDate ?? "").slice(0, 10),
    trozaCode: e.trozaCode,
    m3,
    arbol: e.trozado?.treeCode ?? e.treeCode ?? null,
    trozadoId: e.trozado?.lineaId ?? null,
  };
}

export type Declarado = Pick<EntradaResumenInterno["guia"], "declaradoM3" | "declaradoTrozas" | "fuenteDeclarado">;

/** Lo que DECLARA la guía: la ficha de SERFOR si se importó; si no, su registro. */
export function declaradoDeLaGuia(g: Pick<GuiaParaResumen, "gtfDatos" | "volumenTotalM3" | "piezasTotal">): Declarado {
  const leida = fichaDeGuiaImportada(g.gtfDatos);
  if (leida) {
    const f = leida.ficha;
    const prods = f.productos ?? [];
    const sumaVol = prods.reduce((a, p) => a + (p.volumen ?? 0), 0);
    const sumaCant = prods.reduce((a, p) => a + (p.cantidad ?? 0), 0);
    return {
      declaradoM3: f.volumenTotal ?? (prods.length ? sumaVol : num(g.volumenTotalM3)),
      declaradoTrozas: prods.length && prods.every((p) => p.cantidad != null) ? sumaCant : g.piezasTotal,
      fuenteDeclarado: "serfor",
    };
  }
  return { declaradoM3: num(g.volumenTotalM3), declaradoTrozas: g.piezasTotal, fuenteDeclarado: "registro" };
}

/** Las piezas del CTP por id de Trozado, en la forma del resumen. */
export function pasosCtp(piezas: readonly PiezaCtp[]): Map<string, PasoCtp[]> {
  const out = new Map<string, PasoCtp[]>();
  for (const p of piezas) {
    const xs = out.get(p.trozadoId) ?? [];
    xs.push({ recibida: p.llegada?.dia ?? null, aserrada: p.corrida?.dia ?? null, salioEntera: p.despacho?.dia ?? null });
    out.set(p.trozadoId, xs);
  }
  return out;
}

/** El permiso de la guía: el suyo; si no tiene, el ÚNICO de sus líneas del libro. */
export function permisoDeLaGuia(planId: string | null | undefined, lineas: readonly Pick<LothEntryDTO, "planId">[]): string | null {
  if (planId) return planId;
  const planes = new Set(lineas.map((l) => l.planId ?? null).filter((p): p is string => Boolean(p)));
  return planes.size === 1 ? [...planes][0] : null;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

const PAGINA = 500;
const TOPE_PAGINAS = 10;

async function pedirJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { credentials: "include", signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Todas las líneas vivas de una sección (paginadas de a 500, el tope del servidor). */
async function lineas(section: string, filtro: string, signal?: AbortSignal): Promise<LothEntryDTO[]> {
  const out: LothEntryDTO[] = [];
  for (let i = 0; i < TOPE_PAGINAS; i++) {
    const j = await pedirJson<{ entries?: LothEntryDTO[]; total?: number }>(
      `/api/admin/forestal/loth?section=${section}&limit=${PAGINA}&offset=${i * PAGINA}${filtro}`,
      signal,
    );
    const xs = j.entries ?? [];
    out.push(...xs);
    if (xs.length < PAGINA || (j.total != null && out.length >= j.total)) break;
  }
  return out.filter((e) => e.status === "registrado");
}

export interface DatosResumenInterno {
  entrada: EntradaResumenInterno;
  /** Id de una línea de Despacho de trozas de ESTA guía: con él abre `/verificar/guia/<id>` (el QR de la hoja). */
  lineaDespachoId: string | null;
  planId: string | null;
  avisos: string[];
}

export async function leerResumenInterno(g: GuiaParaResumen, signal?: AbortSignal): Promise<DatosResumenInterno> {
  const avisos: string[] = [];
  const delNumero = (e: LothEntryDTO) => mismoNumeroGtf(e.gtfNumber, g.gtfNumber);

  /* 1 · Sus líneas: por el permiso si lo tiene; si no, buscando su N° en el libro entero. */
  let delPermiso: LothEntryDTO[] | null = null;
  let propias: LothEntryDTO[] = [];
  try {
    if (g.planId) {
      const filtro = `&planId=${encodeURIComponent(g.planId)}&solo=1`;
      const [tr, pr] = await Promise.all([lineas("despacho_troza", filtro, signal), lineas("despacho_producto", filtro, signal)]);
      delPermiso = [...tr, ...pr];
      propias = delPermiso.filter(delNumero);
    } else {
      propias = (await lineas("despacho_troza", `&search=${encodeURIComponent(g.gtfNumber)}`, signal)).filter(delNumero);
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    avisos.push("No se pudo leer el Despacho del libro: el cuadre y el saldo salen sin el libro.");
  }

  const planId = permisoDeLaGuia(g.planId, propias);
  /* Guía sin permiso propio: su permiso es el de sus líneas (y de ahí, sus vecinas). */
  if (planId && !delPermiso) {
    try {
      const filtro = `&planId=${encodeURIComponent(planId)}&solo=1`;
      const [tr, pr] = await Promise.all([lineas("despacho_troza", filtro, signal), lineas("despacho_producto", filtro, signal)]);
      delPermiso = [...tr, ...pr];
    } catch (err) {
      if (signal?.aborted) throw err;
      avisos.push("No se pudo leer el Despacho del permiso: el saldo sale sin dato.");
    }
  }

  /* 2 · El autorizado y 3 · el Libro CTP, en paralelo. */
  const trozados = [...new Set(propias.map((e) => e.trozado?.lineaId).filter((x): x is string => Boolean(x)))];
  const [autorizadoM3, ctp] = await Promise.all([
    planId
      ? pedirJson<{ balance?: { rows?: { autorizado?: number }[] } }>(`/api/admin/forestal/plan?balance=${encodeURIComponent(planId)}&solo=1`, signal)
          .then((j) => (j.balance?.rows ?? []).reduce((a, r) => a + (Number(r.autorizado) || 0), 0))
          .catch((err: unknown) => {
            if (signal?.aborted) throw err;
            avisos.push("No se pudo leer el autorizado del permiso.");
            return null;
          })
      : Promise.resolve(null),
    (async (): Promise<Map<string, PasoCtp[]> | null> => {
      if (trozados.length === 0) return new Map();
      try {
        const piezas: PiezaCtp[] = [];
        for (let i = 0; i < trozados.length; i += MAX_IDS_ASERRADERO) {
          const r = await fetch(`/api/admin/forestal/loth/aserradero?ids=${encodeURIComponent(trozados.slice(i, i + MAX_IDS_ASERRADERO).join(","))}`, {
            credentials: "include",
            signal,
          });
          if (r.status === 403) return null;
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = (await r.json()) as RespuestaAserradero;
          if (!j.ctp) return null;
          piezas.push(...j.piezas);
        }
        return pasosCtp(piezas);
      } catch (err) {
        if (signal?.aborted) throw err;
        avisos.push("No se pudo preguntar al Libro CTP dónde están las trozas.");
        return null;
      }
    })(),
  ]);

  return {
    planId,
    lineaDespachoId: propias.find((e) => e.section === "despacho_troza")?.id ?? null,
    avisos,
    entrada: {
      guia: { gtfNumber: g.gtfNumber, gtfDate: g.gtfDate ? g.gtfDate.slice(0, 10) : null, ...declaradoDeLaGuia(g) },
      piezas: piezasDelResumen(g.items),
      lineasDeLaGuia: propias.map(lineaDelResumen),
      lineasDelPermiso: delPermiso ? delPermiso.map(lineaDelResumen) : null,
      autorizadoM3,
      ctp,
    },
  };
}

/** El N° de la Lista de trozas que guardó la guía (35), o `null`. */
export function listaTrozasDeLaGuia(gtfDatos: unknown): string | null {
  if (gtfDatos == null) return null;
  return leerGtfDatos(gtfDatos).guia.listaTrozasNro.trim() || null;
}
