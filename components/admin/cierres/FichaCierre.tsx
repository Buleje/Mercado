"use client";

/** La ficha de un cierre del día: ventas, cuadre de caja, fiados, stock y notas. */
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fechaDelCierre, textoDiferencia, type CierreDelDia } from "./cierres";

function Dato({ rotulo, valor, clase }: { rotulo: string; valor: string; clase?: string }) {
  return (
    <div>
      <dt className="text-sm text-[var(--text-secondary)]">{rotulo}</dt>
      <dd className={cn("text-base font-bold tabular-nums text-[var(--text-primary)]", clase)}>{valor}</dd>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-[var(--rule-soft)] pt-3 first:border-t-0 first:pt-0">
      <CardTitle className="text-sm font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
      {children}
    </section>
  );
}

type AlertaGuardada = { nombre?: string; name?: string; stock?: number; stockMin?: number };

/** El cierre a mano guarda `{nombre, stock, stockMin}`; el cron, `{id, name, stock}`. */
function alertasDeStock(texto: string): Array<{ nombre: string; stock: number; stockMin: number | null }> | null {
  try {
    const v = JSON.parse(texto) as unknown;
    if (!Array.isArray(v)) return null;
    return (v as AlertaGuardada[]).map((a) => ({ nombre: a.nombre ?? a.name ?? "—", stock: a.stock ?? 0, stockMin: a.stockMin ?? null }));
  } catch {
    return null;
  }
}

export default function FichaCierre({ cierre, onClose }: { cierre: CierreDelDia; onClose: () => void }) {
  const dif = textoDiferencia(cierre);
  const alertas = cierre.stockAlertas ? alertasDeStock(cierre.stockAlertas) : null;
  return (
    <AdminModal open onClose={onClose} title={`Cierre del ${fechaDelCierre(cierre.fecha)}`}>
      <div className={`${MODAL_BODY} space-y-4`}>
        <Bloque titulo="Ventas">
          <dl className="grid grid-cols-3 gap-3">
            <Dato rotulo="Vendido" valor={formatCurrency(Number(cierre.totalVentas))} />
            <Dato rotulo="Ventas" valor={String(cierre.cantidadVentas)} />
            <Dato rotulo="Ticket promedio" valor={formatCurrency(Number(cierre.ticketPromedio))} />
          </dl>
          {(cierre.mejorHora || cierre.productoTop) && (
            <p className="text-sm text-[var(--text-secondary)]">
              {cierre.mejorHora && <>Mejor hora: <strong className="text-[var(--text-primary)]">{cierre.mejorHora}</strong></>}
              {cierre.mejorHora && cierre.productoTop && " · "}
              {cierre.productoTop && <>Más vendido: <strong className="text-[var(--text-primary)]">{cierre.productoTop}</strong></>}
            </p>
          )}
        </Bloque>
        <Bloque titulo="Caja">
          <dl className="grid grid-cols-3 gap-3">
            <Dato rotulo="Contado" valor={cierre.efectivoContado != null ? formatCurrency(Number(cierre.efectivoContado)) : "Sin contar"} />
            <Dato rotulo="Esperado" valor={formatCurrency(Number(cierre.efectivoEsperado))} />
            <Dato rotulo="Diferencia" valor={dif.texto} clase={dif.clase} />
          </dl>
        </Bloque>
        {!cierre.sinResumen && (
          <Bloque titulo="Fiados">
            <dl className="grid grid-cols-3 gap-3">
              <Dato rotulo="Cobrados" valor={formatCurrency(Number(cierre.fiadosCobrados))} />
              <Dato rotulo="Nuevos" valor={formatCurrency(Number(cierre.fiadosNuevos))} />
              <Dato rotulo="Vencidos" valor={String(cierre.fiadosVencidos)} clase={cierre.fiadosVencidos > 0 ? "text-[var(--data-error-ink)]" : undefined} />
            </dl>
          </Bloque>
        )}
        {cierre.stockAlertas && (
          <Bloque titulo="Stock bajo al cerrar">
            {alertas ? (
              <ul className="space-y-1 text-sm">
                {alertas.map((a, i) => (
                  <li key={`${a.nombre}-${i}`} className="flex justify-between gap-2">
                    <span className="truncate text-[var(--text-primary)]">{a.nombre}</span>
                    <span className="shrink-0 font-bold tabular-nums text-[var(--data-error-ink)]">{a.stockMin != null ? `${a.stock}/${a.stockMin}` : a.stock}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">{cierre.stockAlertas}</p>
            )}
          </Bloque>
        )}
        {cierre.notas && (
          <Bloque titulo="Notas">
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{cierre.notas}</p>
          </Bloque>
        )}
        {/* Sin resumen guardado no hay quién «cerró»; el del cron no lo hizo una persona. */}
        {cierre.creadoPor && (
          <p className="text-sm text-[var(--text-secondary)]">
            {cierre.creadoPor === "cron" ? "Resumen automático" : `Cerró ${cierre.creadoPor}`} · {formatDateTime(cierre.createdAt)}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
