"use client";

/**
 * Ingresos (compras de cilindros y stock inicial) y vales de salida por
 * máquina. Lo anulado sigue a la vista, tachado y con su motivo: el cuaderno
 * no se borra (ADR-533).
 */

import { Ban, FileSignature } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import ActionMenu from "@/components/admin/shared/action-menu";
import { diaLima, rangoCilindros, type IngresoCuaderno, type ValeCuaderno } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { TONO_TEXTO, fechaHora, gal, num1, soles, cil } from "./compartido";
import type { CuadernoCombustible, TipoRenglon } from "./use-cuaderno-combustible";

export type PedirAnular = (tipo: TipoRenglon, id: string, que: string) => void;

const TACHADO = "line-through opacity-60";

function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">{texto}</p>;
}

function Anulado({ motivo }: { motivo: string | null }) {
  return <span className={cn("block text-xs font-semibold no-underline", TONO_TEXTO.error)}>Anulado{motivo ? `: ${motivo}` : ""}</span>;
}

export function TablaIngresos({ c, onAnular }: { c: CuadernoCombustible; onAnular: PedirAnular }) {
  const lista: IngresoCuaderno[] = [...(c.datos?.ingresos ?? [])].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  if (lista.length === 0) return <Vacio texto="Todavía no hay ingresos. Anota la primera compra de cilindros (o lo que ya tienes guardado como stock inicial)." />;
  return (
    <DataTable className="min-w-[760px]" data-combustible-ingresos>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Comprobante</th>
          <th>Grifo</th>
          <th>Cilindros</th>
          <th className="text-right">Galones</th>
          <th className="text-right">Precio/gal</th>
          <th className="text-right">Monto</th>
          <th><span className="sr-only">Opciones</span></th>
        </tr>
      </thead>
      <tbody>
        {lista.map((i) => (
          <tr key={i.id}>
            <td className="whitespace-nowrap tabular-nums">{fechaHora(i.fecha)}</td>
            <td className={cn(i.anulado && TACHADO)}>
              {i.tipo === "inicial" ? (
                <span className="font-semibold">Stock inicial</span>
              ) : (
                <>
                  <span className="font-mono font-semibold">{i.factura ?? "—"}</span>
                  {i.guia && <span className="block text-xs text-[var(--text-tertiary)]">Guía {i.guia}</span>}
                </>
              )}
              {i.anulado && <Anulado motivo={i.motivoAnulacion} />}
            </td>
            <td className={cn(i.anulado && TACHADO)}>
              {i.grifo ?? "—"}
              {i.grifoRuc && <span className="block font-mono text-xs text-[var(--text-tertiary)]">RUC {i.grifoRuc}</span>}
            </td>
            <td className={cn("whitespace-nowrap font-mono", i.anulado && TACHADO)}>
              {i.cilindros} · {rangoCilindros(i.primerCilindro, i.cilindros)}
            </td>
            <td className={cn("text-right tabular-nums font-semibold", i.anulado && TACHADO)}>{gal(i.galones)}</td>
            <td className={cn("text-right tabular-nums", i.anulado && TACHADO)}>{i.precioGal != null ? soles(i.precioGal) : "—"}</td>
            <td className={cn("text-right tabular-nums", i.anulado && TACHADO)}>
              {i.monto > 0 ? soles(i.monto) : "—"}
              {i.gastoId && <span className="block text-xs text-[var(--text-tertiary)]">en Mi Plata</span>}
            </td>
            <td className="text-right">
              {!i.anulado && (
                <ActionMenu
                  label="Opciones del ingreso"
                  soloIcono
                  size="sm"
                  actions={[
                    {
                      id: "anular", label: "Anular ingreso", hint: "Deja de contar en el saldo (no se borra)", icon: Ban, tone: "danger",
                      onSelect: () => onAnular("ingresos", i.id, `${i.tipo === "inicial" ? "Stock inicial" : `Factura ${i.factura ?? "—"}`}: ${cil(i.cilindros)}, ${gal(i.galones)} del ${diaLima(i.fecha)}`),
                    },
                  ]}
                />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function TablaVales({ c, onAnular, onVerFirma }: { c: CuadernoCombustible; onAnular: PedirAnular; onVerFirma: (v: ValeCuaderno) => void }) {
  const salidas = new Map<string, { de: string[]; sinResp: number }>();
  for (const r of c.rec?.renglones ?? []) if (r.tipo === "vale") salidas.set(r.vale.id, { de: r.deCilindros, sinResp: r.sinRespaldoGal });
  const lista: ValeCuaderno[] = [...(c.datos?.vales ?? [])].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  if (lista.length === 0) return <Vacio texto="Todavía no hay vales. Cada vez que le echas combustible a una máquina, anota su vale con el horómetro y la firma del operador." />;
  return (
    <DataTable className="min-w-[820px]" data-combustible-vales>
      <thead>
        <tr>
          <th>N.°</th>
          <th>Fecha</th>
          <th>Máquina</th>
          <th className="text-right">Horómetro</th>
          <th className="text-right">Galones</th>
          <th>Sale de</th>
          <th className="text-right">Gal/h</th>
          <th>Operador</th>
          <th><span className="sr-only">Opciones</span></th>
        </tr>
      </thead>
      <tbody>
        {lista.map((v) => {
          const s = salidas.get(v.id);
          const rend = c.rendimiento.get(v.id);
          return (
            <tr key={v.id}>
              <td className={cn("font-mono font-semibold tabular-nums", v.anulado && TACHADO)}>{v.numero ?? "—"}</td>
              <td className="whitespace-nowrap tabular-nums">{fechaHora(v.fecha)}</td>
              <td className={cn(v.anulado && TACHADO)}>
                <span className="font-semibold">{v.maquina}</span>
                {v.placa && <span className="block font-mono text-xs text-[var(--text-tertiary)]">{v.placa}</span>}
                {v.anulado && <Anulado motivo={v.motivoAnulacion} />}
              </td>
              <td className={cn("text-right tabular-nums", v.anulado && TACHADO)}>{v.horometro != null ? num1(v.horometro) : "—"}</td>
              <td className={cn("text-right tabular-nums font-semibold", v.anulado && TACHADO)}>{gal(v.galones)}</td>
              <td className="whitespace-nowrap font-mono text-sm">
                {v.anulado ? "—" : s ? (
                  <>
                    {s.de.join(", ") || "—"}
                    {s.sinResp > 0 && <span className={cn("block font-sans text-xs font-semibold", TONO_TEXTO.error)}>{gal(s.sinResp)} sin respaldo</span>}
                  </>
                ) : "—"}
              </td>
              <td className="text-right tabular-nums">
                {rend?.galPorHora != null ? (
                  <span className={cn(rend.sobreMeta && cn("font-bold", TONO_TEXTO.aviso))} title={rend.meta != null ? `Meta ${rend.meta} gal/h · ${rend.horas} h desde el vale anterior` : `${rend.horas} h desde el vale anterior`}>
                    {num1(rend.galPorHora)}
                    {rend.meta != null && <span className="block text-xs text-[var(--text-tertiary)]">meta {num1(rend.meta)}</span>}
                  </span>
                ) : "—"}
              </td>
              <td>
                {v.operador ?? "—"}
                <span className="block text-xs text-[var(--text-tertiary)]">{v.firmado ? "Firmado" : "Sin firma"}</span>
              </td>
              <td className="text-right">
                <ActionMenu
                  label="Opciones del vale"
                  soloIcono
                  size="sm"
                  actions={[
                    ...(v.firmado ? [{ id: "firma", label: "Ver la firma", icon: FileSignature, onSelect: () => onVerFirma(v) }] : []),
                    ...(!v.anulado
                      ? [{
                          id: "anular", label: "Anular vale", hint: "Deja de contar en el saldo y en la máquina", icon: Ban, tone: "danger" as const,
                          onSelect: () => onAnular("vales", v.id, `Vale ${v.numero ?? ""} · ${v.maquina}: ${gal(v.galones)} del ${diaLima(v.fecha)}`),
                        }]
                      : []),
                  ]}
                  vacio={<span className="text-sm text-[var(--text-tertiary)]">Sin opciones</span>}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
