/**
 * lib/forestal/ctp-respaldo-plan.ts — el PLAN de recuperar lo marcado de un
 * respaldo del Libro CTP (ADR-530). Puro: el servidor lo ejecuta dentro de su
 * transacción, después de volver a sacar la foto de hoy bajo candado.
 *
 * Nunca pisa: solo inserta filas que hoy no existen (con su id original, en el
 * orden de `TABLAS_RESPALDO`) y deshace bajas. Lo que apuntaba a otro módulo
 * que ya no existe vuelve vacío y se avisa; una hija sin padre se salta.
 */
import { ETIQUETA_TABLA_RESPALDO, TABLAS_RESPALDO, type SaltadaRecuperar, type TablaRespaldo } from "@/lib/forestal/ctp-respaldo-tipos";
import { numeroDe, type FilaSerial, type TablasSerial, type ValorSerial } from "@/lib/forestal/ctp-respaldo-serial";
import {
  PADRES,
  TOLERANCIA_M3,
  analizar,
  claveDeFila,
  guiasExcedidas,
  nombreTroza,
  txt,
  vivo,
  type Analisis,
  type ContextoRespaldo,
  type Rehook,
} from "@/lib/forestal/ctp-respaldo-diff";

export interface RestoreBaja {
  tabla: TablaRespaldo;
  id: string;
  /** Los valores del respaldo: `deletedAt` null y, si la tabla lo tiene, su estado y motivo de anulación. */
  datos: Record<string, ValorSerial>;
}

export interface PlanRecuperacion {
  /** Por tabla, en el orden de inserción (trozas: madres y luego retrozos). */
  inserts: Partial<Record<TablaRespaldo, FilaSerial[]>>;
  restores: RestoreBaja[];
  rehooks: Rehook[];
  saltadas: SaltadaRecuperar[];
  avisos: string[];
  /** Corridas de producción cuyo saldo hay que mirar después de recuperar. */
  corridasASaldar: string[];
  /** Claves de los grupos que vuelven. */
  grupos: string[];
  /** Si no es null, no se recupera NADA (y este es el porqué). */
  cancelar: string | null;
}

/** Columnas externas que, si apuntan a algo que ya no existe, vuelven vacías. */
const EXTERNAS: readonly (readonly [TablaRespaldo, string, "proveedores" | "contratos" | "partes", string])[] = [
  ["WoodEntry", "supplierId", "proveedores", "proveedor"],
  ["WoodEntry", "contratoId", "contratos", "contrato"],
  ["ForestLoteAserrio", "contratoId", "contratos", "contrato"],
  ["ForestCtpEntry", "contratoId", "contratos", "contrato"],
  ["WoodEntryTroza", "contratoId", "contratos", "contrato"],
  ["ForestCuentaMov", "contratoId", "contratos", "contrato"],
  ["ForestProdLote", "titularId", "partes", "titular"],
];

/** Únicos compuestos de los puentes: si hoy hay otra fila con la misma pareja, la vieja no entra. */
const PAREJAS: Partial<Record<TablaRespaldo, readonly [string, string]>> = {
  ForestCtpConsumo: ["ctpEntryId", "woodEntryId"],
  ForestCtpDespachoOrigen: ["despachoEntryId", "produccionEntryId"],
  ForestCtpReproceso: ["destinoEntryId", "origenEntryId"],
  ForestProdLoteMiembro: ["loteId", "produccionEntryId"],
  CampoPersonalizadoValor: ["campoId", "registroId"],
};

const CON_ESTADO = new Set<TablaRespaldo>(["WoodEntry", "ForestLoteMixto", "ForestLoteAserrio", "ForestCtpEntry", "ForestProdLote"]);

function profundidad(t: FilaSerial, porId: Map<string, FilaSerial>, vistos = new Set<string>()): number {
  const madre = txt(t.trozaOrigenId);
  if (!madre || !porId.has(madre) || vistos.has(madre)) return 0;
  vistos.add(madre);
  return 1 + profundidad(porId.get(madre) as FilaSerial, porId, vistos);
}

/** El plan con lo marcado. `seleccion` = claves de grupo o «todo lo borrado» (todo lo recuperable). */
export function planificarRecuperacion(
  respaldo: TablasSerial,
  hoy: TablasSerial,
  ctx: ContextoRespaldo,
  seleccion: readonly string[] | "todo_lo_borrado",
  analisis: Analisis = analizar(respaldo, hoy, ctx),
): PlanRecuperacion {
  const { R, H, grupos, planes } = analisis;
  const porClave = new Map(grupos.map((g) => [g.clave, g]));
  const saltadas: SaltadaRecuperar[] = [];
  const avisos: string[] = [];
  const elegidos = new Set<string>();

  const pedidas = seleccion === "todo_lo_borrado" ? grupos.filter((g) => g.recuperable).map((g) => g.clave) : [...new Set(seleccion)];
  for (const clave of pedidas) {
    const g = porClave.get(clave);
    if (!g) saltadas.push({ clave, etiqueta: clave, motivo: "Ya no aparece en la comparación: vuelve a comparar." });
    else if (!g.recuperable) saltadas.push({ clave, etiqueta: g.etiqueta, motivo: g.motivo ?? "No se puede recuperar." });
    else elegidos.add(clave);
  }
  /* Lo que necesitan los marcados vuelve con ellos (y se dice). */
  const cola = [...elegidos];
  while (cola.length > 0) {
    const p = planes.get(cola.pop() as string);
    for (const r of p?.requiere ?? []) {
      if (elegidos.has(r)) continue;
      elegidos.add(r);
      cola.push(r);
      avisos.push(`También vuelve ${porClave.get(r)?.etiqueta ?? r}: lo necesita ${p?.etiqueta ?? ""}.`);
    }
  }

  const filasIns = new Map<TablaRespaldo, FilaSerial[]>();
  const restores: RestoreBaja[] = [];
  const rehooks = new Map<string, Rehook>();
  for (const clave of elegidos) {
    const p = planes.get(clave);
    if (!p) continue;
    avisos.push(...p.avisos);
    for (const i of p.inserts) filasIns.set(i.tabla, [...(filasIns.get(i.tabla) ?? []), { ...i.fila }]);
    for (const r of p.restores) {
      const datos: Record<string, ValorSerial> = { deletedAt: null };
      if (CON_ESTADO.has(r.tabla) && r.fila.status !== undefined) datos.status = r.fila.status;
      if (r.tabla === "ForestCtpEntry" || r.tabla === "ForestProdLote") datos.annulledReason = r.fila.annulledReason ?? null;
      restores.push({ tabla: r.tabla, id: String(r.fila.id), datos });
    }
    for (const rh of p.rehooks) rehooks.set(`${rh.trozaId}:${rh.campo}`, rh);
  }

  const insertado = (t: TablaRespaldo) => new Set((filasIns.get(t) ?? []).map((f) => String(f.id)));
  const restaurado = new Set(restores.map((r) => `${r.tabla}:${r.id}`));
  const existeDespues = (t: TablaRespaldo, id: string) => H[t].has(id) || insertado(t).has(id);
  const entradasInsertadasVivas = new Set((filasIns.get("ForestCtpEntry") ?? []).filter((f) => vivo(f)).map((f) => String(f.id)));
  const vivaDespues = (id: string) =>
    entradasInsertadasVivas.has(id) || restaurado.has(`ForestCtpEntry:${id}`) || vivo(H.ForestCtpEntry.get(id));

  /* Referencias: a otros módulos (vacías si no existen) y dentro del libro (`SetNull`). */
  const avisosUnicos = new Set<string>();
  const etiquetaDeFila = (t: TablaRespaldo, f: FilaSerial) => porClave.get(claveDeFila(R, H, t, f))?.etiqueta ?? ETIQUETA_TABLA_RESPALDO[t];
  for (const [t, col, conjunto, que] of EXTERNAS) {
    const existen = ctx.externos?.[conjunto];
    if (!existen) continue;
    for (const f of filasIns.get(t) ?? []) {
      const v = txt(f[col]);
      if (v && !existen.has(v)) {
        f[col] = null;
        avisosUnicos.add(`El ${que} de ${etiquetaDeFila(t, f)} ya no existe: volvió sin ${que}.`);
      }
    }
  }
  let trozasAlPatio = 0;
  for (const [t, padres] of Object.entries(PADRES) as [TablaRespaldo, readonly (readonly [string, TablaRespaldo, boolean])[]][]) {
    for (const f of filasIns.get(t) ?? []) {
      for (const [col, tp, obligatoria] of padres) {
        const pid = txt(f[col]);
        if (obligatoria || !pid) continue;
        const sigue = tp === "ForestCtpEntry" ? vivaDespues(pid) : existeDespues(tp, pid);
        if (sigue) continue;
        f[col] = null;
        if (col === "consumidaEnId" || col === "despachadaEnId") {
          f[col === "consumidaEnId" ? "fechaConsumo" : "fechaDespacho"] = null;
          trozasAlPatio++;
        }
      }
    }
  }
  if (trozasAlPatio > 0) {
    avisosUnicos.add(`${trozasAlPatio} ${trozasAlPatio === 1 ? "troza volvió" : "trozas volvieron"} al patio: su corrida o salida ya no está.`);
  }

  /* Hijas cuyo padre obligatorio no vuelve (otro grupo no marcado), hasta que
     no caiga nada más: si cae la madre, cae el pedazo, y si cae el paquete, su
     apartado. Cada una se avisa; ninguna llega al INSERT a romper la FK. */
  const sinPadre = new Map<string, number>();
  for (let cayo = true; cayo; ) {
    cayo = false;
    for (const [t, padres] of Object.entries(PADRES) as [TablaRespaldo, readonly (readonly [string, TablaRespaldo, boolean])[]][]) {
      const lista = filasIns.get(t);
      if (!lista) continue;
      const quedan = lista.filter((f) => {
        const ok = padres.every(([col, tp, obligatoria]) => !obligatoria || !txt(f[col]) || existeDespues(tp, txt(f[col]) as string));
        if (!ok) {
          const k = `${ETIQUETA_TABLA_RESPALDO[t]} de ${etiquetaDeFila(t, f)}`;
          sinPadre.set(k, (sinPadre.get(k) ?? 0) + 1);
        }
        return ok;
      });
      if (quedan.length !== lista.length) {
        filasIns.set(t, quedan);
        cayo = true;
      }
    }
  }
  for (const [k, n] of sinPadre) {
    avisosUnicos.add(`${k}: ${n === 1 ? "una fila no vuelve" : `${n} filas no vuelven`} porque lo que las sostiene no vuelve.`);
  }
  const campos = ctx.externos?.campos;
  for (const [t, [a, b]] of Object.entries(PAREJAS) as [TablaRespaldo, readonly [string, string]][]) {
    const lista = filasIns.get(t);
    if (!lista) continue;
    const hoyPar = new Set([...H[t].values()].map((h) => `${String(h[a])}|${String(h[b])}`));
    filasIns.set(
      t,
      lista.filter((f) => {
        if (t === "CampoPersonalizadoValor" && campos && !campos.has(txt(f.campoId) ?? "")) {
          avisosUnicos.add(`Un campo propio de ${etiquetaDeFila(t, f)} ya no existe: ese dato no vuelve.`);
          return false;
        }
        if (hoyPar.has(`${String(f[a])}|${String(f[b])}`)) {
          avisosUnicos.add(`${ETIQUETA_TABLA_RESPALDO[t]} de ${etiquetaDeFila(t, f)}: hoy ya hay uno igual, el viejo no se duplica.`);
          return false;
        }
        return true;
      }),
    );
  }
  const fletesHoy = new Set([...H.ForestCuentaMov.values()].map((h) => txt(h.fleteId)).filter(Boolean));
  if (filasIns.has("ForestCuentaMov")) {
    filasIns.set(
      "ForestCuentaMov",
      (filasIns.get("ForestCuentaMov") ?? []).filter((f) => {
        if (!txt(f.fleteId) || !fletesHoy.has(txt(f.fleteId))) return true;
        avisosUnicos.add(`Un cargo de ${etiquetaDeFila("ForestCuentaMov", f)} no volvió: su flete ya tiene otro cargo.`);
        return false;
      }),
    );
  }

  /* Orden: el de TABLAS_RESPALDO; en trozas, madres antes que retrozos. */
  const inserts: Partial<Record<TablaRespaldo, FilaSerial[]>> = {};
  for (const t of TABLAS_RESPALDO) {
    const lista = filasIns.get(t);
    if (!lista?.length) continue;
    if (t === "WoodEntryTroza") {
      const porId = new Map(lista.map((f) => [String(f.id), f]));
      inserts[t] = [...lista].sort((x, y) => profundidad(x, porId) - profundidad(y, porId) || String(x.id).localeCompare(String(y.id)));
    } else inserts[t] = lista;
  }

  /* Trozas re-enganchadas que, al final, quedan sin su corrida (no debería: la corrida es del mismo grupo). */
  const rehooksFinal = [...rehooks.values()].filter((r) => vivaDespues(r.entryId));

  /* Saldos a mirar: corridas que vuelven y las que alimentan salidas/reprocesos que vuelven. */
  const tocadas = new Set<string>([
    ...entradasInsertadasVivas,
    ...restores.filter((r) => r.tabla === "ForestCtpEntry").map((r) => r.id),
  ]);
  const saldar = new Set<string>();
  for (const id of tocadas) if ((H.ForestCtpEntry.get(id) ?? R.ForestCtpEntry.get(id))?.section !== "despacho") saldar.add(id);
  const origenes = [...H.ForestCtpDespachoOrigen.values(), ...(inserts.ForestCtpDespachoOrigen ?? [])];
  for (const o of origenes) if (tocadas.has(txt(o.despachoEntryId) ?? "") || (inserts.ForestCtpDespachoOrigen ?? []).includes(o)) saldar.add(txt(o.produccionEntryId) ?? "");
  const repro = [...H.ForestCtpReproceso.values(), ...(inserts.ForestCtpReproceso ?? [])];
  for (const r of repro) if (tocadas.has(txt(r.destinoEntryId) ?? "") || (inserts.ForestCtpReproceso ?? []).includes(r)) saldar.add(txt(r.origenEntryId) ?? "");
  saldar.delete("");

  /* La misma madera de una guía no puede contarse dos veces entre todos los marcados. */
  const exceso = guiasExcedidas(R, H, inserts.ForestCtpConsumo ?? [], vivaDespues);
  /* L1 entre todos los marcados: cada lote se revisó solo; acá se suma por
     corrida lo que queda en lotes vivos hoy + lo que vuelve junto. Como el
     saldo negativo: si alguna se pasa de lo producido, no se recupera nada. */
  const restauradaFila = new Map(restores.map((r) => [`${r.tabla}:${r.id}`, R[r.tabla].get(r.id)]));
  const loteVivoDespues = (id: string) => {
    const l = restauradaFila.get(`ForestProdLote:${id}`) ?? (inserts.ForestProdLote ?? []).find((f) => f.id === id) ?? H.ForestProdLote.get(id);
    return !!l && l.deletedAt == null && l.status !== "anulado";
  };
  const loteVivoHoy = (id: string) => {
    const l = H.ForestProdLote.get(id);
    return !!l && l.deletedAt == null && l.status !== "anulado";
  };
  const enLotes = (miembros: Iterable<FilaSerial>, vivoLote: (id: string) => boolean) => {
    const m = new Map<string, number>();
    for (const x of miembros) {
      const c = txt(x.produccionEntryId);
      if (c && vivoLote(txt(x.loteId) ?? "")) m.set(c, (m.get(c) ?? 0) + (numeroDe(x.quantity) ?? 0));
    }
    return m;
  };
  const lotesAntes = enLotes(H.ForestProdLoteMiembro.values(), loteVivoHoy);
  const lotesDespues = enLotes([...H.ForestProdLoteMiembro.values(), ...(inserts.ForestProdLoteMiembro ?? [])], loteVivoDespues);
  let excesoLotes: string | null = null;
  for (const [c, total] of lotesDespues) {
    const corrida = H.ForestCtpEntry.get(c) ?? R.ForestCtpEntry.get(c);
    const producido = numeroDe(corrida?.quantity);
    if (producido == null || total <= producido + TOLERANCIA_M3 || total <= (lotesAntes.get(c) ?? 0) + TOLERANCIA_M3) continue;
    const quien = corrida?.lineNo != null ? `la corrida N.° ${String(corrida.lineNo)}` : "una corrida";
    excesoLotes = `No se recuperó nada: ${quien} quedaría con ${Number(total.toFixed(4))} en lotes y produjo ${Number(producido.toFixed(4))}. Desmarca alguno de los lotes que la llevan.`;
    break;
  }

  const cancelar =
    exceso.length > 0 ? `No se recuperó nada: ${exceso[0]}. Desmarca alguna de las corridas que la usan.` : excesoLotes;

  for (const rh of rehooksFinal) {
    const t = H.WoodEntryTroza.get(rh.trozaId);
    if (t && rh.actual) avisosUnicos.add(`La troza ${nombreTroza(t)} vuelve a su corrida (estaba en una anulada).`);
  }

  return {
    inserts,
    restores,
    rehooks: rehooksFinal.sort((a, b) => a.trozaId.localeCompare(b.trozaId)),
    saltadas,
    avisos: [...new Set([...avisos, ...avisosUnicos])],
    corridasASaldar: [...saldar].sort(),
    grupos: [...elegidos].sort(),
    cancelar,
  };
}

/** Filas que volverían, por tabla (insertadas + bajas deshechas). */
export function conteoDelPlan(p: PlanRecuperacion): Partial<Record<TablaRespaldo, number>> {
  const out: Partial<Record<TablaRespaldo, number>> = {};
  for (const t of TABLAS_RESPALDO) {
    const n = (p.inserts[t]?.length ?? 0) + p.restores.filter((r) => r.tabla === t).length;
    if (n > 0) out[t] = n;
  }
  return out;
}
