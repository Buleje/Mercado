/**
 * El precio de un cliente mientras se escribe (ADR-430) — del formulario a la
 * versión que guarda el servidor, y la vista previa en palabras.
 *
 * Dos modos en pantalla, ninguno en la base: **Global** es tener sólo el precio
 * general; **Por grupos** es tener precios por grupo de especies, con el general
 * como «lo demás». Por eso, en Global los precios por grupo que se hayan tipeado
 * NO viajan: un «global» con grupos cargados sería la contradicción que el ADR
 * descartó al no guardar una columna de modo.
 *
 * PURO: lo prueban los tests sin montar nada.
 */
import { formatNumber } from "@/lib/format";
import { ORDEN_TIPO, type TipoComercial } from "./cubicacion-tipo";
import { claveEspecie } from "./loth-constants";
import {
  ETIQUETA_SERVICIO_PRECIO,
  explicarOrigenCliente,
  precioDelCliente,
  tarifaClienteInputSchema,
  type GrupoEspecies,
  type OrigenPrecioCliente,
  type ServicioPrecio,
  type TarifaCliente,
  type TarifaClienteInput,
} from "./precio-cliente";

export type ModoPrecio = "global" | "grupos";

/** Todo string: sale de inputs, y `""` es «sin precio», nunca cero. */
export interface BorradorPrecio {
  servicio: ServicioPrecio;
  modo: ModoPrecio;
  /** `AAAA-MM-DD`: desde cuándo rige esta versión. */
  vigenteDesde: string;
  /** El global del cliente; en modo grupos es «lo demás». */
  basePt: string;
  /** Precio por id de grupo de la planta. */
  grupos: Record<string, string>;
  especies: { nombre: string; precio: string }[];
  tipos: { tipo: TipoComercial; precio: string }[];
  nota: string;
}

export function borradorVacio(servicio: ServicioPrecio, hoy: string): BorradorPrecio {
  return {
    servicio,
    modo: "global",
    vigenteDesde: hoy,
    basePt: "",
    grupos: {},
    especies: [],
    tipos: [],
    nota: "",
  };
}

/**
 * Arranca desde la versión vigente, para cambiar sólo lo que cambió. La fecha
 * NO se copia: guardar crea una versión NUEVA que rige desde hoy, y lo ya
 * cobrado queda con el precio de su día.
 */
export function borradorDesdeTarifa(
  t: TarifaCliente | null,
  servicio: ServicioPrecio,
  hoy: string,
): BorradorPrecio {
  if (!t) return borradorVacio(servicio, hoy);
  return {
    servicio,
    modo: t.grupos.length > 0 ? "grupos" : "global",
    vigenteDesde: hoy,
    basePt: t.basePt != null ? textoPrecio(t.basePt) : "",
    grupos: Object.fromEntries(t.grupos.map((g) => [g.grupoId, textoPrecio(g.precioPt)])),
    especies: t.especies.map((e) => ({ nombre: e.nombre, precio: textoPrecio(e.precioPt) })),
    tipos: t.tipos.map((x) => ({ tipo: x.tipo, precio: textoPrecio(x.precioPt) })),
    nota: t.nota ?? "",
  };
}

/** `0.5` → `"0.50"`, `2.1` → `"2.10"`; con tres decimales se respetan (`0.555`). Así se lee un precio. */
function textoPrecio(n: number): string {
  /* `2.1 * 100` es 210.00000000000003: se compara redondeado, no con `isInteger`. */
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? n.toFixed(2) : String(n);
}

/** `"0,60"` y `"0.60"` son lo mismo: en el patio se escribe con coma. */
function numero(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

const esTipo = (v: string): v is TipoComercial => (ORDEN_TIPO as readonly string[]).includes(v);

/** Los grupos con precio que siguen existiendo en la planta (un grupo borrado no viaja). */
function gruposConPrecio(b: BorradorPrecio, grupos: readonly GrupoEspecies[]): [string, string][] {
  if (b.modo !== "grupos") return [];
  const vivos = new Set(grupos.map((g) => g.id));
  return Object.entries(b.grupos).filter(([id, v]) => vivos.has(id) && v.trim() !== "");
}

export type ResultadoBorrador =
  | { ok: true; input: TarifaClienteInput }
  | { ok: false; error: string };

/**
 * Del borrador a la entrada del servidor, validada con el MISMO esquema que usa
 * el endpoint. Antes de eso se atrapan dos errores que el esquema diría mal:
 * una fila a medias (especie sin precio o precio sin especie) y un precio que
 * no es número.
 */
export function validarBorrador(
  parteId: string,
  b: BorradorPrecio,
  grupos: readonly GrupoEspecies[],
): ResultadoBorrador {
  const noEsPrecio = (raw: string) =>
    `«${raw.trim()}» no es un precio: escribe el monto por pie, como 0.50.`;
  const precios: string[] = [
    b.basePt,
    ...gruposConPrecio(b, grupos).map(([, v]) => v),
    ...b.especies.map((e) => e.precio),
    ...b.tipos.map((t) => t.precio),
  ];
  for (const raw of precios) {
    if (Number.isNaN(numero(raw))) return { ok: false, error: noEsPrecio(raw) };
  }
  for (const e of b.especies) {
    if (e.nombre.trim() && !e.precio.trim())
      return { ok: false, error: `A «${e.nombre.trim()}» le falta el precio por pie.` };
    if (!e.nombre.trim() && e.precio.trim())
      return {
        ok: false,
        error: "Hay un precio por especie sin la especie: elígela o borra la fila.",
      };
  }
  const cuerpo = {
    parteId,
    servicio: b.servicio,
    vigenteDesde: b.vigenteDesde,
    basePt: numero(b.basePt),
    grupos: gruposConPrecio(b, grupos).map(([grupoId, v]) => ({ grupoId, precioPt: numero(v) })),
    especies: b.especies
      .filter((e) => e.nombre.trim())
      .map((e) => ({ nombre: e.nombre.trim(), precioPt: numero(e.precio) })),
    tipos: b.tipos
      .filter((t) => t.precio.trim())
      .map((t) => ({ tipo: t.tipo, precioPt: numero(t.precio) })),
    nota: b.nota.trim() || null,
  };
  const v = tarifaClienteInputSchema.safeParse(cuerpo);
  if (!v.success)
    return { ok: false, error: v.error.issues[0]?.message ?? "El precio no se puede guardar así." };
  return { ok: true, input: v.data };
}

/** Un precio escrito y sin guardar, ya validado (o con su motivo). */
export interface PrecioPendiente {
  servicio: ServicioPrecio;
  resultado: ResultadoBorrador;
}

/**
 * Guarda los precios que esperaban a la ficha. Recibe `guardar` del hook para
 * no repetir el POST: es el mismo endpoint con el id que ahora sí existe.
 */
export async function guardarPreciosPendientes(
  guardar: (input: TarifaClienteInput) => Promise<TarifaCliente>,
  parteId: string,
  pendientes: readonly PrecioPendiente[],
): Promise<{ errores: string[] }> {
  const errores: string[] = [];
  for (const p of pendientes) {
    if (!p.resultado.ok) continue;
    try {
      await guardar({ ...p.resultado.input, parteId });
    } catch (e) {
      errores.push(
        `${ETIQUETA_SERVICIO_PRECIO[p.servicio]}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return { errores };
}

/**
 * La versión tal como la leería el cobro, armada con lo que haya escrito —sin
 * exigir que esté completa— para la vista previa en vivo. Lo que todavía no es
 * un precio válido simplemente no cuenta.
 */
export function tarifaDelBorrador(
  b: BorradorPrecio,
  grupos: readonly GrupoEspecies[],
): TarifaCliente {
  const ok = (v: string) => {
    const n = numero(v);
    return n != null && n > 0 ? n : null;
  };
  return {
    id: "borrador",
    parteId: "borrador",
    servicio: b.servicio,
    vigenteDesde: b.vigenteDesde,
    basePt: ok(b.basePt),
    grupos: gruposConPrecio(b, grupos).flatMap(([grupoId, v]) => {
      const n = ok(v);
      return n ? [{ grupoId, precioPt: n }] : [];
    }),
    especies: b.especies.flatMap((e) => {
      const n = ok(e.precio);
      return e.nombre.trim() && n
        ? [{ clave: claveEspecie(e.nombre), nombre: e.nombre.trim(), precioPt: n }]
        : [];
    }),
    tipos: b.tipos.flatMap((t) => {
      const n = ok(t.precio);
      return n && esTipo(t.tipo) ? [{ tipo: t.tipo, precioPt: n }] : [];
    }),
    nota: b.nota.trim() || null,
  };
}

/** `S/ 0.60` — hasta 4 decimales, porque el precio por pie a veces lleva tres. */
export function solesPorPie(n: number): string {
  return `S/ ${formatNumber(n, { min: 2, max: 4 })}`;
}

export interface LineaVistaPrevia {
  especie: string;
  precioPt: number | null;
  /** De dónde sale el precio; `null` = el cliente no tiene precio: rige la planta. */
  desde: OrigenPrecioCliente | null;
  texto: string;
}

/**
 * «Tornillo comercial → S/ 0.60 por pie (precio del cliente para Tornillo)».
 *
 * Usa `precioDelCliente` —la misma función del cobro en el servidor— con los
 * mismos argumentos: lo que dice la vista previa es lo que se va a cobrar.
 */
export function vistaPrevia(
  tarifa: TarifaCliente | null,
  grupos: readonly GrupoEspecies[],
  especies: readonly string[],
  tipo: TipoComercial,
): LineaVistaPrevia[] {
  const t = tipo.toLowerCase();
  return especies.map((especie) => {
    const p = precioDelCliente(tarifa, grupos, especie, tipo);
    return p
      ? {
          especie,
          precioPt: p.precioPt,
          desde: p.desde,
          texto: `${especie} ${t} → ${solesPorPie(p.precioPt)} por pie (${explicarOrigenCliente(p, especie, t)})`,
        }
      : {
          especie,
          precioPt: null,
          desde: null,
          texto: `${especie} ${t} → sin precio del cliente: rige la tarifa de la planta`,
        };
  });
}

/**
 * La vista previa de TODO el catálogo, en pocas líneas: cada especie con
 * precio propio o de su grupo va en su renglón; las que caen al mismo precio
 * general (o por tipo, o a la tarifa de la planta) se juntan en uno.
 *
 * Mostrar sólo «las primeras seis» elegía por orden alfabético —Bolaina, Caoba,
 * Capirona…— y dejaba afuera al Tornillo, que en Blas es 13 de 15 corridas.
 */
export function vistaPreviaResumida(
  tarifa: TarifaCliente | null,
  grupos: readonly GrupoEspecies[],
  especies: readonly string[],
  tipo: TipoComercial,
): { clave: string; texto: string; conPrecio: boolean }[] {
  const lineas = vistaPrevia(tarifa, grupos, especies, tipo);
  const propias = lineas.filter(
    (l) => l.desde === "cliente-especie" || l.desde === "cliente-grupo",
  );
  const resto = new Map<string, LineaVistaPrevia[]>();
  for (const l of lineas) {
    if (propias.includes(l)) continue;
    const k = `${l.desde ?? "planta"}|${l.precioPt ?? ""}`;
    resto.set(k, [...(resto.get(k) ?? []), l]);
  }
  const t = tipo.toLowerCase();
  const salida = propias.map((l) => ({ clave: l.especie, texto: l.texto, conPrecio: true }));
  for (const [k, ls] of resto) {
    const primera = ls[0]!;
    const todas = ls.length === especies.length;
    const nombres =
      ls.length <= 3
        ? ls.map((l) => l.especie).join(", ")
        : `${ls
            .slice(0, 3)
            .map((l) => l.especie)
            .join(", ")} y ${ls.length - 3} más`;
    const quien = todas ? `Toda especie en ${t}` : `Las demás en ${t} (${nombres})`;
    const cola = primera.texto.slice(primera.texto.indexOf("→"));
    salida.push({ clave: k, texto: `${quien} ${cola}`, conPrecio: primera.precioPt != null });
  }
  return salida;
}

/** Una versión en una línea, para el historial: «Global S/ 0.50 · 2 especies». */
export function resumenTarifa(t: TarifaCliente, grupos: readonly GrupoEspecies[]): string {
  const partes: string[] = [];
  if (t.grupos.length > 0) {
    const nombres = t.grupos
      .map((pg) => {
        const g = grupos.find((x) => x.id === pg.grupoId);
        return `${g?.nombre ?? "grupo borrado"} ${solesPorPie(pg.precioPt)}`;
      })
      .join(", ");
    partes.push(nombres);
    partes.push(
      t.basePt != null ? `lo demás ${solesPorPie(t.basePt)}` : "lo demás a la tarifa de la planta",
    );
  } else if (t.basePt != null) {
    partes.push(`Global ${solesPorPie(t.basePt)}`);
  }
  if (t.especies.length > 0) {
    partes.push(t.especies.map((e) => `${e.nombre} ${solesPorPie(e.precioPt)}`).join(", "));
  }
  if (t.tipos.length > 0) {
    partes.push(
      t.tipos.map((x) => `${x.tipo.toLowerCase()} ${solesPorPie(x.precioPt)}`).join(", "),
    );
  }
  return partes.join(" · ") || "Sin precios";
}
