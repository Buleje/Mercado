"use client";

/**
 * «Por vencer»: lo que toca cobrar por FECHA, que ninguna otra pantalla ordena
 * así. Arriba las promesas de pago que no se cumplieron (a quién llamar hoy);
 * después lo que vence hoy, esta semana y más adelante (fiados por su
 * vencimiento y promesas por la fecha prometida). Al lado, el mes: tocar un día
 * deja sólo lo de ese día, también si ya pasó.
 *
 * Nuevo el 10-10 al reordenar Me deben: las promesas sólo se veían como una
 * pastilla en la fila del cliente y los vencimientos, en un calendario suelto
 * de la pestaña Análisis.
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { CheckCircle2, DollarSign, MessageCircle, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import type { DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import CalendarioVencimientos from "./CalendarioVencimientos";
import { armarAgenda, calendarioDeAgenda, totalPorCobrar, type ItemAgenda as Item } from "./cifras-me-deben";
import { diaLeido, diasEntre } from "./fechas";
import { useRecordarPorWhatsApp } from "./recordar";
import type { Cobranza } from "./use-cobranza";
import type { Fiado } from "./tipos";

type Grupo = { titulo: string; items: Item[]; alerta?: boolean };

type Props = {
  fiados: Fiado[];
  cob: Cobranza;
  onCobrarCliente: (d: DeudorCobranza) => void;
  onVerFiado: (f: Fiado) => void;
  onRecordado?: () => void;
};

export default function AgendaCobros({ fiados, cob, onCobrarCliente, onVerFiado, onRecordado }: Props) {
  const [elegido, setElegido] = useState<string | null>(null);
  const recordar = useRecordarPorWhatsApp(cob.gestiones);
  const hoy = limaDateKey();

  /* `cob.promesas` ya viene sólo con quien todavía debe: la misma lista que cuentan los Indicadores. */
  const { items, sinFecha } = useMemo(() => armarAgenda(fiados, cob.promesas), [fiados, cob.promesas]);
  const porDia = useMemo(() => calendarioDeAgenda(items), [items]);

  const grupos: Grupo[] = elegido
    ? [{ titulo: diaLeido(elegido), items: items.filter((i) => i.dia === elegido) }]
    : [
        { titulo: "Prometieron pagar y no cumplieron", items: items.filter((i) => i.incumplida), alerta: true },
        { titulo: "Hoy", items: items.filter((i) => i.dia === hoy) },
        { titulo: "Esta semana", items: items.filter((i) => i.dia > hoy && diasEntre(hoy, i.dia) <= 7) },
        { titulo: "Más adelante", items: items.filter((i) => diasEntre(hoy, i.dia) > 7) },
      ];
  const hayAlgo = grupos.some((g) => g.items.length > 0);

  const escribir = (i: Item) => {
    void recordar({ ...i.deudor, texto: cob.mensajeDe(i.deudor) }, () => {
      void cob.cargarGestiones();
      onRecordado?.();
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 overflow-clip rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {elegido && (
          <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-4 py-1">
            <p className="text-sm text-[var(--text-secondary)]">Sólo lo del día que tocaste en el calendario</p>
            <button type="button" onClick={() => setElegido(null)} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
              <X className="h-4 w-4" aria-hidden /> Ver todo
            </button>
          </div>
        )}
        {!hayAlgo && (
          <p className="flex items-center gap-2 px-4 py-6 text-base text-[var(--text-secondary)]">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
            {elegido ? "Nada para ese día." : "Nada por vencer y ninguna promesa pendiente."}
          </p>
        )}
        {grupos.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.titulo} aria-label={g.titulo}>
            <CardTitle className={cn("border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2 text-sm font-bold", g.alerta ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>
              {g.titulo} · {g.items.length}{g.items.some((i) => i.tipo === "vence") && <> · {formatCurrency(totalPorCobrar(g.items))}</>}
            </CardTitle>
            <ul className="divide-y divide-[var(--rule-soft)]">
              {g.items.map((i) => (
                <FilaAgenda key={i.clave} item={i} hoy={hoy} onEscribir={() => escribir(i)}
                  onCobrar={() => onCobrarCliente(i.deudor)} onVer={i.fiado ? () => onVerFiado(i.fiado as Fiado) : undefined} />
              ))}
            </ul>
          </section>
        ))}
        {sinFecha > 0 && !elegido && (
          <p className="flex items-center gap-1.5 border-t border-[var(--rule-soft)] px-4 py-2 text-sm text-[var(--text-secondary)]">
            {sinFecha} fiado{sinFecha === 1 ? "" : "s"} sin fecha de vencimiento no sale{sinFecha === 1 ? "" : "n"} acá
            <InfoTip what="Un fiado sin fecha no vence nunca: en «Quién debe» sale aparte, en «Sin plazo», con los días que lleva abierto (antigüedad, no atraso)." affects="En «Cada fiado», columna Vencimiento, toca «Poner fecha» para que aparezca en esta agenda." />
          </p>
        )}
      </div>
      <CalendarioVencimientos porDia={porDia} elegido={elegido} onElegir={setElegido} />
    </div>
  );
}

function FilaAgenda({ item: i, hoy, onEscribir, onCobrar, onVer }: { item: Item; hoy: string; onEscribir: () => void; onCobrar: () => void; onVer?: () => void }) {
  const dias = diasEntre(hoy, i.dia);
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "mañana" : dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
  const que = i.tipo === "promesa"
    ? `Prometió pagar el ${diaLeido(i.dia)} (${cuando})`
    : `Vence el ${diaLeido(i.dia)} (${cuando})${i.fiado?.descripcion ? ` · ${i.fiado.descripcion}` : ""}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="min-w-0 flex-1 basis-56">
        {onVer ? (
          <button type="button" onClick={onVer} className="block max-w-full truncate text-left text-base font-bold text-[var(--text-primary)] underline-offset-4 hover:underline">
            {i.deudor.nombre}
          </button>
        ) : (
          <span className="block truncate text-base font-bold text-[var(--text-primary)]">{i.deudor.nombre}</span>
        )}
        <span className={cn("block text-sm", i.incumplida || (i.tipo === "vence" && dias < 0) ? "font-semibold text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]")}>{que}</span>
        {i.nota && <span className="block truncate text-sm italic text-[var(--text-secondary)]">«{i.nota}»</span>}
      </span>
      <span className="w-28 shrink-0 text-right text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(i.monto)}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onEscribir} title="Escribir por WhatsApp (queda anotado)" aria-label={`Escribir a ${i.deudor.nombre} por WhatsApp`}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]">
          <MessageCircle className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" onClick={onCobrar} title={`Cobrar lo que debe ${i.deudor.nombre} (${formatCurrency(i.deudor.saldo)})`} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4 font-bold" })}>
          <DollarSign className="h-4 w-4" aria-hidden /> Cobrar
        </button>
      </span>
    </li>
  );
}
