"use client";

import { CardTitle, DataTable } from "@buleje/design-system";
import { ArrowDownRight, Boxes, PackageOpen, Target, Truck, AlertTriangle } from "@buleje/design-system/icons";
import type { CadenaLote, MetaEspecie } from "@/lib/forestal/ctp-cadena-lote";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_REF_ASERRADA } from "@/lib/forestal/ctp-rendimiento";

/** El código del schema es `m3`; en pantalla se lee `m³`. */
const UNIDAD: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "un." };
const simbolo = (u: string | null) => UNIDAD[u ?? "m3"] ?? u ?? "";

/**
 * La cadena de custodia del lote, de punta a punta (ADR-315).
 *
 * Tres bandas en el orden en que ocurre: de dónde vino → qué se hizo → a dónde
 * fue. Es la pregunta de un fiscalizador de OSINFOR, y hasta ahora había que
 * responderla abriendo tres pantallas distintas.
 *
 * Los huecos van ARRIBA, no al pie: si la cadena está incompleta, eso es lo
 * primero que hay que saber, no una nota al final que nadie lee.
 */

export default function CtpCadenaLote({ cadena }: { cadena: CadenaLote }) {
  const { balance } = cadena;

  return (
    <section className="space-y-4">
      <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
        Cadena de custodia
      </CardTitle>

      {cadena.huecos.length > 0 && (
        <div className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3.5 dark:bg-[var(--data-warning-500)]/10">
          <p className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-3.5 w-3.5" /> La cadena tiene huecos
          </p>
          <ul className="space-y-1">
            {cadena.huecos.map((h, i) => (
              <li key={i} className="text-xs leading-snug text-[var(--text-secondary)]">{h}</li>
            ))}
          </ul>
        </div>
      )}

      {/* El balance del lote: los cuatro números que resumen todo lo de abajo. */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-5">
        <Kpi label="Consumido" valor={balance.consumidoM3} unidad="m³" />
        <Kpi label="Producido" valor={balance.producido} />
        <Kpi label="En este lote" valor={balance.enElLote} />
        <Kpi label="Despachado" valor={balance.despachado} />
        <Kpi label="En stock" valor={balance.enStock} destacado />
        {balance.rendimientoPct != null && (
          <div className="col-span-2 border-t border-[var(--rule-soft)] pt-2 text-xs text-[var(--text-tertiary)] sm:col-span-5">
            Rendimiento del lote: <b className="font-mono text-[var(--text-primary)]">{balance.rendimientoPct}%</b>{" "}
            (producido / consumido)
          </div>
        )}
      </div>

      <MetaRendimiento meta={cadena.meta} />

      <Banda
        icon={PackageOpen}
        titulo={`De dónde vino · ${cadena.origen.length} guía${cadena.origen.length === 1 ? "" : "s"}`}
        vacio="Ninguna corrida de este lote declara de qué ingreso salió."
        hay={cadena.origen.length > 0}
      >
        {cadena.origen.map((o) => (
          <Fila
            key={o.woodEntryId}
            titulo={`GTF ${o.gtfNumber}`}
            sub={[o.especie, o.proveedor].filter(Boolean).join(" · ")}
            extra={[o.originCode, o.serforNumeroRegistro].filter(Boolean).join(" · ")}
            cantidad={`${o.consumidoM3.toFixed(4)} m³`}
            nota={o.corridas > 1 ? `en ${o.corridas} corridas` : undefined}
          />
        ))}
      </Banda>

      <Banda
        icon={Boxes}
        titulo={`Qué se hizo · ${cadena.corridas.length} corrida${cadena.corridas.length === 1 ? "" : "s"}`}
        vacio="El lote todavía no tiene corridas asignadas."
        hay={cadena.corridas.length > 0}
      >
        {cadena.corridas.map((c) => (
          <Fila
            key={c.produccionEntryId}
            titulo={`Corrida #${c.lineNo ?? "?"}`}
            sub={[c.productType, c.especie].filter(Boolean).join(" · ")}
            extra={c.lineaProduccion ?? undefined}
            cantidad={`${c.enElLote.toFixed(4)} ${simbolo(c.unit)}`}
            // Cuando el lote no se lleva la corrida entera hay que decirlo: el
            // resto está en otro lote y lo despachado no se puede separar.
            nota={c.compartida ? `de ${c.quantity.toFixed(4)} — el resto está en otro lote` : undefined}
            alerta={c.compartida}
          />
        ))}
      </Banda>

      <Banda
        icon={Truck}
        titulo={`A dónde fue · ${cadena.salidas.length} despacho${cadena.salidas.length === 1 ? "" : "s"}`}
        vacio="Todavía no salió del patio."
        hay={cadena.salidas.length > 0}
      >
        {cadena.salidas.map((s) => (
          <Fila
            key={s.despachoEntryId}
            titulo={s.gtfNumber ? `GTF ${s.gtfNumber}` : `Despacho #${s.lineNo ?? "?"}`}
            sub={s.destino ?? "sin destino declarado"}
            extra={new Date(s.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
            cantidad={s.cantidad.toFixed(4)}
            nota={s.compartida ? "la corrida de origen está repartida entre lotes" : undefined}
            alerta={s.compartida}
          />
        ))}
      </Banda>
    </section>
  );
}

/**
 * La cuenta del jefe de planta: metí tantas trozas, al 56% tendrían que salir
 * tantos m³ — llevo tantos, me faltan tantos. En m³ y en pie tablar, porque acá
 * la madera aserrada se vende en PT.
 *
 * Un saldo NEGATIVO es buena noticia (superó la meta) y por eso no se pinta de
 * rojo: rojo acá haría que un lote eficiente parezca un problema.
 */
function MetaRendimiento({ meta }: { meta: MetaEspecie[] }) {
  if (meta.length === 0) return null;
  const pt = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 0 });
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] px-4 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Target className="h-4 w-4" />
        </span>
        <CardTitle as="h4" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Meta de rendimiento · {RENDIMIENTO_REF_ASERRADA}% por especie
        </CardTitle>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">1 m³ ≈ {pt(PT_POR_M3)} pt</span>
      </div>
      <div className="overflow-x-auto">
        <DataTable className="w-full text-sm hoja-grilla">
          <thead>
            <tr className="border-b border-[var(--rule-soft)]">
              <ThMeta izq>Especie</ThMeta>
              <ThMeta>Trozas m³</ThMeta>
              <ThMeta>Meta m³</ThMeta>
              <ThMeta>Producido m³</ThMeta>
              <ThMeta>Producido pt</ThMeta>
              <ThMeta>Saldo meta m³</ThMeta>
              <ThMeta>Saldo meta pt</ThMeta>
              <ThMeta>Rend.</ThMeta>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {meta.map((m) => (
              <tr key={m.especie}>
                <td className="px-3 py-2 font-bold text-[var(--text-primary)]">
                  {m.especie}
                  {m.unidadesMezcladas && (
                    <span className="ml-1.5 text-xs font-normal text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      · hay corridas en otra unidad
                    </span>
                  )}
                </td>
                <TdMeta>{m.trozasM3.toFixed(4)}</TdMeta>
                <TdMeta>{m.metaM3.toFixed(4)}</TdMeta>
                <TdMeta>{m.producidoM3.toFixed(4)}</TdMeta>
                <TdMeta>{pt(m.producidoPt)}</TdMeta>
                <TdMeta fuerte={m.saldoM3 > 0}>{m.saldoM3.toFixed(4)}</TdMeta>
                <TdMeta fuerte={m.saldoM3 > 0}>{pt(m.saldoPt)}</TdMeta>
                <TdMeta>{m.rendimientoPct != null ? `${m.rendimientoPct}%` : "—"}</TdMeta>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

function ThMeta({ children, izq }: { children: React.ReactNode; izq?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] ${
        izq ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}

function TdMeta({ children, fuerte }: { children: React.ReactNode; fuerte?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums ${
        fuerte ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
      }`}
    >
      {children}
    </td>
  );
}

function Kpi({ label, valor, unidad, destacado }: { label: string; valor: number; unidad?: string; destacado?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</div>
      <div className={`font-mono font-bold tabular-nums ${destacado ? "text-lg text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-base text-[var(--text-primary)]"}`}>
        {valor.toFixed(4)}
        {unidad && <span className="ml-1 text-xs font-medium text-[var(--text-tertiary)]">{unidad}</span>}
      </div>
    </div>
  );
}

function Banda({
  icon: Icon,
  titulo,
  vacio,
  hay,
  children,
}: {
  icon: typeof Boxes;
  titulo: string;
  vacio: string;
  hay: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-4 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Icon className="h-4 w-4" />
        </span>
        <CardTitle as="h4" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          {titulo}
        </CardTitle>
      </div>
      {hay ? (
        <ul className="divide-y divide-[var(--rule-soft)]">{children}</ul>
      ) : (
        <p className="px-4 py-3 text-sm text-[var(--text-tertiary)]">{vacio}</p>
      )}
    </div>
  );
}

function Fila({
  titulo,
  sub,
  extra,
  cantidad,
  nota,
  alerta,
}: {
  titulo: string;
  sub?: string;
  extra?: string;
  cantidad: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
      {sub && <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">{sub}</span>}
      {extra && <span className="truncate font-mono text-xs text-[var(--text-tertiary)]">{extra}</span>}
      <span className="ml-auto shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{cantidad}</span>
      {nota && (
        <span
          className={`w-full text-xs ${
            alerta ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"
          }`}
        >
          <ArrowDownRight className="mr-1 inline h-3 w-3" aria-hidden />
          {nota}
        </span>
      )}
    </li>
  );
}
