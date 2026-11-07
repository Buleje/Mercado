"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { BadgeStatus, DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PlantaResumen } from "@/lib/superadmin/plantas-forestales/tipos";
import { Pt, SemaforoBadge, SinLectura } from "./cifras";
import { diaCorto, m3, NOTA_PT, NOTA_PT_ROLLIZA, pct, piezas, TONO_CUMPLIMIENTO } from "./formato";

const urlFicha = (p: PlantaResumen, sufijo: string) => `/superadmin/plantas/${encodeURIComponent(p.identidad.tenantId)}${sufijo}`;

function Linea({ children, tenue }: { children: ReactNode; tenue?: boolean }) {
  return <div className={tenue ? "text-[var(--text-tertiary)] whitespace-nowrap" : "whitespace-nowrap tabular-nums"}>{children}</div>;
}

function Nombre({ p, sufijo }: { p: PlantaResumen; sufijo: string }) {
  return (
    <div className="min-w-0">
      <Link href={urlFicha(p, sufijo)} title={p.identidad.slug} className="font-semibold text-[var(--text-primary)] hover:underline">
        {p.identidad.nombre}
      </Link>
      {(p.identidad.esPrueba || !p.identidad.activo) && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {p.identidad.esPrueba && <BadgeStatus variant="neutral" label="Prueba" size="sm" />}
          {!p.identidad.activo && <BadgeStatus variant="error" label="Inactiva" size="sm" />}
        </div>
      )}
    </div>
  );
}

function Trozas({ p }: { p: PlantaResumen }) {
  if (!p.trozas) return <SinLectura fuente="patio" />;
  return (
    <>
      <Linea>{m3(p.trozas.enPatio.m3)}</Linea>
      <Linea tenue>{piezas(p.trozas.enPatio.piezas)}</Linea>
      <Linea tenue><Pt valor={p.trozas.enPatio.ptAserrable} nota={NOTA_PT_ROLLIZA} /></Linea>
    </>
  );
}

function Aserrada({ p }: { p: PlantaResumen }) {
  if (!p.aserrada) return <SinLectura fuente="disponibles" />;
  return (
    <>
      <Linea>{m3(p.aserrada.disponibleM3)}</Linea>
      <Linea tenue><Pt valor={p.aserrada.disponiblePt} /></Linea>
    </>
  );
}

function Periodo({ p, conRinde }: { p: PlantaResumen; conRinde?: boolean }) {
  if (!p.movimiento) return <SinLectura fuente="saldos" />;
  return (
    <>
      <Linea><span className="text-[var(--text-tertiary)]">Entró </span>{m3(p.movimiento.ingresoM3)}</Linea>
      <Linea><span className="text-[var(--text-tertiary)]">Salió </span>{m3(p.movimiento.despachadoM3)}</Linea>
      {conRinde && <Linea><span className="text-[var(--text-tertiary)]">Rinde </span>{pct(p.movimiento.rendimientoPct)}</Linea>}
    </>
  );
}

function Incoherencias({ p }: { p: PlantaResumen }) {
  const { error, warning, m3EnJuego } = p.incoherencias;
  if (error + warning === 0) return <span className="text-[var(--text-tertiary)]">Ninguna</span>;
  return (
    <>
      {error > 0 && <Linea><span className="font-semibold text-[var(--data-error)]">{error} {error === 1 ? "error" : "errores"}</span></Linea>}
      {warning > 0 && <Linea><span className="text-[var(--data-warning)]">{warning} {warning === 1 ? "aviso" : "avisos"}</span></Linea>}
      <Linea tenue>{m3(m3EnJuego)} en juego</Linea>
    </>
  );
}

function Cumplimiento({ p }: { p: PlantaResumen }) {
  if (p.lecturas.cumplimiento === "error") return <SinLectura fuente="cumplimiento" />;
  if (!p.cumplimiento) return <span className="text-[var(--text-tertiary)]">Sin medir</span>;
  return (
    <>
      <BadgeStatus variant={TONO_CUMPLIMIENTO[p.cumplimiento.tono]} label={`${p.cumplimiento.score} / 100`} size="sm" />
      <Linea tenue>Medido el {diaCorto(p.cumplimiento.fecha)}</Linea>
    </>
  );
}

function Actividad({ p }: { p: PlantaResumen }) {
  const dias = p.diasSinActividad;
  return (
    <>
      <Linea>{dias == null ? "Sin movimientos" : dias === 0 ? "Movió hoy" : `Movió hace ${dias} ${dias === 1 ? "día" : "días"}`}</Linea>
      <Linea tenue>{p.ultimaInspeccion ? `Inspección ${diaCorto(p.ultimaInspeccion.fecha)}` : "Nunca inspeccionada"}</Linea>
    </>
  );
}

/** Lista de plantas: tabla en computadora, tarjetas en el celular. Cada fila abre su ficha. */
export function PlantasTabla({ plantas, sufijo }: { plantas: PlantaResumen[]; sufijo: string }) {
  const router = useRouter();
  const abrir = (p: PlantaResumen) => (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    router.push(urlFicha(p, sufijo));
  };

  return (
    <>
      <div className="hidden md:block">
        <DataTable>
          <thead>
            <tr>
              <th>Planta</th>
              <th className="text-right">Trozas en patio</th>
              <th className="text-right">
                <span className="inline-flex items-center gap-1">Aserrada <InfoTip title="Pies tablares" what={NOTA_PT} side="bottom" /></span>
              </th>
              <th className="text-right">Período</th>
              <th>Incoherencias</th>
              <th>Cumplimiento y actividad</th>
            </tr>
          </thead>
          <tbody>
            {plantas.map((p) => (
              <tr key={p.identidad.tenantId} onClick={abrir(p)} className="cursor-pointer align-top">
                <td className="max-w-72">
                  <Nombre p={p} sufijo={sufijo} />
                  <div className="mt-1.5"><SemaforoBadge semaforo={p.semaforo} /></div>
                  <div className="mt-1 text-[var(--text-secondary)]">{p.motivoSemaforo}</div>
                </td>
                <td className="text-right"><Trozas p={p} /></td>
                <td className="text-right"><Aserrada p={p} /></td>
                <td className="text-right"><Periodo p={p} conRinde /></td>
                <td><Incoherencias p={p} /></td>
                <td><Cumplimiento p={p} /><div className="mt-1.5"><Actividad p={p} /></div></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <ul className="space-y-3 md:hidden">
        {plantas.map((p) => (
          <li
            key={p.identidad.tenantId}
            onClick={abrir(p)}
            className="cursor-pointer rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <Nombre p={p} sufijo={sufijo} />
              <span className="shrink-0"><SemaforoBadge semaforo={p.semaforo} /></span>
            </div>
            <p className="mt-1 text-[var(--text-secondary)]">{p.motivoSemaforo}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <Dato titulo="Trozas en patio"><Trozas p={p} /></Dato>
              <Dato titulo="Aserrada"><Aserrada p={p} /></Dato>
              <Dato titulo="Período"><Periodo p={p} /></Dato>
              <Dato titulo="Rendimiento">{p.movimiento ? pct(p.movimiento.rendimientoPct) : <SinLectura fuente="saldos" />}</Dato>
              <Dato titulo="Incoherencias"><Incoherencias p={p} /></Dato>
              <Dato titulo="Cumplimiento"><Cumplimiento p={p} /></Dato>
              <Dato titulo="Actividad" ancho><Actividad p={p} /></Dato>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function Dato({ titulo, children, ancho }: { titulo: string; children: ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">{titulo}</dt>
      <dd className="mt-0.5 min-w-0 [&_div]:whitespace-normal">{children}</dd>
    </div>
  );
}
