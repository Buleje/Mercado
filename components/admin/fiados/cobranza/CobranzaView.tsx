"use client";

/**
 * «Quién debe»: la lista central de Me deben. Un cliente por fila con todo lo
 * que debe, primero el más atrasado; los tramos de antigüedad (al día / 1-30 /
 * 31-60 / 61-90 / +90) filtran y dicen cuánto hay en cada uno.
 *
 * 10-10: fundió las tres listas de deudores que tenía el módulo —«Quién te
 * debe» del Resumen, ésta de Cobranza y «Top deudores» de Análisis— y la
 * antigüedad de la deuda de Análisis, que usaba otros tramos. Las cifras de
 * arriba se fueron a «Indicadores»; «Mensajes», «Meta» y «PDF», al menú «Más».
 *
 * Port de components/admin/adelantos/cobranza/CobranzaView.tsx, sin multi-moneda
 * (Fiado.saldo es siempre soles) y sin el caso «sin teléfono» (customerId ES el
 * teléfono).
 */
import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { CheckCircle, MessageCircle, Search } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp-link";
import { TRAMOS } from "@/lib/fiados/gestion-cobranza";
import { SIN_PLAZO, cajonDelDeudor, type CajonDeudor } from "@/lib/fiados/plazo";
import { deudoresDeCobranza, ordenarPorUrgencia, type DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import { notaDelEnvio, partirRonda, recordatoriosDeHoy } from "@/lib/fiados/recordatorio-revisable";
import { anotarRecordatorio, useRecordarPorWhatsApp } from "../recordar";
import type { Cobranza } from "../use-cobranza";
import { estaAbierto, type Fiado } from "../tipos";
import { useParamDeEntrada } from "@/hooks/use-param-de-entrada";
import FilaDeudor from "./FilaDeudor";
import AnotarGestion from "./AnotarGestion";
import ModoLlamada from "./ModoLlamada";

/** Texto comparable: minúsculas y sin tildes — quien busca en el mostrador escribe "maria", no "María". */
const sinTildes = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const CHIP = "inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-bold transition-colors";

type Props = {
  fiados: Fiado[];
  loading: boolean;
  cob: Cobranza;
  onCobrar: (d: DeudorCobranza) => void;
  /** Abre su cuenta entera en la ficha lateral, sin salir de la ronda (M32). */
  onVerCuenta?: (d: DeudorCobranza) => void;
  onRecordado?: () => void;
};

export default function CobranzaView({ fiados, loading, cob, onCobrar, onRecordado, onVerCuenta }: Props) {
  const [tramo, setTramo] = useState<CajonDeudor | "todos">("todos");
  const [q, setQ] = useState("");
  /* «cobrar a Juan» desde el buscador del panel llega como `?q=Juan` (M04). */
  useParamDeEntrada("q", setQ, (p) => ["ventas-caja", "plata", "fiados"].includes(p.get("tab") ?? ""));
  const [tanda, setTanda] = useState<Set<string>>(new Set());
  const [anotando, setAnotando] = useState<DeudorCobranza | null>(null);
  const [enLlamada, setEnLlamada] = useState(false);
  const [enviandoRonda, setEnviandoRonda] = useState(false);
  const { confirm, notice } = useConfirm();
  const recordar = useRecordarPorWhatsApp(cob.gestiones);

  const activos = useMemo(() => fiados.filter((f) => estaAbierto(f) && f.saldo > 0), [fiados]);
  const deudores = useMemo(() => deudoresDeCobranza(activos), [activos]);

  /** Desde cuándo debe (su fiado abierto más viejo) y su límite de crédito. */
  const extra = useMemo(() => {
    const out = new Map<string, { desde: string | null; limite: number }>();
    for (const f of activos) {
      const e = out.get(f.customerId) ?? { desde: null, limite: 0 };
      if (!e.desde || f.createdAt < e.desde) e.desde = f.createdAt;
      if (f.customerCreditLimit) e.limite = f.customerCreditLimit;
      out.set(f.customerId, e);
    }
    return out;
  }, [activos]);

  const totales = useMemo(() => {
    // Sin plazo va aparte: sus días son de antigüedad, no de mora (H03/M31).
    const porTramo = Object.fromEntries([...TRAMOS, SIN_PLAZO].map((t) => [t.id, { total: 0, n: 0 }])) as Record<CajonDeudor, { total: number; n: number }>;
    for (const d of deudores) {
      const t = porTramo[cajonDelDeudor(d)];
      t.total += d.saldo;
      t.n += 1;
    }
    return porTramo;
  }, [deudores]);

  const filtrados = useMemo(() => {
    const t = sinTildes(q);
    const base = deudores.filter((d) => (tramo === "todos" || cajonDelDeudor(d) === tramo) && (!t || sinTildes(d.nombre).includes(t) || d.telefono.includes(t)));
    return ordenarPorUrgencia(base);
  }, [deudores, tramo, q]);

  useEffect(() => setTanda(new Set()), [tramo, q]);

  const alEscribir = () => {
    void cob.cargarGestiones();
    onRecordado?.();
  };

  /*
   * M36: la ronda dice a quién le va a escribir (con un ejemplo del texto) y se
   * salta a quien ya recibió un recordatorio HOY; antes abría todos los chats
   * de una y repetía el del día. La gestión guarda el texto que salió.
   */
  const mandarLaRonda = async () => {
    const { enviar, yaHoy } = partirRonda(filtrados.filter((x) => tanda.has(x.id)), recordatoriosDeHoy(cob.gestiones));
    const nombres = (l: DeudorCobranza[]) => `${l.slice(0, 6).map((d) => d.nombre).join(", ")}${l.length > 6 ? ` y ${l.length - 6} más` : ""}`;
    if (enviar.length === 0) {
      await notice({ title: "A todos ya les escribiste hoy", description: `${nombres(yaHoy)}. La ronda no repite el recordatorio del día; si hace falta, escríbele desde su fila.`, intent: "info" });
      return;
    }
    const ok = await confirm({
      title: `Escribirle a ${enviar.length} ${enviar.length === 1 ? "cliente" : "clientes"}`,
      description: [
        `Se abre un chat por cliente con el mensaje de su tramo: ${nombres(enviar)}.`,
        `Ejemplo para ${enviar[0].nombre}: «${cob.mensajeDe(enviar[0])}»`,
        yaHoy.length ? `Se salta ${yaHoy.length === 1 ? "a 1" : `a ${yaHoy.length}`} que ya ${yaHoy.length === 1 ? "recibió" : "recibieron"} su recordatorio hoy: ${nombres(yaHoy)}.` : "",
      ].filter(Boolean).join(" "),
      intent: "info",
      confirmLabel: "Abrir los chats",
    });
    if (!ok) return;
    setEnviandoRonda(true);
    try {
      for (const d of enviar) {
        const texto = cob.mensajeDe(d);
        const url = waLink(d.telefono, texto);
        if (!url) continue;
        window.open(url, "_blank", "noopener,noreferrer");
        await anotarRecordatorio(d.id, notaDelEnvio(texto, "la ronda"));
        await new Promise((r) => setTimeout(r, 400));
      }
      setTanda(new Set());
      alEscribir();
    } finally {
      setEnviandoRonda(false);
    }
  };

  if (loading && fiados.length === 0) return <LoadingState />;
  if (deudores.length === 0) {
    return <EmptyState icon={CheckCircle} title="Nadie te debe" description="No hay fiados abiertos con saldo pendiente." />;
  }

  const todosMarcados = filtrados.length > 0 && filtrados.every((d) => tanda.has(d.id));
  const enRonda = filtrados.filter((d) => tanda.has(d.id));

  return (
    <div className="overflow-clip rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* Filtros pegados a la lista: buscador, tramos y el modo llamada. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] p-3">
        {/* Ancho fijo desde sm: `min-w-*` no rige acá (Tailwind 4) y el buscador quedaba en 60 px a 400. */}
        <div className="relative w-full sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o celular…" aria-label="Buscar cliente"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Filtrar por atraso">
          <button type="button" aria-pressed={tramo === "todos"} onClick={() => setTramo("todos")}
            className={cn(CHIP, tramo === "todos" ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
            Todos {deudores.length}
          </button>
          {[...TRAMOS, SIN_PLAZO].filter((t) => totales[t.id].n > 0).map((t) => (
            <button key={t.id} type="button" aria-pressed={tramo === t.id} onClick={() => setTramo(t.id)} title={t.detalle}
              className={cn(CHIP, tramo === t.id ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.tono }} aria-hidden />
              {t.label} {totales[t.id].n}
              <span className="font-semibold tabular-nums text-[var(--text-secondary)]">{formatCurrency(totales[t.id].total)}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setEnLlamada(true)} disabled={filtrados.length === 0} title="Un cliente a la vez, en grande, para llamar o escribir seguido"
          className="ml-auto inline-flex h-12 items-center gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50">
          <MessageCircle className="h-4 w-4" aria-hidden /> Modo llamada
        </button>
      </div>

      <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] px-3 text-sm text-[var(--text-secondary)]">
        <label className="flex h-12 cursor-pointer items-center gap-3 font-semibold">
          <span className="flex w-8 justify-center">
            <input type="checkbox" checked={todosMarcados} onChange={() => setTanda(todosMarcados ? new Set() : new Set(filtrados.map((d) => d.id)))} className="h-5 w-5" />
          </span>
          {filtrados.length} cliente{filtrados.length === 1 ? "" : "s"}
          {tramo !== "todos" || q ? ` de ${deudores.length}` : ""}
        </label>
        <span className="ml-auto hidden sm:inline">Marca varios para escribirles en ronda</span>
      </div>

      {filtrados.length === 0 ? (
        <p className="py-8 text-center text-base text-[var(--text-secondary)]">Nadie en este tramo.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {filtrados.map((d) => (
            <FilaDeudor
              key={d.id}
              deudor={d}
              promesa={cob.promesas.get(d.id)}
              ultima={cob.ultimas.get(d.id)}
              cumplimiento={cob.cumplimientos.get(d.id) ?? null}
              limite={extra.get(d.id)?.limite ?? 0}
              desde={extra.get(d.id)?.desde ?? null}
              enTanda={tanda.has(d.id)}
              onTanda={(v) => setTanda((prev) => {
                const n = new Set(prev);
                if (v) n.add(d.id); else n.delete(d.id);
                return n;
              })}
              onAnotar={() => setAnotando(d)}
              onCobrar={() => onCobrar(d)}
              onVerCuenta={onVerCuenta ? () => onVerCuenta(d) : undefined}
              onEscribir={() => void recordar({ ...d, texto: cob.mensajeDe(d) }, alEscribir)}
              mensaje={cob.mensajeDe(d)}
            />
          ))}
        </ul>
      )}

      {enRonda.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-primary/25 bg-[var(--surface-raised)] px-4 py-3">
          <p className="text-base font-semibold text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">{enRonda.length}</strong> en la ronda ·{" "}
            <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(enRonda.reduce((s, d) => s + d.saldo, 0))}</strong> por cobrar
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTanda(new Set())} className="h-12 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
              Vaciar
            </button>
            <button type="button" onClick={() => void mandarLaRonda()} disabled={enviandoRonda}
              className={button({ variant: "primary", className: "gap-2 rounded-xl" })}>
              <MessageCircle className="h-4 w-4" aria-hidden />
              {enviandoRonda ? "Abriendo chats…" : `Escribirle a los ${enRonda.length}`}
            </button>
          </div>
        </div>
      )}

      {anotando && (
        <AnotarGestion customerId={anotando.id} nombre={anotando.nombre} saldo={anotando.saldo} onClose={() => setAnotando(null)}
          onGuardada={() => { setAnotando(null); alEscribir(); }} />
      )}
      {enLlamada && (
        <ModoLlamada
          deudores={filtrados}
          promesas={cob.promesas}
          ultimas={cob.ultimas}
          mensajeDe={cob.mensajeDe}
          onAnotar={(d) => { setEnLlamada(false); setAnotando(d); }}
          onGestionRapida={async (id, tipo) => { await cob.anotarRapido(id, tipo); await cob.cargarGestiones(); }}
          onClose={() => setEnLlamada(false)}
        />
      )}
    </div>
  );
}
