/**
 * reparto-oficial — el volumen OFICIAL de cada pedazo de la distribución de
 * rolliza (Brandon 2026-10-03: «Resúmenes en tablas, la tabla por especie, los
 * bloques y el Anexo 04 por permiso: todo el volumen tiene que cuadrar el mismo
 * volumen; de ahí se sacan los tres primeros decimales»).
 *
 * Cada PERMISO suma lo suyo (Brandon 2026-10-03, «cada permiso suma lo suyo»):
 * la fila de su GTF (especie × tipo) es la Σ de SUS líneas redondeada UNA vez a
 * 3 decimales HALF_UP —la misma regla que la GTF y que ya está en SERFOR—, y se
 * reparte en milésimos ENTEROS entre sus bloques, jornadas, grupos y medidas
 * por mayor resto. Lo que falta por distribuir redondea igual, por especie ×
 * tipo. Así:
 *
 *   Σ bloques = Distribuido = Σ Anexos 04 por permiso,
 *   Σ medidas de un bloque = lo que usa el bloque,
 *   Distribuido + Falta = el volumen del lote = las tablas de Resúmenes,
 *
 * porque las tablas toman estas mismas filas (`porFila`: Σ por permiso +
 * falta) en vez de redondear el lote entero (Brandon 2026-10-03: Tablas decía
 * 13,191 y la Distribución 13,188; el real es el de la guía).
 *
 * El motor del reparto (`cubicacion-reparto.ts`) no cambia: decide QUÉ piezas
 * van a cada bloque; esto sólo dice cuántos m³ oficiales lleva cada pedazo.
 *
 * PURO y client-safe.
 */

import { ORDEN_TIPO, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";
import type { AsignacionMedida, Distribucion } from "./cubicacion-reparto";
import type { Unidad } from "./cubicacion";
import { filaGtf, m3DeLinea, repartirFilasGTF, type ParteGTF } from "./gtf-redondeo";

const normal = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** El tipo comercial del grupo: su rótulo si el reparto agrupa por tipo; si no, lo dice la medida. */
function tipoDe(label: string, m: AsignacionMedida): string {
  if ((ORDEN_TIPO as readonly string[]).includes(label)) return label;
  return tipoDePieza({
    espesor: m.espesor, ancho: m.ancho, largo: m.largo,
    uEspesor: m.uEspesor as Unidad, uAncho: m.uAncho as Unidad, uLargo: m.uLargo as Unidad,
  }) as TipoComercial;
}

const exactoDe = (m: AsignacionMedida) =>
  m3DeLinea({
    cantidad: m.piezas, espesor: m.espesor, ancho: m.ancho, largo: m.largo,
    uEspesor: m.uEspesor as Unidad, uAncho: m.uAncho as Unidad, uLargo: m.uLargo as Unidad, m3: m.m3, pieTablar: m.pieTablar,
  });

/** La medida como la une el Anexo por permiso (`unificarPorMedida`): dimensiones con su unidad. */
export const claveMedidaOficial = (m: Pick<AsignacionMedida, "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo">) =>
  [m.espesor, m.uEspesor, m.ancho, m.uAncho, m.largo, m.uLargo].join("|");

/** Fila del resumen del Anexo por permiso: especie × tipo (sin mayúsculas). */
export const claveFilaAnexo = (especie: string | null | undefined, tipo: string | null | undefined) =>
  `${normal(especie) || "sin especie"}|${normal(tipo) || "sin tipo"}`;

export interface RepartoOficial {
  /**
   * El volumen del lote = Distribuido + Falta: cada fila especie × tipo es la
   * suma de lo que redondeó cada permiso (como su guía) y la falta. Las tablas
   * de Resúmenes usan estas mismas filas (`porFila`), así todo dice lo mismo.
   */
  total: number;
  /** Σ de los Anexos 04 por permiso (cada permiso con sus filas redondeadas). */
  distribuido: number;
  falta: number;
  /** El m³ oficial de cada fila del lote (`filaGtf(especie, tipo)`): Σ por permiso + falta. */
  porFila: Map<string, number>;
  porBloque: Map<string, number>;
  /** `${bloqueId}|${dia}|${grupo}|${medida}` — la fila del PDF/Excel. */
  porBloqueDiaGrupoMedida: Map<string, number>;
  /** `${bloqueId}|${grupo}` */
  porBloqueGrupo: Map<string, number>;
  /** `${bloqueId}|${grupo}|${medida}` (todas las jornadas juntas). */
  porBloqueMedida: Map<string, number>;
  /** Permiso del bloque, recortado ("" = sin permiso). */
  porPermiso: Map<string, number>;
  /** `${permiso}␟${claveFilaAnexo}` */
  porPermisoFila: Map<string, number>;
  /** `${permiso}␟${claveFilaAnexo}␟${claveMedidaOficial}` */
  porPermisoMedida: Map<string, number>;
  /** Lo amparado por especie (Σ de sus bloques). */
  porEspecie: Map<string, number>;
  /** `${especie}|${grupo}` */
  porFaltaGrupo: Map<string, number>;
  /** `${especie}|${grupo}|${medida}` */
  porFaltaMedida: Map<string, number>;
}

const S = "␟";
const suma = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.round(((m.get(k) ?? 0) + v) * 1000) / 1000);

export function repartoOficial(dist: Distribucion): RepartoOficial {
  type Meta = { tipo: "b"; bloque: string; dia: number; grupo: string; medida: string; permiso: string; especie: string; fila: string; m: AsignacionMedida }
    | { tipo: "f"; especie: string; grupo: string; medida: string };
  const partes: ParteGTF[] = [];
  const metas = new Map<string, Meta>();

  for (const e of dist.especies) {
    for (const b of e.bloques) {
      const permiso = (b.bloque.permiso ?? "").trim();
      const dias = b.porDia.length > 0 ? b.porDia : [{ dia: 1, grupos: b.asignado }];
      for (const d of dias) {
        for (const g of d.grupos) {
          for (const m of g.medidas) {
            if (!(m.piezas > 0)) continue;
            const tipo = tipoDe(g.label, m);
            const parte = `b${S}${b.bloque.id}${S}${d.dia}${S}${g.clave}${S}${m.clave}`;
            partes.push({ fila: `${permiso}${S}${filaGtf(e.especie, tipo)}`, parte, exacto: exactoDe(m) });
            metas.set(parte, { tipo: "b", bloque: b.bloque.id, dia: d.dia, grupo: g.clave, medida: m.clave, permiso, especie: e.especie, fila: claveFilaAnexo(e.especie, g.label), m });
          }
        }
      }
    }
    for (const f of e.faltante) {
      for (const m of f.medidas) {
        if (!(m.piezas > 0)) continue;
        const parte = `f${S}${e.especie}${S}${f.clave}${S}${m.clave}`;
        partes.push({ fila: `falta${S}${filaGtf(e.especie, tipoDe(f.label, m))}`, parte, exacto: exactoDe(m) });
        metas.set(parte, { tipo: "f", especie: e.especie, grupo: f.clave, medida: m.clave });
      }
    }
  }

  const r = repartirFilasGTF(partes);
  const out: RepartoOficial = {
    total: r.total,
    distribuido: 0,
    falta: 0,
    porFila: new Map(),
    porBloque: new Map(),
    porBloqueDiaGrupoMedida: new Map(),
    porBloqueGrupo: new Map(),
    porBloqueMedida: new Map(),
    porPermiso: new Map(),
    porPermisoFila: new Map(),
    porPermisoMedida: new Map(),
    porEspecie: new Map(),
    porFaltaGrupo: new Map(),
    porFaltaMedida: new Map(),
  };
  let distribuido = 0;
  let falta = 0;
  for (const [parte, v] of r.porParte) {
    const meta = metas.get(parte);
    if (!meta) continue;
    if (meta.tipo === "b") {
      distribuido += v;
      suma(out.porBloque, meta.bloque, v);
      suma(out.porBloqueDiaGrupoMedida, `${meta.bloque}|${meta.dia}|${meta.grupo}|${meta.medida}`, v);
      suma(out.porBloqueGrupo, `${meta.bloque}|${meta.grupo}`, v);
      suma(out.porBloqueMedida, `${meta.bloque}|${meta.grupo}|${meta.medida}`, v);
      suma(out.porPermiso, meta.permiso, v);
      suma(out.porPermisoFila, `${meta.permiso}${S}${meta.fila}`, v);
      suma(out.porPermisoMedida, `${meta.permiso}${S}${meta.fila}${S}${claveMedidaOficial(meta.m)}`, v);
      suma(out.porEspecie, meta.especie, v);
    } else {
      falta += v;
      suma(out.porFaltaGrupo, `${meta.especie}|${meta.grupo}`, v);
      suma(out.porFaltaMedida, `${meta.especie}|${meta.grupo}|${meta.medida}`, v);
    }
  }
  out.distribuido = Math.round(distribuido * 1000) / 1000;
  out.falta = Math.round(falta * 1000) / 1000;
  /* Cada clave de `r.porFila` es `${permiso}␟${fila}` o `falta␟${fila}`: la
     fila del lote es la suma de sus pedazos (milésimos enteros). */
  for (const [k, v] of r.porFila) suma(out.porFila, k.slice(k.indexOf(S) + 1), v);
  return out;
}

/** El separador de las claves con permiso (`porPermisoFila`, `porPermisoMedida`). */
export const SEP_OFICIAL = S;

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * La misma distribución con cada volumen cambiado por su valor OFICIAL: lo que
 * usa cada bloque, cada grupo, cada medida y cada jornada, lo amparado y lo que
 * falta por especie, y los totales. Es la que se DIBUJA y se EXPORTA; las
 * cuentas del motor (capacidad, qué pieza va a qué bloque) siguen con la
 * original. Así la pantalla, el PDF, el Excel y el Anexo 04 dicen lo mismo.
 */
export function distConVolumenOficial(dist: Distribucion, of: RepartoOficial = repartoOficial(dist)): Distribucion {
  const especies = dist.especies.map((e) => {
    const bloques = e.bloques.map((b) => {
      const usadoM3 = of.porBloque.get(b.bloque.id) ?? 0;
      const asignado = b.asignado.map((g) => ({
        ...g,
        m3: g.m3Declarado ? g.m3 : (of.porBloqueGrupo.get(`${b.bloque.id}|${g.clave}`) ?? 0),
        medidas: g.medidas.map((m) => ({ ...m, m3: of.porBloqueMedida.get(`${b.bloque.id}|${g.clave}|${m.clave}`) ?? 0 })),
      }));
      const porDia = b.porDia.map((d) => {
        const grupos = d.grupos.map((g) => {
          const medidas = g.medidas.map((m) => ({ ...m, m3: of.porBloqueDiaGrupoMedida.get(`${b.bloque.id}|${d.dia}|${g.clave}|${m.clave}`) ?? 0 }));
          return { ...g, m3: Math.round(medidas.reduce((a, m) => a + m.m3, 0) * 1000) / 1000, medidas };
        });
        return { ...d, m3: Math.round(grupos.reduce((a, g) => a + g.m3, 0) * 1000) / 1000, grupos };
      });
      return { ...b, usadoM3, libreM3: r4(Math.max(0, b.capacidadM3 - usadoM3)), asignado, porDia };
    });
    const faltante = e.faltante.map((f) => ({
      ...f,
      m3: of.porFaltaGrupo.get(`${e.especie}|${f.clave}`) ?? 0,
      medidas: f.medidas.map((m) => ({ ...m, m3: of.porFaltaMedida.get(`${e.especie}|${f.clave}|${m.clave}`) ?? 0 })),
    }));
    const amparadaM3 = of.porEspecie.get(e.especie) ?? 0;
    const faltanteM3 = Math.round(faltante.reduce((a, f) => a + f.m3, 0) * 1000) / 1000;
    const porPermiso = e.porPermiso.map((p) => {
      const ids = new Set(p.bloques.map((b) => b.bloque.id));
      return {
        ...p,
        bloques: bloques.filter((b) => ids.has(b.bloque.id)),
        amparadaM3: Math.round(bloques.filter((b) => ids.has(b.bloque.id)).reduce((a, b) => a + b.usadoM3, 0) * 1000) / 1000,
      };
    });
    return {
      ...e,
      bloques,
      faltante,
      porPermiso,
      amparadaM3,
      faltanteM3,
      aserradaM3: Math.round((amparadaM3 + faltanteM3) * 1000) / 1000,
      libreM3: r4(bloques.reduce((a, b) => a + b.libreM3, 0)),
    };
  });
  return {
    ...dist,
    especies,
    totales: {
      ...dist.totales,
      amparadaM3: of.distribuido,
      faltanteM3: of.falta,
      /* Lo producido según los papeles: Distribuido + Falta (= `of.total`, lo
         mismo que dicen las tablas de Resúmenes). */
      aserradaM3: of.total,
      libreM3: r4(especies.reduce((a, e) => a + e.libreM3, 0)),
    },
  };
}
