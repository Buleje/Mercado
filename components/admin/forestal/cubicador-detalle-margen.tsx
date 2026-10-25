"use client";

/**
 * «Margen del camión» en el detalle de una cubicación guardada (Brandon 24-10):
 * a cuánto le compraste a la comunidad, a cuánto le vendiste al comprador, y
 * cuánto ganaste por PT y por el camión. Los montos salen de las cuentas (la
 * base) o del valor de la guardada; el margen es de pantalla y no se guarda.
 * Lo único que se anota es el precio de compra por PT escrito a mano (24-10,
 * sólo admin y dueño): dato del dueño en ESTA guardada, que no mueve plata.
 * Cada número dice de dónde sale, y un derivado se dice que lo es.
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Pencil, Save, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { CompraAMano, CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import {
  precioEscrito, type ComercialParaMargen, type CompraDelCamion, type EleccionDeCompra, type MargenArmado, type MargenDelCamion, type VentaDelCamion,
} from "@/lib/forestal/cubicacion-margen";
import { fmtM3, fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { useMargenDelCamion } from "./hooks/use-margen-del-camion";
import type { PiezasDeLaGuia } from "./cubicador-detalle-rendimiento";
import type { EstadoDeLaGuia } from "./hooks/use-rendimiento-de-guia";
import { CAMPO_CUENTA, ETIQUETA_CUENTA } from "./cubicacion-cuenta-persona";
import { conSigno } from "./cubicador-detalle-ficha";
import { AVISO, Caja, NEUTRO, OK, TXT_AVISO, TXT_OK } from "./cubicador-detalle-rendimiento";
import { KpiResumen } from "./resumen-tabla";

const soles = (n: number) => `S/ ${fmtSoles(n)}`;
/** Soles de una tarjeta angosta: con céntimos hasta S/ 100, enteros desde ahí («1,400»). */
const solesCortos = (n: number) => (Math.abs(n) < 100 ? fmtSoles(n) : formatNumber(n, 0));
const diaMes = (f: string) => (/^\d{4}-\d{2}-\d{2}/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : f);
/** «guardado el 24/10 por qaadmin»: el día en Lima (a las 20:00 de Pucallpa el UTC ya es mañana). */
const guardadoEl = (a: CompraAMano) => `guardado el ${diaMes(limaDateKey(a.fecha))} por ${a.por}`;
/** El precio escrito es el mismo que está anotado (al céntimo, como lo guarda el servidor). */
const esElAnotado = (n: number | null, a: CompraAMano | null) => n !== null && a !== null && Math.round(n * 100) === Math.round(a.precioPt * 100);
const personasDe = (cubs: readonly ComercialParaMargen[]) =>
  [...new Set(cubs.map((c) => c.personaNombre?.trim()).filter(Boolean))].join(", ") || "sin nombre";
const volumenDe = (vol: number, unidad: "PT" | "m³" | null, troza: boolean) =>
  unidad === "m³" ? `${fmtM3(vol)} m³ de troza` : `${fmtPt(vol)} PT${troza ? " de troza (Oxapampina)" : ""}`;

/** «CUB-2026-0040 · 24/10 · CCNN QA · 60 PT · S/ 150,00» (o «sin valorizar»). */
function etiquetaDeCompra(c: ComercialParaMargen): string {
  const vol = volumenDe(c.volumen, c.unidad, c.material === "troza");
  return [c.codigo, diaMes(c.fecha), c.personaNombre ?? "sin nombre", vol, c.monto != null && c.monto > 0 ? soles(c.monto) : "sin valorizar"].join(" · ");
}

/* Por la GTF (sin atar a este lote: precio por PT × los PT de ESTE camión) o convertida (troza → PT): derivada. */
const esDerivada = (c: CompraDelCamion) => c.origen === "guia" || c.conversion.tipo !== "directa";

function frase(v: VentaDelCamion, compra: CompraDelCamion, m: MargenDelCamion): { tono: string; texto: string } {
  const cobrada = v.fuente === "cuenta";
  /* Un precio por PT convertido (troza → aserrado) es derivado: «≈», y el camión manda (0,66 × 2.000 ≠ 1.326,60). */
  const aprox = esDerivada(compra) ? "≈ " : "";
  const inicio = `Compraste a ${aprox}${soles(compra.porPt)} y ${cobrada ? "vendiste" : "lo pusiste"} a ${soles(v.porPt)} el PT`;
  if (m.camion === 0) return { tono: NEUTRO, texto: `${inicio}: quedas en cero.` };
  const gana = m.camion > 0;
  const verbo = gana ? (cobrada ? "ganaste" : "ganarías") : cobrada ? "perdiste" : "perderías";
  const pct = m.pct !== null ? ` (${fmtPct(Math.abs(m.pct))} % de la venta)` : "";
  return { tono: gana ? OK : AVISO, texto: `${inicio}: ${verbo} ${aprox}${soles(Math.abs(m.porPt))} por PT, ${soles(Math.abs(m.camion))} el camión${pct}.` };
}

function lineaDeVenta(v: VentaDelCamion): string {
  const cuanto = `${soles(v.total)} por ${fmtPt(v.pt)} PT`;
  if (v.fuente === "cuenta" && v.cub) {
    return `${v.cub.codigo} en la cuenta de ${personasDe([v.cub])}, ${v.cub.estado === "aplicada" ? "descontada" : "sin descontar"}: ${cuanto} (de la base).`;
  }
  const enCuenta = v.cub ? ` ${v.cub.codigo} está en la cuenta de ${personasDe([v.cub])} sin valorizar.` : "";
  return `precio puesto en el cubicador (no encuentro su venta valorizada en la cuenta): ${cuanto}.${enCuenta}`;
}

function lineaDeCompra(c: CompraDelCamion, gtf: string | undefined, anotado: CompraAMano | null): string {
  if (c.origen === "a-mano") {
    return esElAnotado(c.porPt, anotado) && anotado
      ? `${soles(c.porPt)} por PT, anotado a mano (${guardadoEl(anotado)}); no sale de las cuentas.`
      : `${soles(c.porPt)} por PT, escrito a mano (todavía sin guardar).`;
  }
  const deDonde = c.origen === "lote" ? "del mismo lote" : c.origen === "guia" ? `con la misma GTF ${gtf ?? ""}` : "elegida por ti";
  const cuanto = `${soles(c.monto ?? 0)} por ${volumenDe(c.volumen ?? 0, c.unidad, c.conversion.tipo === "oxapampina")}`;
  const inicio = `${c.cubs.map((x) => x.codigo).join(" + ")} de ${personasDe(c.cubs)}, ${deDonde}: ${cuanto}`;
  switch (c.conversion.tipo) {
    case "directa":
      return c.origen === "guia"
        ? `${inicio} = ≈ ${soles(c.porPt)} por PT, por los PT de este camión (derivado: la compra no está atada a este lote).`
        : `${inicio} (de la base).`;
    case "oxapampina": return `${inicio}; se compara PT con PT, sin rendimiento (derivado).`;
    case "rendimiento":
      return `${inicio} = ${soles(c.conversion.porM3)} el m³, convertida con el ${fmtPct(c.conversion.pct)} % de rendimiento de la GTF ${c.conversion.gtf}${(c.conversion.camiones ?? 1) > 1 ? ` (sus ${c.conversion.camiones} cubicaciones juntas)` : ""}: ≈ ${soles(c.porPt)} por PT aserrado (derivado).`;
  }
}

function faltaLaCompra(c: CubicacionRegistro, conComunidad: boolean, candidatas: number): string {
  const gtf = c.gtfNumber?.trim();
  const comunidad = c.ficha?.comunidad?.trim() || "la comunidad";
  if (!conComunidad) {
    /* Sin la comunidad no se toma sola una compra por la GTF: podría ser de otra persona. */
    return `La ficha no tiene la comunidad del Directorio, así que no tomo sola una compra${gtf ? ` con la GTF ${gtf}` : ""}: elígela de la lista o escribe el precio por PT.`;
  }
  if (candidatas === 0) return `No le encuentro compras a ${comunidad} en las cuentas: escribe el precio por PT a mano.`;
  return `No encuentro la compra a ${comunidad}${gtf ? ` con la GTF ${gtf}` : ""}: elígela de sus compras o escribe el precio por PT.`;
}

type Anotar = {
  anotado: CompraAMano | null;
  guardando: boolean;
  errorAlAnotar: string | null;
  anotar: (precioPt: number | null) => Promise<boolean>;
  borrarAnotado: () => Promise<void>;
  /** Admin y dueño (el servidor frena igual a los demás). */
  puedeAnotar: boolean;
};

/** Guardar el precio escrito, o cambiarlo/borrarlo si ya hay uno anotado. */
function AnotarPrecio({ precioAMano, a }: { precioAMano: string; a: Anotar }) {
  const n = precioEscrito(precioAMano);
  const igual = esElAnotado(n, a.anotado);
  return (
    <div className="space-y-1.5 sm:col-span-2">
      {a.puedeAnotar && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void a.anotar(n)}
            disabled={n === null || igual || a.guardando}
            className={button({ variant: "accent", size: "md", className: "gap-1.5 px-4" })}
            title={n === null ? "Escribe un precio por PT" : igual ? "Ya es el precio guardado" : undefined}
          >
            <Save className="h-4 w-4" aria-hidden /> {a.anotado ? "Guardar el precio nuevo" : "Guardar este precio"}
          </button>
          {a.anotado && (
            <button type="button" onClick={() => void a.borrarAnotado()} disabled={a.guardando} className={button({ variant: "secondary", size: "md", className: "gap-1.5 px-4" })}>
              <Trash2 className="h-4 w-4" aria-hidden /> Borrar el precio guardado
            </button>
          )}
        </div>
      )}
      {a.anotado && (
        <p className="text-sm text-[var(--text-secondary)]" data-precio-anotado={a.anotado.precioPt}>
          {igual ? "Precio " : `El guardado es S/ ${fmtSoles(a.anotado.precioPt)}, `}{guardadoEl(a.anotado)}.
        </p>
      )}
      {a.errorAlAnotar && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{a.errorAlAnotar}</p>}
    </div>
  );
}

function ElegirCompra({ m, eleccion, setEleccion, precioAMano, setPrecioAMano, a }: {
  m: MargenArmado;
  eleccion: EleccionDeCompra;
  setEleccion: (v: EleccionDeCompra) => void;
  precioAMano: string;
  setPrecioAMano: (v: string) => void;
  a: Anotar;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block min-w-0">
        <span className={ETIQUETA_CUENTA}>Compra a la comunidad</span>
        <select className={CAMPO_CUENTA} value={eleccion} onChange={(e) => setEleccion(e.target.value)}>
          <option value="">{m.calza ? `La que calza: ${m.calza.cubs.map((c) => c.codigo).join(" + ")}` : "Elige la compra…"}</option>
          {m.candidatas.filter((c) => !m.calza?.cubs.some((x) => x.id === c.id)).map((c) => (
            <option key={c.id} value={c.id}>{etiquetaDeCompra(c)}</option>
          ))}
          <option value="mano">Escribir el precio por PT a mano</option>
        </select>
      </label>
      {eleccion === "mano" && (
        <label className="block min-w-0">
          <span className={ETIQUETA_CUENTA}>Precio de compra por PT (S/)</span>
          <input
            className={CAMPO_CUENTA}
            inputMode="decimal"
            placeholder="1,80"
            value={precioAMano}
            onChange={(e) => setPrecioAMano(e.target.value.slice(0, 12))}
          />
        </label>
      )}
      {eleccion === "mano" && <AnotarPrecio precioAMano={precioAMano} a={a} />}
    </div>
  );
}

function ConMargen({ v, compra, m, anotado }: { v: VentaDelCamion; compra: CompraDelCamion; m: MargenDelCamion; anotado: CompraAMano | null }) {
  const tono = m.camion > 0 ? TXT_OK : m.camion < 0 ? TXT_AVISO : undefined;
  const f = frase(v, compra, m);
  return (
    <>
      <Caja tono={f.tono}>{f.texto}</Caja>
      {/* A 400 px una tarjeta en dos columnas entra con 7 caracteres (medido 24-10:
          «S/ +0.53» salía «S/ +0.…» y en tres columnas ni «+0.53»): la etiqueta
          lleva el «S/», como «S/ por PT» de arriba, y el camión pasa a soles
          enteros desde S/ 100 (lo exacto queda en la frase de arriba). */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiResumen label="Compra S/ por PT" value={fmtSoles(compra.porPt)} hint={compra.origen === "a-mano" ? (esElAnotado(compra.porPt, anotado) ? "Anotado a mano" : "Escrito a mano") : esDerivada(compra) ? "Derivado" : "De la cuenta"} />
        <KpiResumen label="Venta S/ por PT" value={fmtSoles(v.porPt)} hint={v.fuente === "cuenta" ? "De la cuenta" : "Sin cobrar"} />
        <KpiResumen label="Margen S/ por PT" value={conSigno(m.porPt, fmtSoles)} tono={tono} hint={m.pct !== null ? `${fmtPct(m.pct)} % de la venta` : undefined} />
        <KpiResumen label="Margen del camión S/" value={conSigno(m.camion, solesCortos)} tono={tono} hint={`${fmtPt(m.pt)} PT del camión`} destacado={m.camion > 0} />
      </div>
    </>
  );
}

export function MargenDelCamionBloque({ c, guia, deLaGuia, puedeAnotar, onGuardada }: {
  c: CubicacionRegistro;
  guia: EstadoDeLaGuia;
  deLaGuia?: PiezasDeLaGuia;
  /** Admin y dueño: guardan el precio de compra escrito a mano. */
  puedeAnotar: boolean;
  /** La guardada con el precio anotado (o borrado), para que la lista no quede vieja. */
  onGuardada?: (c: CubicacionRegistro) => void;
}) {
  const { resultado: r, conComunidad, eleccion, setEleccion, precioAMano, setPrecioAMano, ...anotar } = useMargenDelCamion(c, guia, deLaGuia, onGuardada);
  const a: Anotar = { ...anotar, puedeAnotar };
  const [cambiar, setCambiar] = useState(false);
  const verElegir = r.estado === "lista" && (!r.calza || cambiar || eleccion !== "" || (r.compra !== null && !r.compra.ok));

  return (
    <section aria-label="Margen del camión" className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Margen del camión</CardTitle>
          <InfoTip
            what="Venta por PT − compra por PT = margen por PT; × los PT del camión = margen del camión; ÷ la venta = el %."
            affects="Cálculo de pantalla: no mueve plata. Los montos salen de las cuentas (lo valorizado al descontar); la compra por m³ de troza se pasa a PT con el rendimiento de la GTF, y eso es un derivado. Si escribes el precio de compra a mano, puedes guardarlo en esta cubicación: la próxima vez sale solo y entra en el margen del mes."
            example="Compraste a S/ 1,80 y vendiste a S/ 2,50: ganaste S/ 0,70 por PT, S/ 1.400 en un camión de 2.000 PT."
          />
        </div>
        {r.estado === "lista" && r.calza && !verElegir && (
          <button type="button" onClick={() => setCambiar(true)} className={button({ variant: "secondary" })}>
            <Pencil className="h-4 w-4" aria-hidden /> Cambiar la compra
          </button>
        )}
      </div>

      {r.estado === "cargando" && <p className="text-sm text-[var(--text-secondary)]" role="status">Buscando la compra y la venta en las cuentas…</p>}
      {r.estado === "error" && <Caja tono={AVISO}>{r.mensaje} Sin las cuentas no hay margen.</Caja>}

      {r.estado === "lista" && (
        <>
          {r.margen && r.venta.ok && r.compra?.ok ? (
            <ConMargen v={r.venta.venta} compra={r.compra.compra} m={r.margen} anotado={a.anotado} />
          ) : (
            <>
              {!r.venta.ok && <Caja tono={NEUTRO}>{r.venta.falta}</Caja>}
              {r.compra === null && <Caja tono={NEUTRO}>{faltaLaCompra(c, conComunidad, r.candidatas.length)}</Caja>}
              {r.compra !== null && !r.compra.ok && <Caja tono={NEUTRO}>{r.compra.falta}</Caja>}
            </>
          )}

          <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
            {r.venta.ok && <li><span className="font-semibold text-[var(--text-primary)]">Venta:</span> {lineaDeVenta(r.venta.venta)}</li>}
            {r.compra?.ok && <li><span className="font-semibold text-[var(--text-primary)]">Compra:</span> {lineaDeCompra(r.compra.compra, c.gtfNumber, a.anotado)}</li>}
            {r.respaldo && a.anotado && (
              <li data-precio-respaldo={a.anotado.precioPt}>
                <span className="font-semibold text-[var(--text-primary)]">A mano:</span> S/ {fmtSoles(a.anotado.precioPt)} por PT ({guardadoEl(a.anotado)}) queda de respaldo: manda la compra del lote, que es lo que se pagó.
              </li>
            )}
          </ul>

          {verElegir && (
            <ElegirCompra m={r} eleccion={eleccion} setEleccion={setEleccion} precioAMano={precioAMano} setPrecioAMano={setPrecioAMano} a={a} />
          )}
        </>
      )}
    </section>
  );
}
