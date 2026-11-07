/**
 * Los DETALLES de una guía importada, al costado de la hoja en «Datos de la
 * GTF» (Brandon 23-10: «los detalles estarán al costado y la otra sección
 * estarán la gtf y lista bien arriba»): lo que se pregunta primero —estado,
 * cuánto declara, cuánto hay en el libro— y debajo, en renglones cortos, quién
 * la saca, de dónde, a quién va, en qué viaja y qué especies lleva.
 *
 * También va acá la franja «Datos del registro en SERFOR» (lo que NO sale en
 * el papel: estado, quién y cuándo la registró, RUC de la instancia, dirección
 * del titular y las etiquetas que ningún casillero recoge), que mientras los
 * detalles se ven sale de la hoja: así la hoja es sólo el papel. Los casilleros
 * siguen todos en la hoja; esto es el resumen para no tener que bajar.
 *
 * Sólo lectura; los totales por especie salen de `resumenPorEspecie`, la misma
 * cuenta que el «Resumen por especie» de la lista.
 */

import { BadgeStatus, CardTitle, StatCard } from "@buleje/design-system";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { camposNoMapeados } from "@/lib/forestal/gtf-serfor-bloques";
import { resumenPorEspecie, type PiezaParaResumen } from "@/lib/forestal/loth-importar-guia-resumen";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { cn } from "@/lib/utils";
import { limpio } from "./gtf-datos-papel-comun";

/** Lo que SERFOR escribe en «estado», al tono del badge. */
function tonoDelEstado(estado: string | null): "success" | "error" | "neutral" {
  const e = (estado ?? "").toLowerCase();
  if (/anulad|vencid|cancelad/.test(e)) return "error";
  if (/activ|vigente|registrad|aprobad/.test(e)) return "success";
  return "neutral";
}

/** Varios tramos en uno («distrito, provincia, departamento»), sin las rayas ni los vacíos. */
const juntar = (sep: string, ...partes: (string | null | undefined)[]): string | null =>
  partes.map(limpio).filter(Boolean).join(sep) || null;

/** Un renglón rótulo → valor. Sin valor: con `enBlanco` lo dice, si no, no se dibuja. */
function Renglon({ rotulo, valor, mono = false, enBlanco = false }: { rotulo: string; valor: string | null; mono?: boolean; enBlanco?: boolean }) {
  if (!valor && !enBlanco) return null;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-1">
      <dt className="text-xs font-medium leading-5 text-[var(--text-secondary)]">{rotulo}</dt>
      <dd className={cn("min-w-0 break-words text-sm text-[var(--text-primary)]", mono && valor && "font-mono", !valor && "italic text-[var(--text-tertiary)]")}>
        {valor ?? "En blanco"}
      </dd>
    </div>
  );
}

/** Un bloque con su título; si ningún renglón tiene valor, no ocupa lugar. */
function Bloque({ titulo, children, hay = true }: { titulo: string; children: ReactNode; hay?: boolean }) {
  if (!hay) return null;
  return (
    <section className="border-t border-[var(--rule-soft)] pt-3">
      <CardTitle className="mb-1 text-sm font-bold">{titulo}</CardTitle>
      <dl className="divide-y divide-[var(--rule-soft)]">{children}</dl>
    </section>
  );
}

export default function GtfDatosDetalles({
  ficha,
  verificada,
  nroLista,
  piezas,
  className,
}: {
  ficha: GtfSerfor;
  /** `true` = vino de SERFOR; `false` = leída de una foto o PDF. */
  verificada: boolean;
  /** El N° de la Lista de trozas (35) que trajo la guía. */
  nroLista: string | null;
  piezas: readonly PiezaParaResumen[];
  className?: string;
}) {
  const r = resumenPorEspecie(piezas, ficha.productos);
  const estado = limpio(ficha.estado);
  const declarado = ficha.volumenTotal ?? r.declaradoM3;
  const otros = camposNoMapeados(ficha);
  const transporte = juntar(" · ", ficha.placa, ficha.tipoVehiculo, ficha.tipoTransporte);
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <BadgeStatus variant={tonoDelEstado(estado)} label={estado ? `SERFOR: ${estado}` : "Estado sin publicar"} dot size="md" />
        <BadgeStatus
          variant={verificada ? "success" : "warning"}
          label={verificada ? "Verificada en SERFOR" : "Sin verificar: de foto o PDF"}
          size="md"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard density="compact" label="Declara la guía" value={declarado != null ? `${fmtM3(declarado)} m³` : "No lo publica"} />
        <StatCard
          density="compact"
          label="En el libro"
          value={`${fmtM3(r.m3)} m³`}
          subValue={`${formatNumber(r.trozas)} ${r.trozas === 1 ? "troza" : "trozas"}`}
        />
      </div>

      <Bloque titulo="La guía">
        <Renglon rotulo="N° de registro" valor={limpio(ficha.numeroRegistro)} mono />
        <Renglon rotulo="Expedición" valor={limpio(ficha.fechaExpedicion)} />
        <Renglon rotulo="Vencimiento" valor={limpio(ficha.fechaVencimiento)} />
        <Renglon rotulo="Lista de trozas" valor={limpio(nroLista ?? ficha.listaTrozas)} mono />
      </Bloque>

      <Bloque titulo="Origen" hay={Boolean(juntar("", ficha.titular, ficha.numeroTitulo, ficha.origenRecurso, ficha.distrito))}>
        <Renglon rotulo="Titular" valor={limpio(ficha.titular)} />
        <Renglon rotulo="Título" valor={juntar(" · ", ficha.numeroTitulo, ficha.origenRecurso)} />
        <Renglon rotulo="Lugar" valor={juntar(", ", ficha.distrito, ficha.provincia, ficha.departamento)} />
      </Bloque>

      <Bloque titulo="Propietario" hay={Boolean(juntar("", ficha.propietario, ficha.propietarioDoc))}>
        <Renglon rotulo="Nombre" valor={limpio(ficha.propietario)} />
        <Renglon rotulo="DNI / RUC" valor={limpio(ficha.propietarioDoc)} mono />
        <Renglon rotulo="Partida" valor={juntar(", ", ficha.propietarioDireccion, ficha.propietarioDistrito, ficha.propietarioProvincia)} />
      </Bloque>

      <Bloque titulo="Destinatario" hay={Boolean(juntar("", ficha.destinatario, ficha.destinatarioDoc))}>
        <Renglon rotulo="Nombre" valor={limpio(ficha.destinatario)} />
        <Renglon rotulo="DNI / RUC" valor={limpio(ficha.destinatarioDoc)} mono />
        <Renglon rotulo="Llegada" valor={juntar(", ", ficha.destinatarioDireccion, ficha.destinatarioDistrito, ficha.destinatarioProvincia)} />
      </Bloque>

      <Bloque titulo="Transporte" hay={Boolean(juntar("", ficha.transportista, transporte, ficha.guiaRemision))}>
        <Renglon rotulo="Conductor" valor={juntar(" · DNI ", ficha.transportista, ficha.transportistaDni)} />
        <Renglon rotulo="Vehículo" valor={transporte} mono={Boolean(limpio(ficha.placa))} />
        <Renglon rotulo="Guía remisión" valor={limpio(ficha.guiaRemision)} mono />
      </Bloque>

      <Bloque titulo={`Especies (${formatNumber(r.filas.length)})`} hay={r.filas.length > 0}>
        {r.filas.map((f) => (
          <div key={f.clave} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="min-w-0 text-sm text-[var(--text-primary)]">
              {f.comun}
              {f.cientifico && <span className="block truncate text-xs italic text-[var(--text-secondary)]">{f.cientifico}</span>}
            </dt>
            <dd className="shrink-0 text-right text-sm tabular-nums text-[var(--text-primary)]">
              {fmtM3(f.m3)} m³
              <span className="block text-xs text-[var(--text-secondary)]">
                {formatNumber(f.trozas)} {f.trozas === 1 ? "troza" : "trozas"}
              </span>
            </dd>
          </div>
        ))}
      </Bloque>

      <Bloque titulo="Registro en SERFOR">
        <Renglon rotulo="Estado" valor={estado} enBlanco />
        <Renglon rotulo="Registrada" valor={juntar(" · ", ficha.fechaRegistro, ficha.registradoPor)} enBlanco />
        <Renglon rotulo="RUC instancia" valor={limpio(ficha.rucInstancia)} mono enBlanco />
        <Renglon rotulo="Dirección del titular" valor={limpio(ficha.direccionTitular)} enBlanco />
        {otros.map((c) => (
          <Renglon key={c.etiqueta} rotulo={c.etiqueta} valor={limpio(c.valor)} enBlanco />
        ))}
      </Bloque>
    </div>
  );
}
