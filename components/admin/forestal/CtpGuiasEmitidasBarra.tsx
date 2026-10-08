"use client";

/**
 * La barra de las guías tildadas en «Guías emitidas» del Libro CTP: la misma
 * de la vista GTF del Libro TH (`GuiasAFormatoBarra`) con las cuentas del
 * CTP. El despacho declara producto en SU unidad —pie tablar, m³, unidades—,
 * así que se cuenta por unidad (PT → m³ → unidades) y no se convierte: un pt
 * pasado a m³ sería un derivado presentado como dato.
 *
 * Los ids viajan con `ctp:` (`refGuia`): Trámites los pide al Libro CTP.
 *
 * El permiso de cada guía no viene en la bandeja: se pregunta al elegir
 * (`guias-emitidas?ids=`, el mismo detalle que lee Trámites) para avisar antes
 * de salir del libro «van N permisos → N oficios» (08-10).
 */

import { useEffect, useMemo, useState } from "react";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { agruparPorGuia, cantidadesPorUnidad, type CantidadPorUnidad, type GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import type { GuiaElegida } from "@/lib/forestal/tramites-desde-guias";
import { avisoDePermisos, permisosDeLasGuias, type GuiaConPermiso } from "@/lib/forestal/tramites-permiso";
import type { CifraSeleccion } from "./ctp-barra-seleccion";
import GuiasAFormatoBarra from "./GuiasAFormatoBarra";
import { refGuia } from "./tramite-guias-url";

const cifraDe = ({ unidad, total }: CantidadPorUnidad): CifraSeleccion => {
  if (unidad === "pt") return { label: "Pie tablar", valor: `${fmtPt(total)} pt` };
  if (unidad === "m3") return { label: "Volumen", valor: `${fmtM3(total)} m³` };
  if (unidad === "unidad") return { label: "Unidades", valor: String(total) };
  return { label: unidad === "kg" ? "Peso" : unidad, valor: unidad === "kg" ? `${total} kg` : String(total) };
};

/** El aviso de permisos de las líneas elegidas: pide su detalle (con espera, para no pedir en cada tilde). */
function useAvisoDePermisos(despachoIds: readonly string[]): string | null {
  const clave = useMemo(() => [...new Set(despachoIds)].sort().join(","), [despachoIds]);
  const [aviso, setAviso] = useState<{ clave: string; texto: string | null } | null>(null);
  useEffect(() => {
    if (!clave) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/forestal/ctp/guias-emitidas?ids=${encodeURIComponent(clave)}`, { credentials: "include", signal: ac.signal })
        .then(async (r) => (r.ok ? (((await r.json()) as { guias?: GuiaConPermiso[] }).guias ?? []) : []))
        .then((guias) => setAviso({ clave, texto: avisoDePermisos(permisosDeLasGuias(guias)) }))
        .catch((err: unknown) => {
          if (!ac.signal.aborted) console.warn("[guias-emitidas] no se pudo leer el permiso de las guías elegidas", err);
        });
    }, 400);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [clave]);
  return aviso && aviso.clave === clave ? aviso.texto : null;
}

export default function CtpGuiasEmitidasBarra({ elegidas, onLimpiar }: { elegidas: readonly GuiaEmitida[]; onLimpiar: () => void }) {
  /* `elegidas` son LÍNEAS de despacho; se cuenta y se decide por GUÍA (una GTF
     puede amparar varias líneas). El CTP dice «estado», los formatos leen «status». */
  const guias = useMemo(() => agruparPorGuia(elegidas), [elegidas]);
  const ids = useMemo(() => elegidas.map((g) => g.despachoId), [elegidas]);
  const aviso = useAvisoDePermisos(ids);
  const paraFormatos = useMemo<GuiaElegida[]>(
    () => guias.map((g) => ({ gtfNumber: g.gtfNumber, status: g.anulada ? "anulada" : "emitida" })),
    [guias],
  );
  if (guias.length === 0) return null;

  const anuladas = guias.filter((g) => g.anulada).length;
  const cifras: CifraSeleccion[] = [
    {
      label: guias.length === 1 ? "Guía" : "Guías",
      valor: anuladas > 0 ? `${guias.length} (${anuladas} anulada${anuladas === 1 ? "" : "s"})` : String(guias.length),
      fuerte: true,
    },
    /* Vista previa: lo que se declara lo arma el trámite con lo que da el servidor. */
    ...cantidadesPorUnidad(elegidas).map(cifraDe),
  ];

  return (
    <GuiasAFormatoBarra
      elegidas={paraFormatos}
      refs={elegidas.map((g) => refGuia("ctp", g.despachoId))}
      cifras={cifras}
      onLimpiar={onLimpiar}
      aviso={aviso}
    />
  );
}
