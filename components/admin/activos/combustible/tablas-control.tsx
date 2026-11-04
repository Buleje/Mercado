"use client";

/**
 * El control del almacén: el saldo de cada día del mes (con su aviso si pasó
 * lo declarado) y los conteos físicos contra lo que decía el cuaderno.
 */

import { Ban } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import ActionMenu from "@/components/admin/shared/action-menu";
import { diaLima, saldoDiario, type ConteoCuaderno } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { NIVEL, TONO_TEXTO, diaCorto, fechaHora, gal, hoyLima } from "./compartido";
import type { PedirAnular } from "./tablas-movimientos";
import type { CuadernoCombustible } from "./use-cuaderno-combustible";

const TACHADO = "line-through opacity-60";

/** «+3,5 gal» / «−2 gal» / «0». */
function conSigno(n: number): string {
  if (Math.abs(n) < 0.005) return "0";
  return `${n > 0 ? "+" : "−"}${gal(Math.abs(n))}`;
}

export function TablaSaldoDiario({ c, mes }: { c: CuadernoCombustible; mes: string }) {
  if (!c.datos || !c.rec) return null;
  const desde = `${mes}-01`;
  const [a, m] = mes.split("-").map(Number);
  const finMes = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const hoy = hoyLima();
  const hasta = finMes < hoy ? finMes : hoy;
  if (hasta < desde) return <p className="px-1 py-6 text-sm text-[var(--text-tertiary)]">Ese mes todavía no empieza.</p>;
  const dias = saldoDiario(c.rec, c.datos.config, desde, hasta).reverse();
  return (
    <DataTable className="min-w-[620px]" data-combustible-saldo-diario>
      <thead>
        <tr>
          <th>Día</th>
          <th className="text-right">Entró</th>
          <th className="text-right">Salió</th>
          <th className="text-right">Ajuste</th>
          <th className="text-right">Saldo</th>
          <th className="text-right">Cilindros</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {dias.map((d) => {
          const n = NIVEL[d.nivel];
          return (
            <tr key={d.dia} className={cn(!d.conMovimiento && "text-[var(--text-tertiary)]")}>
              <td className="tabular-nums font-semibold">{diaCorto(d.dia)}</td>
              <td className="text-right tabular-nums">{d.entradasGal > 0 ? `${gal(d.entradasGal)} (${d.entradasCil} cil.)` : "—"}</td>
              <td className="text-right tabular-nums">{d.salidasGal > 0 ? `${gal(d.salidasGal)} (${d.vales} vale${d.vales === 1 ? "" : "s"})` : "—"}</td>
              <td className="text-right tabular-nums">{Math.abs(d.ajusteGal) >= 0.005 ? conSigno(d.ajusteGal) : "—"}</td>
              <td className="text-right tabular-nums font-bold">{gal(d.saldoGal)}</td>
              <td className="text-right tabular-nums">{d.cilindros}</td>
              <td className={cn("text-sm font-semibold", TONO_TEXTO[n.tono])} title={n.largo}>{n.corto}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

export function TablaConteos({ c, onAnular }: { c: CuadernoCombustible; onAnular: PedirAnular }) {
  const vivo = new Map<string, { libroGal: number; libroCil: number; difGal: number; difCil: number }>();
  for (const r of c.rec?.renglones ?? []) if (r.tipo === "conteo") vivo.set(r.conteo.id, r);
  const lista: ConteoCuaderno[] = [...(c.datos?.conteos ?? [])].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  if (lista.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
        Todavía no hay conteos. Una vez por semana cuenta los cilindros, mide los galones y anótalo: lo contado manda.
      </p>
    );
  return (
    <DataTable className="min-w-[720px]" data-combustible-conteos>
      <thead>
        <tr>
          <th>Fecha</th>
          <th className="text-right">Contado</th>
          <th className="text-right">Cuaderno</th>
          <th className="text-right">Diferencia</th>
          <th>Contó</th>
          <th>Testigo</th>
          <th><span className="sr-only">Opciones</span></th>
        </tr>
      </thead>
      <tbody>
        {lista.map((k) => {
          const v = vivo.get(k.id);
          const libroGal = v?.libroGal ?? k.galonesLibro;
          const libroCil = v?.libroCil ?? k.cilindrosLibro;
          const dif = v?.difGal ?? Math.round((k.galonesContados - k.galonesLibro) * 100) / 100;
          const tono = Math.abs(dif) < 0.5 ? "ok" : dif < 0 ? "error" : "aviso";
          return (
            <tr key={k.id} className={cn(k.anulado && TACHADO)}>
              <td className="whitespace-nowrap tabular-nums">
                {fechaHora(k.fecha)}
                {k.anulado && <span className={cn("block text-xs font-semibold", TONO_TEXTO.error)}>Anulado</span>}
              </td>
              <td className="text-right tabular-nums font-semibold">{gal(k.galonesContados)} · {k.cilindrosContados} cil.</td>
              <td className="text-right tabular-nums">{gal(libroGal)} · {libroCil} cil.</td>
              <td className={cn("text-right tabular-nums font-bold", TONO_TEXTO[tono])}>
                {conSigno(dif)}
                {tono !== "ok" && <span className="block text-xs font-semibold">{dif < 0 ? "faltante" : "sobrante"}</span>}
              </td>
              <td>{k.contadoPor}</td>
              <td>{k.testigo ?? "—"}</td>
              <td className="text-right">
                {!k.anulado && (
                  <ActionMenu
                    label="Opciones del conteo"
                    soloIcono
                    size="sm"
                    actions={[
                      {
                        id: "anular", label: "Anular conteo", hint: "El cuaderno vuelve a lo que decía sin este conteo", icon: Ban, tone: "danger",
                        onSelect: () => onAnular("conteos", k.id, `Conteo del ${diaLima(k.fecha)}: ${gal(k.galonesContados)} contados`),
                      },
                    ]}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
