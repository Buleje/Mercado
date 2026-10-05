"use client";

/**
 * Paso 3 de «Contar el patio»: el acta (Brandon 2026-10-05: «el acta del
 * conteo sale sola con lo que falta o sobra»). En pantalla, lo que se va a
 * firmar: encontradas, faltan —con su cancha y los días que llevaban en el
 * patio, que es como se sale a buscarlas— y sobran, con el porqué.
 *
 * El acta ya se guardó sola al terminar (`useActaDelConteo`, por la cola del
 * patio: sin señal sube al volver); acá se ve en qué quedó y se imprime o se
 * guarda en PDF desde la ventana de impresión.
 */

import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, MapPin, Printer, RotateCcw, WifiOff } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { agruparFaltan, codigoDeTroza, motivoDeSorpresa, type ConteoPatio, type ResumenConteo } from "@/lib/forestal/conteo-patio";
import { diasEnElPatio, textoDias } from "@/lib/forestal/conteo-patio-pasos";
import { fechaHoraCorta } from "@/lib/forestal/conteo-patio-acta";
import type { EstadoActa } from "./hooks/use-acta-del-conteo";
import { AVISO_AMBAR, BOTON_BORDE, BOTON_PRIMARIO, TARJETA } from "./ctp-conteo-pasos";

const AMBAR_TEXTO = "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
const VERDE_TEXTO = "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]";

/** Qué pasó con el acta en el libro, en una línea. */
export function EstadoDelActa({ estado, mensaje, onReintentar }: { estado: EstadoActa; mensaje: string | null; onReintentar: () => void }) {
  if (estado === "nada") return null;
  if (estado === "subiendo") {
    return (
      <p className="flex items-center gap-2 text-base text-[var(--text-secondary)]" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Guardando el acta en el libro…
      </p>
    );
  }
  if (estado === "guardada") {
    return (
      <p className={cn("flex items-start gap-2 text-base font-bold", VERDE_TEXTO)} role="status" data-acta-estado="guardada">
        <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Acta guardada en el libro: la ven todos en Trozas.
      </p>
    );
  }
  if (estado === "en-equipo") {
    return (
      <p className={AVISO_AMBAR} role="status" data-acta-estado="en-equipo">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Sin señal: el acta quedó en este celular y se sube sola al volver la señal.
      </p>
    );
  }
  return (
    <div className="space-y-2" role="alert" data-acta-estado="error">
      <p className={AVISO_AMBAR}>
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> El acta no se guardó en el libro: {mensaje}
      </p>
      <button type="button" onClick={onReintentar} className={BOTON_BORDE}>
        <RotateCcw className="h-5 w-5" aria-hidden /> Reintentar
      </button>
    </div>
  );
}

function Cifra({ n, texto, pide }: { n: number; texto: string; pide: boolean }) {
  return (
    <div className={cn("rounded-2xl border-2 px-2 py-3 text-center", pide ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10" : "border-[var(--rule-base)] bg-[var(--surface-raised)]")}>
      <b className={cn("block text-4xl font-bold tabular-nums leading-none", pide ? AMBAR_TEXTO : "text-[var(--text-primary)]")}>{n}</b>
      <span className="mt-1 block text-base font-bold text-[var(--text-secondary)]">{texto}</span>
    </div>
  );
}

function Lista({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <CardTitle as="h3" className="text-lg font-bold text-[var(--text-primary)]">
        {titulo} <span className="tabular-nums text-[var(--text-secondary)]">({n})</span>
      </CardTitle>
      {n === 0 ? <p className="text-base text-[var(--text-secondary)]">Ninguna.</p> : children}
    </section>
  );
}

const FILA_BASE = "flex items-start gap-3 rounded-2xl px-3 py-2";
const FILA = `${FILA_BASE} border border-[var(--rule-base)] bg-[var(--surface-raised)]`;
const FILA_SOBRA = `${FILA_BASE} border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10`;

export default function PasoActa({
  conteo,
  resumen,
  estado,
  mensaje,
  onReintentar,
  onImprimir,
  onSeguir,
  onOtro,
}: {
  conteo: ConteoPatio;
  resumen: ResumenConteo;
  estado: EstadoActa;
  mensaje: string | null;
  onReintentar: () => void;
  onImprimir: () => void;
  onSeguir: () => void;
  onOtro: () => void;
}) {
  const porCancha = agruparFaltan(resumen.faltan, "cancha");
  const sobran = resumen.sorpresas.length;

  return (
    <div className="space-y-5" data-paso-acta>
      <section className={cn(TARJETA, "space-y-4")}>
        <p className={cn("flex items-start gap-2 text-lg font-bold", VERDE_TEXTO)}>
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
          Conteo terminado {fechaHoraCorta(conteo.terminadoEn ?? conteo.iniciadoEn)}
        </p>
        <div className="grid grid-cols-3 gap-2" data-acta-cifras>
          <Cifra n={resumen.contadas} texto={`de ${resumen.total} encontradas`} pide={false} />
          <Cifra n={resumen.faltan.length} texto="faltan" pide={resumen.faltan.length > 0} />
          <Cifra n={sobran} texto={sobran === 1 ? "sobra" : "sobran"} pide={sobran > 0} />
        </div>
        <EstadoDelActa estado={estado} mensaje={mensaje} onReintentar={onReintentar} />
        <button type="button" onClick={onImprimir} className={cn(BOTON_PRIMARIO, "w-full")} data-imprimir-acta>
          <Printer className="h-6 w-6" aria-hidden /> Imprimir o guardar en PDF
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onSeguir} className={BOTON_BORDE}>
            Seguir contando
          </button>
          <button type="button" onClick={onOtro} className={BOTON_BORDE}>
            <RotateCcw className="h-5 w-5" aria-hidden /> Otro conteo
          </button>
        </div>
      </section>

      <Lista titulo="Faltan" n={resumen.faltan.length}>
        <div className="space-y-3" data-acta-faltan>
          {porCancha.map((g) => (
            <div key={g.clave} className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-base font-bold text-[var(--text-primary)]">
                <MapPin className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
                {g.clave}
                <span className="font-semibold tabular-nums text-[var(--text-secondary)]">
                  · {g.trozas.length} · {fmtM3(g.m3)} m³
                </span>
              </p>
              <ul className="space-y-1.5">
                {g.trozas.map((t) => {
                  const dias = textoDias(diasEnElPatio(t, conteo.fecha));
                  return (
                    <li key={t.id} className={FILA}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-lg font-bold text-[var(--text-primary)]">{codigoDeTroza(t)}</span>
                        <span className="block truncate text-base text-[var(--text-secondary)]">
                          {[t.especieComun, t.gtfNumber && `guía ${t.gtfNumber}`].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="shrink-0 pt-1 text-base font-bold tabular-nums text-[var(--text-primary)]">{dias ?? "—"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Lista>

      <Lista titulo="Sobran: el libro dice que no están" n={sobran}>
        <ul className="space-y-1.5" data-acta-sobran>
          {resumen.sorpresas.map((s) => {
            const codigo = s.troza ? codigoDeTroza(s.troza) : s.codigo;
            return (
              <li key={s.troza ? s.troza.id : s.tipo === "fuera" ? s.trozaId : `?${s.codigo}`} className={FILA_SOBRA}>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-lg font-bold text-[var(--text-primary)]">{codigo}</span>
                  <span className={cn("block text-base font-bold", AMBAR_TEXTO)}>{motivoDeSorpresa(s)}</span>
                  {s.troza && (
                    <span className="block truncate text-base text-[var(--text-secondary)]">
                      {[s.troza.especieComun, s.troza.gtfNumber && `guía ${s.troza.gtfNumber}`].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Lista>

      <details className="group rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-bold text-[var(--text-primary)]">
          Encontradas <span className="ml-1.5 tabular-nums text-[var(--text-secondary)]">({resumen.contadas})</span>
        </summary>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {resumen.encontradas.map((t) => (
            <li key={t.id} className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-base tabular-nums text-[var(--text-primary)]">
              {codigoDeTroza(t)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
