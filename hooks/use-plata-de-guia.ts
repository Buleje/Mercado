"use client";

/**
 * use-plata-de-guia — la plata de UNA guía desde el cliente (ADR-437).
 *
 * El modal «¿Cuánto pagaste por esta guía?» guardaba con N PATCH sueltos, uno
 * por asiento: si fallaba el segundo, el libro quedaba con media factura y el
 * margen mentía sin avisar. Ahora todo pasa por UN `PUT` (una transacción en el
 * servidor) y el modal sólo arma el borrador.
 *
 * Tres piezas:
 *  · `usePlataDeGuia(gtf)` — leer el DTO, guardar, gastos y fletes de la guía.
 *  · `useBorradorCompra(dto)` — el precio (un total o por especie) y el cuadre
 *    con la factura; la cuenta la hacen las funciones puras de `plata-de-guia`.
 *  · `usePagoDeGuia(...)` — registrar un pago = una liquidación (ADR-413) con la
 *    guía imputada y la foto del comprobante.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { FotoCarga } from "@/lib/forestal/fotos-carga";
import type { CandidatoFlete, FleteInput } from "@/lib/forestal/fletes";
import {
  aplicarAjuste,
  costoPorEspecie,
  cuadrarConFactura,
  esPtDerivado,
  ptDelBorrador,
  repartirPorVolumen,
  type Cuadre,
  type FuentePt,
  type GastoGuiaInput,
  type GuardarCompraInput,
  type GuardarPlataGuiaInput,
  type MetodoPagoGuia,
  type PlataDeGuiaDTO,
} from "@/lib/forestal/plata-de-guia";
import type { LiquidacionDTO } from "@/lib/cuentas/liquidacion";

const API = "/api/admin/forestal/guias/plata";
const JSON_CSRF = () => csrfHeaders({ "Content-Type": "application/json" });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que el servidor contesta cuando algo no se puede, dicho para el patio. */
const MENSAJES: Record<string, string> = {
  ES_MADERA_DE_SERVICIO: "Esta guía es madera de servicio: no lleva costo.",
  TIENE_PAGOS:
    "Esta guía ya tiene pagos imputados. Anula esos pagos antes de marcarla de servicio.",
  no_cierra: "La suma de las especies no cierra con la factura.",
};

type Respuesta = {
  error?: string;
  message?: string;
  plata?: PlataDeGuiaDTO;
} & Partial<PlataDeGuiaDTO>;

async function leer(r: Response): Promise<Respuesta> {
  return (await r.json().catch((err: unknown) => {
    logger.warn("[plata-de-guia] respuesta sin JSON", { error: String(err), status: r.status });
    return {};
  })) as Respuesta;
}

const motivo = (b: Respuesta, porDefecto: string) =>
  b.message ?? (b.error ? (MENSAJES[b.error] ?? b.error) : porDefecto);

/** El DTO viene suelto o envuelto en `{ plata }`: se aceptan las dos formas. */
const dtoDe = (b: Respuesta): PlataDeGuiaDTO | null =>
  b.plata ??
  (typeof b.gtfNumber === "string" && Array.isArray(b.lineas) ? (b as PlataDeGuiaDTO) : null);

export type Resultado = { ok: true } | { ok: false; mensaje: string };

export function usePlataDeGuia(gtf: string) {
  const [dto, setDto] = useState<PlataDeGuiaDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Sólo la última lectura escribe: una vieja que vuelve tarde no pisa lo recién guardado. */
  const ultima = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++ultima.current;
    setCargando(true);
    try {
      const r = await fetch(`${API}?gtf=${encodeURIComponent(gtf)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const b = await leer(r);
      if (mia !== ultima.current) return;
      const d = dtoDe(b);
      if (!r.ok || !d)
        throw new Error(motivo(b, `No se pudo leer la plata de la guía (${r.status})`));
      setDto(d);
      setError(null);
    } catch (e) {
      if (mia === ultima.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mia === ultima.current) setCargando(false);
    }
  }, [gtf]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(
    async (input: GuardarPlataGuiaInput): Promise<Resultado> => {
      try {
        const r = await fetch(API, {
          method: "PUT",
          credentials: "include",
          headers: JSON_CSRF(),
          body: JSON.stringify(input),
        });
        const b = await leer(r);
        if (!r.ok)
          return { ok: false, mensaje: motivo(b, "No se pudo guardar la plata de la guía.") };
        ultima.current++;
        const d = dtoDe(b);
        if (d) setDto(d);
        else void cargar();
        return { ok: true };
      } catch (e) {
        logger.error("[plata-de-guia] PUT falló", { error: String(e) });
        return { ok: false, mensaje: "Sin conexión: no se guardó nada. Vuelve a intentar." };
      }
    },
    [cargar],
  );

  const agregarGasto = useCallback(
    async (g: Omit<GastoGuiaInput, "gtfNumber">): Promise<Resultado> => {
      try {
        const r = await fetch(`${API}/gastos`, {
          method: "POST",
          credentials: "include",
          headers: JSON_CSRF(),
          body: JSON.stringify({ ...g, gtfNumber: gtf }),
        });
        const b = await leer(r);
        if (!r.ok) return { ok: false, mensaje: motivo(b, "No se pudo anotar el gasto.") };
        await cargar();
        return { ok: true };
      } catch (e) {
        logger.error("[plata-de-guia] POST gasto falló", { error: String(e) });
        return { ok: false, mensaje: "Sin conexión: el gasto no se anotó." };
      }
    },
    [gtf, cargar],
  );

  const borrarGasto = useCallback(
    async (id: string): Promise<Resultado> => {
      try {
        const r = await fetch(`${API}/gastos?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
          headers: csrfHeaders(),
        });
        const b = await leer(r);
        if (!r.ok) return { ok: false, mensaje: motivo(b, "No se pudo quitar el gasto.") };
        await cargar();
        return { ok: true };
      } catch (e) {
        logger.error("[plata-de-guia] DELETE gasto falló", { error: String(e) });
        return { ok: false, mensaje: "Sin conexión: el gasto sigue anotado." };
      }
    },
    [cargar],
  );

  /** El flete se guarda por la MISMA ruta que la pestaña Fletes (ADR-318). */
  const guardarFlete = useCallback(
    async (input: FleteInput & { id?: string }): Promise<void> => {
      const r = await fetch("/api/admin/forestal/fletes", {
        method: "POST",
        credentials: "include",
        headers: JSON_CSRF(),
        body: JSON.stringify(input),
      });
      const b = await leer(r);
      if (!r.ok) throw new Error(motivo(b, "No se pudo guardar el flete."));
      await cargar();
    },
    [cargar],
  );

  return { dto, cargando, error, cargar, guardar, agregarGasto, borrarGasto, guardarFlete };
}

/**
 * El viaje de esta guía, listo para «Agregar flete». Si la bandeja de «guías sin
 * flete anotado» ya lo tiene (placa, transportista y conductor leídos de la
 * GTF), sale de ahí; si no, lo mínimo que sí se sabe.
 */
export async function candidatoFleteDe(base: CandidatoFlete): Promise<CandidatoFlete> {
  try {
    const r = await fetch("/api/admin/forestal/fletes?candidatos=1", {
      credentials: "include",
      cache: "no-store",
    });
    if (!r.ok) return base;
    const j = (await r.json()) as { candidatos?: CandidatoFlete[] };
    return j.candidatos?.find((c) => c.gtfNumber === base.gtfNumber) ?? base;
  } catch (e) {
    logger.warn("[plata-de-guia] no se pudo leer el candidato de flete", { error: String(e) });
    return base;
  }
}

// ── Borrador de la compra ────────────────────────────────────────────────────

export type ModoPrecio = "total" | "especie";
export type UnidadPrecio = "m3" | "pt";

export interface FilaPrecio {
  unidad: UnidadPrecio;
  /** Lo tipeado, como texto: un campo a medio escribir no es un número. */
  precio: string;
  cantidad: string;
}

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function filasIniciales(dto: PlataDeGuiaDTO): Record<string, FilaPrecio> {
  const out: Record<string, FilaPrecio> = {};
  for (const l of dto.lineas) {
    const d = l.costoDetalle;
    out[l.id] = {
      unidad: d?.unidad ?? "m3",
      precio: d?.modo === "especie" && d.precio != null ? String(d.precio) : "",
      cantidad: d?.modo === "especie" && d.cantidadFactura != null ? String(d.cantidadFactura) : "",
    };
  }
  return out;
}

type PreciosPorLinea = Record<
  string,
  { precio: number; unidad: UnidadPrecio; cantidadFactura: number | null } | undefined
>;

/** Lo tipeado en cada fila, como precio que entiende `costoPorEspecie`. */
function preciosDe(
  lineas: PlataDeGuiaDTO["lineas"],
  filas: Record<string, FilaPrecio>,
): PreciosPorLinea {
  const out: PreciosPorLinea = {};
  for (const l of lineas) {
    const f = filas[l.id];
    const p = f ? num(f.precio) : null;
    const c = f ? num(f.cantidad) : null;
    if (f && p != null && p > 0)
      out[l.id] = { precio: p, unidad: f.unidad, cantidadFactura: c != null && c > 0 ? c : null };
  }
  return out;
}

/**
 * Las líneas con el PT que el borrador multiplica (ADR-440 §6): el SELLADO si
 * ya se pagó por pt —re-medir después no cambia lo pagado—, salvo las que la
 * persona pidió recalcular con la cubicación de hoy.
 */
function lineasParaPrecio(lineas: PlataDeGuiaDTO["lineas"], ptHoy: Readonly<Record<string, boolean>>) {
  return lineas.map((l) => ({ ...l, ptPago: ptDelBorrador(l, Boolean(ptHoy[l.id])) }));
}

/**
 * El ajuste que se eligió la vez pasada, reconstruido. El acta guarda precio y
 * cantidad, no el ajuste: sin esto, reabrir una guía ajustada mostraba «Faltan
 * S/ 3,40» sobre un costo que ya cerraba al céntimo (medido en QA 26-09).
 * Sólo se reconoce si el costo guardado de la especie mayor ES el ajustado.
 */
function ajusteGuardado(
  dto: PlataDeGuiaDTO,
  filas: Record<string, FilaPrecio>,
  factura: number | null,
): Cuadre["ajuste"] {
  if (factura == null) return null;
  const costos = costoPorEspecie(lineasParaPrecio(dto.lineas, {}), preciosDe(dto.lineas, filas));
  if (costos.length !== dto.lineas.length) return null;
  const c = cuadrarConFactura(
    costos.map((x) => {
      const l = dto.lineas.find((y) => y.id === x.id);
      return {
        id: x.id,
        costoTotal: x.costoTotal,
        volumeM3: l?.volumeM3 ?? 0,
        speciesCommonName: l?.speciesCommonName ?? null,
      };
    }),
    factura,
  );
  const guardada = c.ajuste ? dto.lineas.find((l) => l.id === c.ajuste?.id)?.costoTotal : null;
  return c.ajuste && guardada != null && Math.abs(guardada - c.ajuste.nuevoCosto) <= 0.005
    ? c.ajuste
    : null;
}

export interface LineaCalculada {
  id: string;
  costoTotal: number | null;
  /** La cantidad que se multiplicó y si salió de la factura o de nuestro cálculo. */
  cantidad: number | null;
  cantidadDerivada: boolean;
  /** De dónde salió el PT multiplicado; `null` si fue por m³ o reparto del total. */
  fuentePt: FuentePt | null;
}

const SIN_LINEAS: PlataDeGuiaDTO["lineas"] = [];

/**
 * `dto` puede llegar `null` (todavía viaja): el borrador se siembra UNA vez, en
 * el render en que llega el primero — patrón «ajustar el estado al cambiar una
 * prop», sin efecto que dibuje un cuadro vacío en el medio. Lo que se guarda
 * después NO lo re-siembra: pisaría lo que la persona está tipeando.
 */
export function useBorradorCompra(dto: PlataDeGuiaDTO | null) {
  const [sembrado, setSembrado] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPrecio>("total");
  const [total, setTotal] = useState<string>("");
  const [filas, setFilas] = useState<Record<string, FilaPrecio>>({});
  const [ajuste, setAjuste] = useState<Cuadre["ajuste"]>(null);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [anotarEnCuenta, setAnotarEnCuenta] = useState(true);
  /** Líneas ya pagadas por pt que la persona pidió recalcular con la cubicación de hoy. */
  const [ptHoy, setPtHoy] = useState<Record<string, boolean>>({});

  if (dto && sembrado !== dto.gtfNumber) {
    const detalle0 = dto.lineas.find((l) => l.costoDetalle)?.costoDetalle ?? null;
    setSembrado(dto.gtfNumber);
    setModo(detalle0?.modo ?? (dto.lineas.length > 1 ? "especie" : "total"));
    setTotal(
      detalle0?.totalFactura != null
        ? String(detalle0.totalFactura)
        : dto.totalMadera != null
          ? String(dto.totalMadera)
          : "",
    );
    const filas0 = filasIniciales(dto);
    setFilas(filas0);
    setAjuste(
      ajusteGuardado(dto, filas0, detalle0?.modo === "especie" ? detalle0.totalFactura : null),
    );
    setProveedorId(dto.proveedor?.seguro ? dto.proveedor.parteId : null);
    setPtHoy({});
  }
  const lineasDto = dto?.lineas ?? SIN_LINEAS;
  const lineasPrecio = useMemo(() => lineasParaPrecio(lineasDto, ptHoy), [lineasDto, ptHoy]);

  /* Cualquier cambio invalida el ajuste elegido: se ajustó una diferencia que ya no es la misma. */
  const cambiarFila = useCallback((id: string, v: Partial<FilaPrecio>) => {
    setAjuste(null);
    setFilas((p) => ({
      ...p,
      [id]: { ...(p[id] ?? { unidad: "m3", precio: "", cantidad: "" }), ...v },
    }));
  }, []);
  const cambiarTotal = useCallback((v: string) => {
    setAjuste(null);
    setTotal(v);
  }, []);
  const cambiarModo = useCallback((m: ModoPrecio) => {
    setAjuste(null);
    setModo(m);
  }, []);
  /** «Usar la cubicación de hoy» en una línea ya pagada por pt (o volver a lo pagado). */
  const usarPtDeHoy = useCallback((id: string, si: boolean) => {
    setAjuste(null);
    setPtHoy((p) => ({ ...p, [id]: si }));
  }, []);

  const calculo = useMemo(() => {
    const totalNum = num(total);
    let lineas: LineaCalculada[];
    if (modo === "total") {
      const reparto =
        totalNum != null && totalNum > 0 ? repartirPorVolumen(totalNum, lineasDto) : [];
      const porId = new Map(reparto.map((r) => [r.id, r.costoTotal]));
      lineas = lineasDto.map((l) => ({
        id: l.id,
        costoTotal: porId.get(l.id) ?? null,
        cantidad: l.volumeM3,
        cantidadDerivada: true,
        fuentePt: null,
      }));
    } else {
      const costos = new Map(
        costoPorEspecie(lineasPrecio, preciosDe(lineasDto, filas)).map((c) => [c.id, c]),
      );
      lineas = lineasDto.map((l) => {
        const c = costos.get(l.id);
        return {
          id: l.id,
          costoTotal: c?.costoTotal ?? null,
          cantidad: c?.cantidad ?? null,
          cantidadDerivada: c?.cantidadDerivada ?? true,
          fuentePt: c?.fuentePt ?? null,
        };
      });
      /* El ajuste lo ELIGIÓ la persona («Ajustar S/ X en Tornillo»); nunca se aplica solo. */
      if (ajuste && lineas.every((l) => l.costoTotal != null)) {
        lineas = aplicarAjuste(lineas as (LineaCalculada & { costoTotal: number })[], ajuste);
      }
    }
    const completas =
      lineas.length > 0 && lineas.every((l) => l.costoTotal != null && l.costoTotal >= 0);
    const suma = r2(lineas.reduce((t, l) => t + (l.costoTotal ?? 0), 0));
    /* Sin factura tipeada, la factura ES la suma: no hay con qué comparar. */
    const factura = modo === "total" ? totalNum : (totalNum ?? (completas ? suma : null));
    const cuadre =
      completas && factura != null
        ? cuadrarConFactura(
            lineas.map((l) => {
              const d = lineasDto.find((x) => x.id === l.id);
              return {
                id: l.id,
                costoTotal: l.costoTotal ?? 0,
                volumeM3: d?.volumeM3 ?? 0,
                speciesCommonName: d?.speciesCommonName ?? null,
              };
            }),
            factura,
          )
        : null;
    return {
      lineas,
      suma,
      factura,
      completas,
      cuadre,
      listo: Boolean(completas && factura != null && factura > 0 && cuadre?.cierra),
    };
  }, [modo, total, filas, ajuste, lineasDto, lineasPrecio]);

  /** El cuerpo del PUT; `null` si todavía no se puede guardar. */
  const cuerpo = useMemo((): GuardarCompraInput | null => {
    const { lineas, factura, listo } = calculo;
    if (!dto || !listo || factura == null) return null;
    const volTotal = dto.lineas.reduce((t, l) => t + l.volumeM3, 0);
    const porM3 = modo === "total" && volTotal > 0 ? r2(factura / volTotal) : null;
    return {
      tipo: "compra",
      gtfNumber: dto.gtfNumber,
      proveedorParteId: proveedorId,
      totalFactura: r2(factura),
      anotarEnCuenta: Boolean(proveedorId) && anotarEnCuenta,
      vistos: dto.lineas.map((l) => ({ id: l.id, antes: l.costoTotal })),
      lineas: dto.lineas.map((l) => {
        const c = lineas.find((x) => x.id === l.id);
        const f = filas[l.id];
        const precio = modo === "especie" && f ? num(f.precio) : porM3;
        const cant = modo === "especie" && f ? num(f.cantidad) : null;
        const unidad = modo === "especie" && f ? f.unidad : "m3";
        const cantidadFactura = cant != null && cant > 0 ? cant : null;
        /* El PT que multiplicamos: el servidor lo contrasta con la cubicación
           y SELLA la fuente (nunca sale de acá). */
        const ptUsado = esPtDerivado({ modo, unidad, cantidadFactura })
          ? (c?.cantidad ?? null)
          : unidad === "pt"
            ? cantidadFactura
            : null;
        return {
          woodEntryId: l.id,
          costoTotal: r2(c?.costoTotal ?? 0),
          detalle: {
            v: 1 as const,
            modo,
            unidad,
            precio: precio != null && precio > 0 && precio <= 100_000 ? precio : null,
            cantidadFactura,
            ptDerivado: Math.max(0, l.ptDerivado),
            totalFactura: r2(factura),
            ptUsado,
          },
        };
      }),
    };
  }, [calculo, dto, filas, modo, proveedorId, anotarEnCuenta]);

  return {
    modo,
    cambiarModo,
    total,
    cambiarTotal,
    filas,
    cambiarFila,
    ajuste,
    setAjuste,
    proveedorId,
    setProveedorId,
    anotarEnCuenta,
    setAnotarEnCuenta,
    ptHoy,
    usarPtDeHoy,
    calculo,
    cuerpo,
  };
}

// ── Pago de la guía ──────────────────────────────────────────────────────────

export interface PagoGuiaInput {
  monto: number;
  metodo: MetodoPagoGuia;
  /** `AAAA-MM-DD` (Lima). */
  fecha: string;
  moverCaja: boolean;
  /** Cuánto se descuenta de lo que la persona debe de adelantos (0 = nada). */
  compensar: number;
  comprobantes: FotoCarga[];
  notas?: string;
}

type Partidas = { cruzable?: boolean; adelantos?: { saldo: number }[] };

/** La liquidación toca esta guía si alguno de sus movimientos la nombra. */
const tocaLaGuia = (l: LiquidacionDTO, gtf: string) =>
  (l.detalle?.movimientos ?? []).some(
    (m) => (m as { gtfNumber?: string | null }).gtfNumber === gtf,
  );

export function usePagoDeGuia(parteId: string | null, gtf: string) {
  const [huella, setHuella] = useState("");
  const [cruzable, setCruzable] = useState(false);
  const [adelantosTeDebe, setAdelantosTeDebe] = useState(0);
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionDTO[]>([]);
  const [cargando, setCargando] = useState(false);
  /* Una llave por INTENTO: tras un pago bueno se renueva, para que el segundo
     pago de la misma guía no vuelva «repetido» con la respuesta del primero. */
  const llave = useRef<string>(crypto.randomUUID());

  const cargar = useCallback(async () => {
    if (!parteId) return;
    setCargando(true);
    const q = `parte=${encodeURIComponent(parteId)}`;
    try {
      const [rp, rl] = await Promise.all([
        fetch(`/api/adelantos/cuentas/partidas?${q}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/adelantos/cuentas/liquidaciones?${q}&anuladas=1`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (rp.ok) {
        const j = (await rp.json()) as { partidas?: Partidas; huella?: string };
        setHuella(j.huella ?? "");
        setCruzable(Boolean(j.partidas?.cruzable));
        setAdelantosTeDebe(
          r2((j.partidas?.adelantos ?? []).reduce((t, a) => t + (Number(a.saldo) || 0), 0)),
        );
      }
      if (rl.ok) {
        const j = (await rl.json()) as { liquidaciones?: LiquidacionDTO[] };
        setLiquidaciones((j.liquidaciones ?? []).filter((l) => tocaLaGuia(l, gtf)));
      }
    } catch (e) {
      logger.warn("[plata-de-guia] no se pudo leer la cuenta para pagar", { error: String(e) });
    } finally {
      setCargando(false);
    }
  }, [parteId, gtf]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const registrar = useCallback(
    async (p: PagoGuiaInput): Promise<Resultado & { codigo?: string }> => {
      if (!parteId) return { ok: false, mensaje: "Primero elige a quién le pagas." };
      const guias = [
        ...(p.compensar > 0
          ? [{ gtfNumber: gtf, monto: r2(p.compensar), paso: "cruce" as const }]
          : []),
        ...(p.monto > 0 ? [{ gtfNumber: gtf, monto: r2(p.monto), paso: "pago" as const }] : []),
      ];
      try {
        const r = await fetch("/api/adelantos/cuentas/liquidaciones", {
          method: "POST",
          credentials: "include",
          headers: JSON_CSRF(),
          body: JSON.stringify({
            idempotencyKey: llave.current,
            persona: { parteId },
            fecha: p.fecha,
            compensar: r2(p.compensar),
            pago:
              p.monto > 0
                ? {
                    direccion: "hecho",
                    monto: r2(p.monto),
                    metodo: p.metodo,
                    moverCaja: p.moverCaja,
                  }
                : null,
            imputacion: { guias },
            comprobantes: p.comprobantes,
            notas: p.notas?.trim() || `Pago de la guía ${gtf}`,
            huella,
          }),
        });
        const b = (await r.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
          huella?: string;
          liquidacion?: { codigo?: string };
        };
        if (r.status === 409 && b.error === "plan_cambio") {
          if (b.huella) setHuella(b.huella);
          return {
            ok: false,
            mensaje:
              b.message ??
              "La cuenta cambió mientras la mirabas: revisa el monto y vuelve a registrar.",
          };
        }
        if (!r.ok)
          return { ok: false, mensaje: b.message ?? b.error ?? "No se pudo registrar el pago." };
        llave.current = crypto.randomUUID();
        await cargar();
        return { ok: true, codigo: b.liquidacion?.codigo };
      } catch (e) {
        logger.error("[plata-de-guia] registrar pago falló", { error: String(e) });
        return { ok: false, mensaje: "Sin conexión: el pago no se registró." };
      }
    },
    [parteId, gtf, huella, cargar],
  );

  return { cargando, cruzable, adelantosTeDebe, liquidaciones, registrar, recargar: cargar };
}
