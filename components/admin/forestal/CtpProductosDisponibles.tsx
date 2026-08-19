"use client";

/**
 * Productos disponibles — la madera aserrada que sigue en la planta (ADR-349).
 *
 * El libro sabía cuánto se produjo y cuánto se despachó, pero para saber **qué
 * hay hoy** había que restar dos columnas de dos pantallas distintas. Acá está
 * el resultado: cada corrida con saldo, con sus paquetes —código, presentación y
 * dimensiones— que es como se encuentra el producto en la pila.
 *
 * El saldo NO se calcula acá: lo da `saldosDeCorridas`, la única fuente
 * (ADR-316). Una segunda cuenta sería una segunda verdad.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Layers, PackageOpen, RefreshCw, Ruler, Search, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { IconAction, productLabel } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";
import CtpPaqueteFicha from "./CtpPaqueteFicha";
import CtpReprocesoModal from "./CtpReprocesoModal";
import CtpCubicarProductoModal from "./CtpCubicarProductoModal";
import CtpBarraSeleccion from "./ctp-barra-seleccion";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { FilaDeclarada } from "@/lib/forestal/cubicacion-cuadre";

interface PaqueteDisponible {
  id: string;
  codigo: string;
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string | null;
}

interface CorridaDisponible {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  lote: string | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  disponible: number;
  paquetes: PaqueteDisponible[];
}

type FilaTabla = { corrida: CorridaDisponible; paquete: PaqueteDisponible | null };

/** La clave de una fila: el paquete si lo hay, la corrida si no. */
const claveFila = (f: FilaTabla) => f.paquete?.id ?? f.corrida.id;

const nf = (n: number) => n.toLocaleString("es-PE");
const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

const fmtDia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const CAMPO =
  "h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function CtpProductosDisponibles({ period }: { period: CtpPeriod }) {
  const [corridas, setCorridas] = useState<CorridaDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState("");
  const [producto, setProducto] = useState("");
  /** Ficha del paquete abierta desde su código (ADR-366). */
  const [fichaPaquete, setFichaPaquete] = useState<string | null>(null);
  /** Producto que vuelve a la sierra (ADR-316). */
  const [reprocesar, setReprocesar] = useState<CorridaDisponible | null>(null);
  /** Fila que se está cubicando para el ANEXO N° 04. */
  const [cubicar, setCubicar] = useState<{ corrida: CorridaDisponible; paquete: PaqueteDisponible | null } | null>(null);
  /**
   * Filas tildadas para cubicar en conjunto (ADR-369).
   *
   * La clave es la del PAQUETE cuando lo hay y la de la corrida cuando no: es la
   * misma que dibuja la fila, así que tildar y mirar hablan de lo mismo.
   */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /** El modal abierto para cubicar TODO lo tildado. */
  const [cubicarConjunto, setCubicarConjunto] = useState(false);
  /** Lo que pasó tras una acción de la fila: se dice arriba y no en un toast que
   *  se va antes de que el operador levante la vista de la tabla. */
  const [nota, setNota] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    const qs = applyCtpPeriodParams(new URLSearchParams({ disponibles: "1" }), period);
    try {
      const r = await ctpGet<{ corridas?: CorridaDisponible[] }>(`/api/admin/forestal/ctp?${qs}`);
      setCorridas(r.corridas ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => { void recargar(); }, [recargar]);

  const opciones = useMemo(() => {
    const especies = [...new Set(corridas.map((c) => (c.especie ?? "").trim()).filter(Boolean))].sort();
    const productos = [...new Set(corridas.map((c) => (c.producto ?? "").trim()).filter(Boolean))].sort();
    return { especies, productos };
  }, [corridas]);

  const visibles = useMemo(() => {
    const q = norm(texto);
    return corridas.filter((c) => {
      if (especie && norm(c.especie) !== norm(especie)) return false;
      if (producto && norm(c.producto) !== norm(producto)) return false;
      if (q) {
        const campos = [c.especie, c.producto, c.lote, ...c.paquetes.map((p) => p.codigo)];
        if (!campos.some((x) => norm(x).includes(q))) return false;
      }
      return true;
    });
  }, [corridas, texto, especie, producto]);

  /* La fila es el PAQUETE: es lo que se busca en la pila y lo que se cita en la
     guía de salida. Las corridas sin paquetes cargados —las viejas— entran como
     una fila con su saldo, para que no desaparezca producto que existe. */
  const filas = useMemo(
    () =>
      visibles.flatMap((c) =>
        c.paquetes.length > 0
          ? c.paquetes.map((p) => ({ corrida: c, paquete: p }))
          : [{ corrida: c, paquete: null as PaqueteDisponible | null }],
      ),
    [visibles],
  );
  const { visibles: enPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(filas);

  /** Lo tildado, con la forma que pide `cuadrarConjunto`. */
  const elegidas = useMemo<FilaDeclarada[]>(
    () =>
      filas
        .filter((f) => seleccion.has(claveFila(f)))
        .map((f) => ({
          id: claveFila(f),
          etiqueta: f.paquete?.codigo ?? `Corrida N° ${f.corrida.lineNo ?? "—"}`,
          especie: f.corrida.especie,
          producto: f.paquete?.producto ?? f.corrida.producto,
          /* Del paquete si lo hay; si no, lo que la corrida todavía tiene. */
          piezas: f.paquete?.cantidad ?? null,
          volumenM3: f.paquete?.volumenM3 ?? f.corrida.disponible,
        })),
    [filas, seleccion],
  );
  const totalElegido = useMemo(
    () => ({
      piezas: elegidas.reduce((a, f) => a + (f.piezas ?? 0), 0),
      m3: Math.round(elegidas.reduce((a, f) => a + (f.volumenM3 ?? 0), 0) * 10_000) / 10_000,
      corridas: [...new Set(filas.filter((f) => seleccion.has(claveFila(f))).map((f) => f.corrida.id))],
    }),
    [elegidas, filas, seleccion],
  );

  const totales = useMemo(
    () => ({
      volumen: Math.round(visibles.reduce((a, c) => a + c.disponible, 0) * 10000) / 10000,
      paquetes: visibles.reduce((a, c) => a + c.paquetes.length, 0),
      especies: new Set(visibles.map((c) => norm(c.especie)).filter(Boolean)).size,
      productos: new Set(visibles.map((c) => norm(c.producto)).filter(Boolean)).size,
    }),
    [visibles],
  );

  if (error) {
    return (
      <p className="rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
        No se pudieron leer los productos disponibles: {error}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          density="compact"
          label="Disponible (m³)"
          value={totales.volumen.toFixed(4)}
          subValue="Producido − despachado − reprocesado"
          icon={TreePine}
          emphasis="success"
        />
        <StatCard
          density="compact"
          label="Paquetes en planta"
          value={nf(totales.paquetes)}
          subValue={totales.paquetes === 0 ? "Sin paquetes cargados" : "Con su código y sus medidas"}
          icon={Boxes}
          emphasis="neutral"
        />
        <StatCard density="compact" label="Especies" value={nf(totales.especies)} subValue="Distintas en stock" icon={Layers} emphasis="neutral" />
        <StatCard
          density="compact"
          label="Corridas con saldo"
          value={nf(visibles.length)}
          subValue="Producción que todavía no salió"
          icon={PackageOpen}
          emphasis="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código de paquete, especie o lote…"
            aria-label="Buscar un producto disponible"
            className={`${CAMPO} pl-9`}
          />
        </label>
        <select value={especie} onChange={(e) => setEspecie(e.target.value)} aria-label="Filtrar por especie" className={CAMPO}>
          <option value="">Todas las especies</option>
          {opciones.especies.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={producto} onChange={(e) => setProducto(e.target.value)} aria-label="Filtrar por producto" className={CAMPO}>
          <option value="">Todos los productos</option>
          {opciones.productos.map((p) => <option key={p} value={p}>{productLabel(p)}</option>)}
        </select>
      </div>

      {nota && (
        <p role="status" className="rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          {nota}
        </p>
      )}

      <TablaCtp>
        <TheadCtp>
          <tr>
            <th className="w-10 px-2 py-2">
              {/* Tildar todo lo que se está viendo: con el filtro puesto, «todo»
                  es lo filtrado y no las 500 corridas del período. */}
              <input
                type="checkbox"
                aria-label="Elegir todas las filas visibles"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={enPagina.length > 0 && enPagina.every((f) => seleccion.has(claveFila(f)))}
                onChange={(e) =>
                  setSeleccion((prev) => {
                    const s = new Set(prev);
                    for (const f of enPagina) {
                      if (e.target.checked) s.add(claveFila(f));
                      else s.delete(claveFila(f));
                    }
                    return s;
                  })
                }
              />
            </th>
            <th className="px-3 py-2 font-bold">Código paquete</th>
            <th className="px-3 py-2 font-bold">Producto</th>
            <th className="px-3 py-2 font-bold">Especie</th>
            <th className="px-3 py-2 font-bold">Presentación</th>
            <th className="px-3 py-2 font-bold">Medidas</th>
            <th className="px-3 py-2 text-right font-bold">Piezas</th>
            <th className="px-3 py-2 text-right font-bold">Volumen</th>
            <th className="px-3 py-2 font-bold">Corrida / lote</th>
            <th className="px-3 py-2 text-right font-bold">Pie tablar</th>
            <th className="px-3 py-2 text-right font-bold">Saldo corrida</th>
            <th className="px-3 py-2 text-right font-bold">Acciones</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {enPagina.length === 0 && (
            <FilaVacia cols={12}>
              {cargando
                ? "Leyendo la planta…"
                : corridas.length === 0
                  ? "No hay producto disponible: todo lo aserrado ya salió o todavía no se declaró ninguna producción."
                  : "Ningún producto coincide con el filtro."}
            </FilaVacia>
          )}
          {enPagina.map(({ corrida: c, paquete: p }) => (
            <tr key={p ? p.id : c.id} className="hover:bg-[var(--surface-sunken)]">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  aria-label={`Elegir ${p?.codigo ?? `la corrida N° ${c.lineNo ?? "—"}`}`}
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={seleccion.has(claveFila({ corrida: c, paquete: p }))}
                  onChange={(e) =>
                    setSeleccion((prev) => {
                      const s = new Set(prev);
                      const k = claveFila({ corrida: c, paquete: p });
                      if (e.target.checked) s.add(k); else s.delete(k);
                      return s;
                    })
                  }
                />
              </td>
              <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                {/* El código abre la ficha del paquete (ADR-366): es el número
                    que alguien tiene delante y la puerta a su origen. */}
                {p?.codigo ? (
                  <button
                    type="button"
                    onClick={() => setFichaPaquete(p.codigo)}
                    title={`Ver de qué corrida y de qué madera salió ${p.codigo}`}
                    className="rounded-lg underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--accent)]"
                  >
                    {p.codigo}
                  </button>
                ) : (
                  <span className="font-sans text-[var(--text-tertiary)]">sin paquete</span>
                )}
              </td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{productLabel(p?.producto ?? c.producto ?? "")}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{c.especie ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--text-tertiary)]">{p?.presentacion ?? c.presentacion ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                {p?.espesorCm && p?.anchoCm && p?.largoM
                  ? `${p.espesorCm} × ${p.anchoCm} cm · ${p.largoM} m`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                {p ? nf(p.cantidad) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {(p?.volumenM3 ?? c.disponible).toFixed(4)}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">
                <span className="font-mono">N° {c.lineNo ?? "—"}</span>
                {c.lote && <span className="ml-1 font-mono">· {c.lote}</span>}
                <div>{fmtDia(c.fecha)}</div>
              </td>
              {/* Pie tablar: es la unidad en la que se canta y se vende en el
                  patio; el libro guarda m³ y la conversión se hacía aparte. */}
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                {pieTablarDe(p?.volumenM3 ?? c.disponible).toLocaleString("es-PE")}
              </td>
              <td className="px-3 py-2 text-right">
                <span className="font-mono font-bold tabular-nums text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  {c.disponible.toFixed(4)}
                </span>
                {c.despachado > 0 && (
                  <div className="font-mono text-xs text-[var(--text-tertiary)]">
                    de {c.producido.toFixed(4)} · salió {c.despachado.toFixed(4)}
                  </div>
                )}
              </td>
              {/**
               * Qué se puede HACER con esta madera, en la fila donde se la mira
               * (ADR-367). Antes la vista era sólo de consulta: para reprocesar
               * o para cubicar había que salir a otra pestaña y volver a buscar
               * el producto.
               */}
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <IconAction
                    icon={PackageOpen}
                    tone="muted"
                    disabled={!p?.codigo}
                    onClick={() => p?.codigo && setFichaPaquete(p.codigo)}
                    label={p?.codigo ? `Ficha de ${p.codigo}: de qué corrida y de qué madera salió` : "Sin paquete: no hay ficha"}
                  />
                  <IconAction
                    icon={Ruler}
                    tone="info"
                    onClick={() => setCubicar({ corrida: c, paquete: p })}
                    label="Cubicar: medir pieza por pieza, cuadrar contra el libro y guardar (sale el ANEXO N° 04)"
                  />
                  <IconAction
                    icon={RefreshCw}
                    tone="accent"
                    disabled={c.disponible <= 0}
                    onClick={() => setReprocesar(c)}
                    label={
                      c.disponible > 0
                        ? "Reprocesar: vuelve a la sierra y sale como otro producto"
                        : "Sin saldo disponible para reprocesar"
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </TbodyCtp>
      </TablaCtp>

      <CtpPaginacion
        rango={rango}
        porPagina={porPagina}
        onPorPagina={setPorPagina}
        onIr={ir}
        sustantivo="paquete"
        extra={<span className="font-mono tabular-nums">{totales.volumen.toFixed(4)} m³ disponibles</span>}
      />
    {/* De un código de la pila a su corrida y a la madera con la que se hizo. */}
      {fichaPaquete && <CtpPaqueteFicha codigo={fichaPaquete} onClose={() => setFichaPaquete(null)} />}

      {/**
       * Cubicar el camión entero (ADR-369): se mide una vez y se cuadra contra
       * TODO lo tildado, especie por especie. Lo que sobra de una especie no
       * puede tapar lo que falta de otra, y eso sólo se ve mirando el conjunto.
       */}
      {cubicarConjunto && (
        <CtpCubicarProductoModal
          ctpEntryIds={totalElegido.corridas}
          titulo={`Cubicar ${elegidas.length} registro(s) · ${totalElegido.m3.toFixed(4)} m³`}
          filas={elegidas}
          onClose={() => setCubicarConjunto(false)}
          onGuardada={(msg) => { setCubicarConjunto(false); setSeleccion(new Set()); setNota(msg); }}
        />
      )}

      {seleccion.size > 0 && (
        <CtpBarraSeleccion
          cifras={[
            { label: "Registros", valor: `${elegidas.length}` },
            { label: "Piezas", valor: `${totalElegido.piezas}` },
            { label: "Volumen", valor: `${totalElegido.m3.toFixed(4)} m³`, fuerte: true },
            { label: "Pie tablar", valor: `${pieTablarDe(totalElegido.m3).toLocaleString("es-PE")} pt` },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
          accionLabel="Cubicar madera"
          accionIcon={Ruler}
          onAccion={() => setCubicarConjunto(true)}
        />
      )}

      {reprocesar && (
        <CtpReprocesoModal
          origen={{
            id: reprocesar.id,
            lineNo: reprocesar.lineNo,
            especie: reprocesar.especie,
            producto: reprocesar.producto,
            unidad: reprocesar.unidad,
            disponible: reprocesar.disponible,
          }}
          onClose={() => setReprocesar(null)}
          onListo={(msg, detalle) => {
            setReprocesar(null);
            setNota(`${msg} — ${detalle}`);
            /* La madera dejó de estar disponible: la lista tiene que decirlo ya. */
            void recargar();
          }}
        />
      )}

      {/**
       * Cubicar el producto (ADR-368): se mide pieza por pieza con las mismas
       * fórmulas del cubicador, se CUADRA contra lo que el libro declara —tipo,
       * especie, piezas y volumen— y se guarda ligado a la corrida. De ahí sale
       * el ANEXO N° 04, que es el papel que detalla lo que la guía resume.
       */}
      {cubicar && (
        <CtpCubicarProductoModal
          ctpEntryIds={[cubicar.corrida.id]}
          titulo={cubicar.paquete?.codigo ?? `Corrida N° ${cubicar.corrida.lineNo ?? "—"}`}
          filas={[
            {
              id: cubicar.paquete?.id ?? cubicar.corrida.id,
              etiqueta: cubicar.paquete?.codigo ?? `Corrida N° ${cubicar.corrida.lineNo ?? "—"}`,
              especie: cubicar.corrida.especie,
              producto: cubicar.paquete?.producto ?? cubicar.corrida.producto,
              piezas: cubicar.paquete?.cantidad ?? null,
              volumenM3: cubicar.paquete?.volumenM3 ?? cubicar.corrida.disponible,
            },
          ]}
          onClose={() => setCubicar(null)}
          onGuardada={(msg) => { setCubicar(null); setNota(msg); }}
        />
      )}
    </div>
  );
}
