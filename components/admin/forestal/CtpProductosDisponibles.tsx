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

import { useEffect, useMemo, useState } from "react";
import { Boxes, Layers, PackageOpen, Search, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { productLabel } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";

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

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const p = applyCtpPeriodParams(new URLSearchParams({ disponibles: "1" }), period);
    ctpGet<{ corridas?: CorridaDisponible[] }>(`/api/admin/forestal/ctp?${p}`)
      .then((r) => {
        if (!vivo) return;
        setCorridas(r.corridas ?? []);
        setError(null);
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [period]);

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

      <TablaCtp>
        <TheadCtp>
          <tr>
            <th className="px-3 py-2 font-bold">Código paquete</th>
            <th className="px-3 py-2 font-bold">Producto</th>
            <th className="px-3 py-2 font-bold">Especie</th>
            <th className="px-3 py-2 font-bold">Presentación</th>
            <th className="px-3 py-2 font-bold">Medidas</th>
            <th className="px-3 py-2 text-right font-bold">Piezas</th>
            <th className="px-3 py-2 text-right font-bold">Volumen</th>
            <th className="px-3 py-2 font-bold">Corrida / lote</th>
            <th className="px-3 py-2 text-right font-bold">Saldo corrida</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {enPagina.length === 0 && (
            <FilaVacia cols={9}>
              {cargando
                ? "Leyendo la planta…"
                : corridas.length === 0
                  ? "No hay producto disponible: todo lo aserrado ya salió o todavía no se declaró ninguna producción."
                  : "Ningún producto coincide con el filtro."}
            </FilaVacia>
          )}
          {enPagina.map(({ corrida: c, paquete: p }) => (
            <tr key={p ? p.id : c.id} className="hover:bg-[var(--surface-sunken)]">
              <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                {p?.codigo ?? <span className="font-sans text-[var(--text-tertiary)]">sin paquete</span>}
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
    </div>
  );
}
