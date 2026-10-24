/**
 * Aviso de vencimientos de las carpetas Esenciales (Brandon 23-10): lo que
 * vence en tus carpetas esenciales te llega a la campana. Puro y sin
 * `server-only`: lo usa el cron `esenciales-avisos` y su test.
 *
 * Un aviso por carpeta esencial (con los papeles de sus subcarpetas). La etapa
 * va en el `entityId` (`<carpeta>:<etapa>`): lo leído no vuelve hasta la etapa
 * siguiente y lo resuelto queda leído (`sincronizarAvisos`).
 */
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";
import { textoCuando } from "./aviso-vencimiento";
import { esEsencial } from "./esenciales";
import { conSubcarpetas } from "./terceros-vinculo";

export const TIPO_AVISO_ESENCIALES = "DOC_ESENCIAL_VENCE";

/** Días de anticipación del primer aviso. */
export const DIAS_AVISO_ESENCIALES = 30;

export type EtapaEsencial = "vencido" | "7" | "30";

export interface CarpetaAviso {
  id: string;
  name: string;
  parentId: string | null;
  tags?: string[];
  allowedRoles?: string[];
}
export interface DocAviso {
  id: string;
  folderId: string | null;
  name: string;
  expiresAt?: string | Date | null;
  deletedAt?: string | Date | null;
}

/** Mismo shape que `AvisoConClave` (notification-center.db es server-only). */
export interface AvisoEsencial {
  type: string;
  severity: "HIGH" | "MEDIUM";
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  entityId: string;
}

const DIA = 86_400_000;
const ORDEN: Record<EtapaEsencial, number> = { vencido: 0, "7": 1, "30": 2 };

const etapaDe = (dias: number): EtapaEsencial | null =>
  dias < 0 ? "vencido" : dias <= 7 ? "7" : dias <= DIAS_AVISO_ESENCIALES ? "30" : null;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function avisosDeEsenciales(args: {
  carpetas: readonly CarpetaAviso[];
  docs: readonly DocAviso[];
  hoy: Date;
}): AvisoEsencial[] {
  const { carpetas, docs, hoy } = args;
  const porId = new Map(carpetas.map((c) => [c.id, c]));
  const conCandado = (id: string): boolean => {
    const visto = new Set<string>();
    for (let c = porId.get(id); c && !visto.has(c.id); c = c.parentId ? porId.get(c.parentId) : undefined) {
      visto.add(c.id);
      if ((c.allowedRoles ?? []).includes(ROL_CANDADO_DUENO)) return true;
    }
    return false;
  };

  const vivos = docs.flatMap((d) => {
    if (d.deletedAt || !d.expiresAt || !d.folderId) return [];
    const t = new Date(d.expiresAt).getTime();
    if (Number.isNaN(t)) return [];
    const dias = Math.ceil((t - hoy.getTime()) / DIA);
    const etapa = etapaDe(dias);
    return etapa ? [{ doc: d, dias, etapa, folderId: d.folderId }] : [];
  });

  const avisos: AvisoEsencial[] = [];
  for (const raiz of carpetas.filter(esEsencial)) {
    const ids = conSubcarpetas([raiz.id], carpetas);
    const suyos = vivos.filter((v) => ids.has(v.folderId)).sort((a, b) => a.dias - b.dias);
    if (suyos.length === 0) continue;
    const etapa = suyos[0].etapa;
    const vencidos = suyos.filter((v) => v.etapa === "vencido").length;
    const url = `/admin?tab=documentos&vista=esenciales&esencial=${raiz.id}`;
    const severity = ORDEN[etapa] <= 1 ? "HIGH" : "MEDIUM";
    const base = { type: TIPO_AVISO_ESENCIALES, severity, actionUrl: url, actionLabel: "Ver carpeta" } as const;
    const entityId = `${raiz.id}:${etapa}`;

    if (conCandado(raiz.id)) {
      avisos.push({
        ...base,
        title: "Esenciales: una carpeta con candado tiene papeles por vencer",
        body: "Entra con tu cuenta de dueño para verla.",
        entityId,
      });
      continue;
    }
    // Lo vencido se nombra aparte: «2 papeles por vencer» escondía que uno ya venció.
    const porVencer = suyos.length - vencidos;
    const resumen =
      vencidos === 0
        ? plural(porVencer, "papel por vencer", "papeles por vencer")
        : porVencer === 0
          ? plural(vencidos, "vencido", "vencidos")
          : `${plural(vencidos, "vencido", "vencidos")} y ${porVencer} por vencer`;
    const primero = suyos[0];
    const resto = suyos.length - 1;
    avisos.push({
      ...base,
      title: `Esenciales · «${raiz.name}»: ${resumen}`.slice(0, 200),
      body: `${primero.doc.name} ${textoCuando(primero.dias)}${resto > 0 ? ` y ${resto} más` : ""}.`,
      entityId,
    });
  }
  return avisos;
}
