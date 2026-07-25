"use client";

/**
 * Anexo04Origen — de dónde salen las piezas del anexo: el lote que está en el
 * cubicador ahora, o cualquier **cubicación guardada**. Este selector es lo que
 * permite emitir el ANEXO N° 04 de un despacho pasado (o desde el Libro CTP,
 * donde no hay lote en pantalla): el Libro guarda especie, producto y volumen,
 * pero las medidas pieza por pieza (E · A · L) solo existen en la cubicación.
 */
import { useEffect, useState } from "react";
import { Loader2, PackageOpen } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

export const ORIGEN_ACTUAL = "actual";

const fecha = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }); }
  catch { return iso.slice(0, 10); }
};

export default function Anexo04Origen({
  piezasActuales, valor, despachoId, onCambio,
}: {
  /** Cuántas piezas tiene el lote abierto en el cubicador (0 = ninguno). */
  piezasActuales: number;
  valor: string;
  /** Despacho del Libro desde el que se abrió: marca y auto-elige su cubicación. */
  despachoId?: string;
  /** Devuelve el id elegido y las piezas de esa cubicación (null = lote actual). */
  onCambio: (id: string, piezas: PiezaCubicada[] | null, registro?: CubicacionRegistro) => void;
}) {
  const [guardadas, setGuardadas] = useState<CubicacionRegistro[]>([]);
  const [sugeridas, setSugeridas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const url = despachoId
      ? `/api/admin/forestal/cubicaciones?despachoId=${encodeURIComponent(despachoId)}`
      : "/api/admin/forestal/cubicaciones";
    fetch(url, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cubicaciones: [] }))
      .then((j: { cubicaciones?: CubicacionRegistro[]; sugeridas?: string[] }) => {
        if (!vivo) return;
        const lista = j.cubicaciones ?? [];
        const ids = j.sugeridas ?? [];
        // Las que originaron ESTE despacho van primero y se eligen solas: es el
        // caso normal cuando la madera se cubicó con la herramienta.
        setGuardadas([...lista.filter((c) => ids.includes(c.id)), ...lista.filter((c) => !ids.includes(c.id))]);
        setSugeridas(ids);
        const auto = lista.find((c) => ids.includes(c.id));
        if (auto && piezasActuales === 0) onCambio(auto.id, auto.piezas, auto);
      })
      // Sin historial (o sin red) el selector queda con el lote actual: es una
      // ayuda, no un requisito para emitir el anexo.
      .catch(() => { if (vivo) setGuardadas([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se pide una vez por despacho
  }, [despachoId]);

  const elegir = (id: string) => {
    if (id === ORIGEN_ACTUAL) { onCambio(id, null); return; }
    const c = guardadas.find((g) => g.id === id);
    onCambio(id, c?.piezas ?? [], c);
  };

  return (
    <label className="flex min-w-0 flex-1 items-center gap-2">
      <span className="inline-flex shrink-0 items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageOpen className="h-3.5 w-3.5" />} Piezas
      </span>
      <select
        value={valor}
        onChange={(e) => elegir(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      >
        <option value={ORIGEN_ACTUAL}>
          {piezasActuales > 0 ? `Lote actual del cubicador (${piezasActuales} medidas)` : "Lote actual del cubicador (vacío)"}
        </option>
        {guardadas.map((c) => (
          <option key={c.id} value={c.id}>
            {sugeridas.includes(c.id) ? "★ de este despacho · " : ""}
            {c.nombre} · {fecha(c.fecha)} · {c.totales.piezas} pzas{c.cliente ? ` · ${c.cliente}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
