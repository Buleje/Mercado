"use client";

/**
 * resumen-hero — la cabecera de la pestaña Resúmenes: qué lote es, cuánto suma
 * y en qué se fue el volumen.
 *
 * Vive aparte de `CubicacionResumenes` porque el contenedor se quedó con el
 * estado (lote, vistas, exports) y acá está el dibujo.
 *
 * ── Una fila (Brandon, 20-10: «más compacto como las otras pestañas y menos
 * texto o puesto en ícono de información») ──────────────────────────────────
 * Título + ⓘ con las cifras debajo · pestañas · «Indicadores» · «Exportar».
 * El rótulo «Cubicación · lote en curso», la frase del lote y el conteo de
 * especies/tipos/renglones viven en el ⓘ; las cifras (piezas · m³ · PT) se
 * quedan a la vista: son el dato. Las ocho tarjetas, detrás de «Indicadores»
 * (el mismo botón de todo el forestal, `useKpisPlegables`).
 */

import type { ReactNode } from "react";
import { Boxes, Coins, Download, Layers, Ruler, Scale, Sigma, TreePine, Wrench } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ResumenLote } from "@/lib/forestal/cubicacion-resumen";
import { fmtM3, fmtPct, fmtPiezas, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { slugKey } from "@/lib/forestal/sembrar-reparto";
import { useKpisPlegables } from "./kpis-plegables";
import { KpiResumen } from "./resumen-tabla";

/**
 * Una frase que resume el lote: qué madera manda y qué producto salió. Es lo
 * que el maderero diría por teléfono; va en el ⓘ del título.
 */
function lecturaCorta(porEspecie: ResumenLote, porTipo: ResumenLote): string | null {
  const esp = porEspecie.grupos[0];
  const tipo = porTipo.grupos[0];
  if (!esp || !tipo) return null;
  const mezcla = porEspecie.grupos.length === 1
    ? `Todo el lote es ${esp.label}`
    : `Encabeza ${esp.label} con ${fmtPct(esp.pctPt)} % del pie tablar`;
  return `${mezcla} · el grueso salió ${tipo.label.toLowerCase()} (${fmtPct(tipo.pctPt)} %).`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function HeroResumen({ total, renglones, porEspecie, porTipo, porMedida, conValor, pestanas, exportar, fecha, enPapel, variadoPaquetes = 0 }: {
  total: ResumenLote["total"];
  /** Renglones del cubicador (no piezas): dice cuánto se tipeó. */
  renglones: number;
  porEspecie: ResumenLote;
  porTipo: ResumenLote;
  /** Las escuadrías del lote — de acá salen «medidas distintas» y la que manda. */
  porMedida: ResumenLote;
  conValor: boolean;
  /** El selector de vistas (Panorama · Tablas · …), en la misma fila. */
  pestanas: ReactNode;
  /** Imprimir y bajar: van en el menú «Exportar». */
  exportar: MenuAccion[];
  /** Fecha de emisión — sólo se ve en el papel. */
  fecha: string;
  /** Qué sale en el papel («Distribución», «Todas las vistas»): sólo impreso. */
  enPapel: string;
  /** Paquetes 6×6 Variado que se cuentan abiertos (0 = no hay). */
  variadoPaquetes?: number;
}) {
  const frase = lecturaCorta(porEspecie, porTipo);
  const tipoManda = porTipo.grupos[0];
  const medidaManda = porMedida.grupos[0];
  const ptPorPieza = total.cantidad > 0 ? total.pieTablar / total.cantidad : 0;
  const cifras = `${fmtPiezas(total.cantidad)} pzas · ${fmtM3(total.m3)} m³ · ${fmtPt(total.pieTablar)} PT${conValor ? ` · S/ ${fmtSoles(total.valor)}` : ""}`;

  /* Las cuatro que se declaran (piezas · m³ · PT · plata) y las cuatro que se
     MIRAN (con qué madera, en qué producto, cuántas escuadrías, pieza promedio). */
  const tarjetas = [
    <KpiResumen key="pz" label="Piezas" value={fmtPiezas(total.cantidad)} icon={Boxes} hint={`${plural(renglones, "renglón", "renglones")} del cubicador`} />,
    <KpiResumen key="m3" label="Volumen" value={fmtM3(total.m3)} unidad="m³" icon={Ruler} hint="3 decimales, como se declara" />,
    <KpiResumen key="pt" label="Pie tablar" value={fmtPt(total.pieTablar)} unidad="PT" icon={Layers} hint="entero, como se vende" />,
    <KpiResumen
      key="valor"
      label="Valor del lote"
      value={conValor ? `S/ ${fmtSoles(total.valor)}` : "—"}
      icon={Coins}
      destacado={conValor}
      hint={conValor && total.pieTablar > 0 ? `S/ ${fmtSoles(total.valor / total.pieTablar)} por PT` : "carga el precio en el cubicador"}
    />,
    <KpiResumen
      key="esp"
      label="Especies"
      value={String(porEspecie.grupos.length)}
      icon={TreePine}
      hint={porEspecie.grupos[0] ? `${porEspecie.grupos[0].label} · ${fmtPct(porEspecie.grupos[0].pctPt)} % del PT` : "sin especie declarada"}
    />,
    <KpiResumen
      key="tipo"
      label="Tipo que manda"
      value={tipoManda ? tipoManda.label : "—"}
      icon={Wrench}
      hint={tipoManda ? `${fmtPct(tipoManda.pctPt)} % del pie tablar · ${plural(porTipo.grupos.length, "tipo", "tipos")} en el lote` : "sin tipo"}
    />,
    <KpiResumen
      key="med"
      label="Medidas distintas"
      value={String(porMedida.grupos.length)}
      icon={Sigma}
      hint={medidaManda ? `manda ${medidaManda.label} · ${fmtPct(medidaManda.pctPt)} %` : "sin medidas"}
    />,
    <KpiResumen key="prom" label="Pieza promedio" value={fmtPt(ptPorPieza)} unidad="PT" icon={Scale} hint={total.cantidad > 0 ? `${fmtM3(total.m3 / total.cantidad)} m³ por pieza` : "sin piezas"} />,
  ];
  /* El botón de siempre del forestal: sólo ícono + cuenta, porque las cifras ya
     están a la vista debajo del título. Arranca cerrado y se recuerda por tienda. */
  const kpis = useKpisPlegables({ claveMemoria: slugKey("-resumen-kpis"), tarjetas, resumen: cifras, alRiel: false, soloIcono: true, sinTitular: true });

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 sm:flex-none">
          <div className="flex items-center gap-1.5">
            <SectionTitle as="h3">Resúmenes del lote</SectionTitle>
            <span className="print:hidden">
              <InfoTip
                side="bottom"
                title="Cubicación · lote en curso"
                what={<span>El lote que está ahora en el Cubicador de madera, leído de todas las formas en que se vende: {plural(porEspecie.grupos.length, "especie", "especies")} · {plural(porTipo.grupos.length, "tipo", "tipos")} · {plural(renglones, "renglón", "renglones")} del cubicador.</span>}
                affects={frase ? <span>{frase}{variadoPaquetes > 0 ? ` Los ${fmtPiezas(variadoPaquetes)} paq. 6×6 Variado se cuentan abiertos: sus medidas con su tipo y especie, por proporción.` : ""}</span> : undefined}
                example={<span>Pie tablar entero y m³ con 3 decimales, como se declara. «Indicadores» abre las ocho cifras; «Exportar» imprime la vista que ves o todo el resumen, y baja el CSV.</span>}
              />
            </span>
          </div>
          {/* Las cifras se quedan a la vista: son el dato (antes, una banda propia). */}
          <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
            {cifras}
            {variadoPaquetes > 0 && <span className="font-normal text-[var(--text-tertiary)]"> · 6×6 abiertos</span>}
          </p>
          {/* Sólo en el papel: un resumen sin fecha no sirve para mandarlo ni archivarlo. */}
          <p className="hidden text-sm text-[var(--text-tertiary)] print:block">{enPapel} · Emitido el {fecha}</p>
        </div>
        {/* A 400 px las pestañas bajan a su propia fila y los botones quedan al lado del título. */}
        <div className="order-3 w-full sm:order-none sm:w-auto print:hidden">{pestanas}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2 print:hidden">
          {kpis.boton}
          <ActionMenu label="Exportar" icon={Download} actions={exportar} soloIcono title="Imprimir o bajar el resumen" />
        </div>
      </div>
      {/* Cuatro por fila como antes (el panel del hook pide 230 px por tarjeta y a 1280 quedaban tres). */}
      {kpis.abierto && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{tarjetas}</div>}
    </div>
  );
}


/**
 * Dónde está el volumen: las cinco medidas que más pesan, con su barra.
 *
 * Responde la pregunta con la que se sale a vender —«¿qué tengo para ofrecer en
 * cantidad?»— sin obligar a abrir el agrupado libre y elegir la dimensión.
 */
export function DondeEstaElVolumen({ porMedida, conValor }: { porMedida: ResumenLote; conValor: boolean }) {
  const top = porMedida.grupos.slice(0, 5);
  if (top.length === 0) return null;
  const resto = porMedida.grupos.length - top.length;
  return (
    <ul className="space-y-2.5">
      {top.map((g, i) => (
        <li key={g.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-5 shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{g.label}</span>
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {g.cantidad} pzas · {fmtPt(g.pieTablar)} PT · {fmtM3(g.m3)} m³
            {conValor && <span className="text-[var(--accent-ink)] dark:text-[var(--accent)]"> · S/ {fmtSoles(g.valor)}</span>}
          </span>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:w-40">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, g.pctPt)}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{fmtPct(g.pctPt)}%</span>
        </li>
      ))}
      {resto > 0 && (
        <li className="text-sm text-[var(--text-tertiary)]">
          y {resto} {resto === 1 ? "medida más" : "medidas más"} — están todas en <b className="text-[var(--text-secondary)]">Tablas → Agrupado libre</b>.
        </li>
      )}
    </ul>
  );
}
