"use client";

/**
 * La plata de la guía que acaba de salir.
 *
 * El Libro lleva la madera hasta la puerta —qué se despachó, con qué guía, de
 * qué corrida salió— y ahí se cortaba. La venta y el margen por despacho ya
 * existían (ADR-141) pero morían en la pantalla del despacho: la plata no
 * entraba a ningún lado. Medido el 2026-09-11 en el tenant real: 78 m³
 * producidos en planta, **0 movimientos de cuenta corriente**.
 *
 * Esta pieza cierra esa vuelta en el único momento en que el operador tiene
 * todo junto —la guía registrada, el cliente y el total— y pregunta lo único
 * que el libro no sabe: **si le pagaron**.
 *
 * ## Por qué NO crea una venta del POS
 *
 * La madera despachada no es un producto del catálogo: su stock lo lleva el
 * Libro, pieza por pieza y contra su GTF. Un `Sale` descontaría un inventario
 * que no existe y contaría la misma madera dos veces (el bug de `record()` que
 * ya pasó). La guía ES la venta; lo que faltaba era la deuda y el cobro, y eso
 * vive en la cuenta corriente de la parte (ADR-322).
 *
 * ## Lo que no hace
 *
 * No inventa el precio. Si la lista salió sin valor de venta, esta pieza no
 * aparece: el total tiene que salir de lo que el operador cargó, no de un
 * promedio nuestro.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, HandCoins, Loader2, UserPlus } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { FilaDespacho } from "@/lib/forestal/despacho-lista";
import { parteDelDestinatario } from "@/lib/forestal/cliente-de-la-guia";
import { Btn } from "./ctp-shared";
import { formatCurrency } from "@/lib/format";

const soles = (n: number) => `${formatCurrency(n)}`;

/** Cómo se fue el camión: todo a cuenta, todo pagado, o una parte. */
type Cobro = "cuenta" | "todo" | "parcial";

export default function CtpVentaDeLaGuia({
  filas,
  datos,
  gtfNumber,
  fecha,
}: {
  filas: readonly FilaDespacho[];
  datos: GtfDatos;
  gtfNumber: string;
  /** Fecha de emisión de la guía (YYYY-MM-DD). */
  fecha: string;
}) {
  const directorio = useDirectorioForestal();
  const [cobro, setCobro] = useState<Cobro>("cuenta");
  const [parcial, setParcial] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ saldo: number; nombre: string } | null>(null);

  /* El total sale de lo que se cargó fila por fila. Si alguna no tiene precio,
     no se suma a medias: se dice cuántas faltan y no se ofrece anotar — una
     deuda por un total incompleto es peor que ninguna. */
  const { total, sinPrecio } = useMemo(() => {
    let t = 0;
    let faltan = 0;
    for (const f of filas) {
      if (f.valorVenta == null) faltan += 1;
      else t += f.valorVenta;
    }
    return { total: Math.round(t * 100) / 100, sinPrecio: faltan };
  }, [filas]);

  /** El cliente de la guía, buscado en el directorio por documento y si no por
   *  nombre: la cuenta corriente necesita a QUIÉN, no un texto suelto. La MISMA
   *  búsqueda que propone la venta con su precio pactado (`useTratoDeVenta`). */
  const cliente = useMemo(() => {
    const d = datos.destinatario;
    const nombre = (d.nombre ?? "").trim();
    if (!nombre) return null;
    const parte = parteDelDestinatario(directorio.partes, d);
    return { nombre, doc: (d.docNumero ?? "").trim(), docTipo: d.docTipo, parte };
  }, [datos.destinatario, directorio.partes]);

  /** Cuántas líneas se valorizaron con el precio pactado con el cliente (ADR-430). */
  const conSuPrecio = filas.filter(
    (f) => f.valorVenta != null && typeof f.precioVentaDesde === "string" && f.precioVentaDesde.startsWith("cliente-"),
  ).length;

  if (total <= 0 || !cliente) return null;

  const cobrado = cobro === "todo" ? total : cobro === "parcial" ? Number(parcial || 0) : 0;
  const saldo = Math.round((total - Math.min(cobrado, total)) * 100) / 100;
  const parcialInvalido = cobro === "parcial" && !(cobrado > 0 && cobrado <= total);

  async function anotar() {
    if (!cliente) return;
    setGuardando(true);
    setError(null);
    try {
      /* Sin ficha en el directorio no hay cuenta: se da de alta con lo que la
         guía ya dice (nombre y documento) en vez de mandar a cargarla aparte. */
      const parte =
        cliente.parte ??
        (await directorio.guardarParte({
          nombre: cliente.nombre,
          roles: ["destinatario"],
          docTipo: cliente.docTipo,
          docNumero: cliente.doc || undefined,
        }));

      const r = await fetch("/api/admin/forestal/cuenta", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          accion: "venta_guia",
          parteId: parte.id,
          parteNombre: parte.nombre,
          fecha,
          gtfNumber,
          total,
          cobrado: Math.min(cobrado, total),
          notas: `Guía ${gtfNumber} · ${filas.length} producto${filas.length === 1 ? "" : "s"}`,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { saldoDeLaGuia?: number; message?: string };
      if (!r.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
      setListo({ saldo: j.saldoDeLaGuia ?? saldo, nombre: parte.nombre });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (listo) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" aria-hidden />
        <span className="text-[var(--text-primary)]">
          Anotado en la cuenta de <b>{listo.nombre}</b>:{" "}
          {listo.saldo > 0 ? (
            <>
              queda debiendo <b>{soles(listo.saldo)}</b> de {soles(total)}.
            </>
          ) : (
            <>la guía de {soles(total)} quedó saldada.</>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <HandCoins className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <p className="mr-auto text-sm font-bold text-[var(--text-primary)]">
          Esta guía vale {soles(total)} · {cliente.nombre}
          {!cliente.parte && (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-[var(--rule-base)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <UserPlus className="h-3 w-3" aria-hidden /> nuevo en el directorio
            </span>
          )}
        </p>
      </div>

      {conSuPrecio > 0 && (
        <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {conSuPrecio === filas.length ? "Todo" : `${conSuPrecio} de ${filas.length} productos`} con el precio
          pactado con {cliente.parte?.nombre ?? cliente.nombre}.
        </p>
      )}

      {sinPrecio > 0 && (
        <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {sinPrecio} producto{sinPrecio === 1 ? "" : "s"} de la guía salió sin precio: el total de
          arriba es sólo de los que lo tienen.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {(
          [
            ["cuenta", "Quedó a cuenta"],
            ["todo", "Pagó todo"],
            ["parcial", "Pagó una parte"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setCobro(k)}
            aria-pressed={cobro === k}
            className={`h-10 rounded-xl border-2 px-3 text-sm font-bold transition ${
              cobro === k
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50"
            }`}
          >
            {label}
          </button>
        ))}
        {cobro === "parcial" && (
          <label className="flex items-center gap-1.5">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Entregó
            </span>
            <input
              type="number"
              min={0}
              max={total}
              step="0.01"
              value={parcial}
              onChange={(e) => setParcial(e.target.value)}
              aria-label="Cuánto entregó"
              className="h-10 w-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
        )}
        <Btn variant="primary" onClick={() => void anotar()} disabled={guardando || parcialInvalido}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
          Anotar en su cuenta
        </Btn>
      </div>

      <p className="mt-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        {saldo > 0 ? (
          <>
            Va a quedar debiendo <b className="text-[var(--text-secondary)]">{soles(saldo)}</b>.{" "}
          </>
        ) : (
          <>La guía queda saldada. </>
        )}
        Se anota en su cuenta corriente con el número de guía — <b>no</b> descuenta stock (de eso ya
        se ocupó el libro) y se puede anotar una sola vez por guía.
      </p>

      {error && (
        <p className="mt-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </div>
  );
}
