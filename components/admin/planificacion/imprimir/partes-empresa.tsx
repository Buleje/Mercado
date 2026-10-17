/**
 * Plan impreso › la empresa y la plata (ADR-497): ficha, identidad, modelo
 * de negocio, licencias, socios e inversión, como texto y tablas de papel.
 */
import { BlockTitle, DataTable } from "@buleje/design-system";
import { estadoLicencia, etiquetaFuente, participacion, totalesInversion } from "@/lib/planificacion/calculos";
import { BLOQUES_LIENZO, type DatosSeccion } from "@/lib/planificacion/secciones";
import { formatCurrency } from "@/lib/format";
import { BLOQUE_LIENZO } from "../empresa/textos-empresa";
import { chipLicencia, ordenarLicencias } from "../empresa/licencias-util";
import { porciento } from "../socios/BarraParticipacion";
import { fraseRecupero } from "../socios/InversionTotales";
import { ROTULO_APORTE } from "../socios/SocioModal";
import { DatosDoc, ListaDoc, NotaDoc, ParrafoDoc, fechaDoc } from "./piezas-doc";

export function FichaDoc({ d }: { d: DatosSeccion<"ficha"> }) {
  return (
    <>
      <DatosDoc
        filas={[
          ["Razón social", d.razonSocial],
          ["Nombre comercial", d.nombreComercial],
          ["Tipo de sociedad", d.tipoSociedad],
          ["Régimen tributario", d.regimenTributario],
          ["Rubro", d.rubro],
          ["Tipo de negocio", d.tipoNegocio],
          ["CIIU", d.ciiu],
          ["Inicio de actividades", fechaDoc(d.fechaInicio)],
          ["Horario", d.horario],
          ["Correo", d.correo],
          ["Redes", d.redes],
        ]}
      />
      <ParrafoDoc rotulo="A qué se dedica" texto={d.descripcion} />
    </>
  );
}

export function IdentidadDoc({ d }: { d: DatosSeccion<"identidad"> }) {
  return (
    <>
      <ParrafoDoc rotulo="Misión" texto={d.mision} />
      <ParrafoDoc rotulo="Visión" texto={d.vision} />
      {d.valores.length > 0 ? (
        <div className="break-inside-avoid space-y-0.5">
          <BlockTitle as="h3">Valores</BlockTitle>
          <ListaDoc
            items={d.valores.map((v) => (
              <span key={v.id}>
                <strong className="font-semibold">{v.nombre}</strong>
                {v.descripcion ? `: ${v.descripcion}` : ""}
              </span>
            ))}
          />
        </div>
      ) : null}
      <ParrafoDoc rotulo="Propuesta de valor" texto={d.propuestaValor} />
      <ParrafoDoc rotulo="Cliente ideal" texto={d.clienteIdeal} />
      <ParrafoDoc rotulo="Qué la hace distinta" texto={d.diferenciadores} />
      <ParrafoDoc rotulo="Lema" texto={d.lema} />
    </>
  );
}

export function LienzoDoc({ d }: { d: DatosSeccion<"lienzo"> }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 print:grid-cols-3">
      {BLOQUES_LIENZO.map((b) => (
        <div key={b} className="break-inside-avoid space-y-1 rounded-lg border border-[var(--rule-base)] p-2">
          <BlockTitle as="h3">{BLOQUE_LIENZO[b].rotulo}</BlockTitle>
          {d[b].length > 0 ? <ListaDoc items={d[b].map((n) => n.texto)} /> : <NotaDoc>—</NotaDoc>}
        </div>
      ))}
    </div>
  );
}

export function LicenciasDoc({ d, hoy }: { d: DatosSeccion<"licencias">; hoy: string }) {
  return (
    <DataTable aria-label="Licencias y permisos">
      <thead>
        <tr>
          <th>Licencia</th>
          <th>Entidad</th>
          <th>Número</th>
          <th className="whitespace-nowrap">Vence</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {ordenarLicencias(d.items, hoy).map((l) => {
          const { estado, dias } = estadoLicencia(l, hoy);
          return (
            <tr key={l.id}>
              <td className="font-medium">{l.nombre}</td>
              <td>{l.entidad || "—"}</td>
              <td>{l.numero || "—"}</td>
              <td className="whitespace-nowrap">{l.vence ? fechaDoc(l.vence) : "—"}</td>
              <td>{chipLicencia(estado, dias).label}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

export function SociosDoc({ d }: { d: DatosSeccion<"socios"> }) {
  const p = participacion(d.items);
  const pct = new Map(p.socios.map((s) => [s.id, s.porcentaje]));
  return (
    <>
      <DataTable aria-label="Socios">
        <thead>
          <tr>
            <th>Socio</th>
            <th>Documento</th>
            <th>Cargo</th>
            <th className="text-right">Aporte</th>
            <th>Tipo de aporte</th>
            <th className="text-right">Participación</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.nombre}</td>
              <td>{s.documento || "—"}</td>
              <td>{s.cargo || "—"}</td>
              <td className="text-right whitespace-nowrap tabular-nums">{formatCurrency(s.aporte)}</td>
              <td>{ROTULO_APORTE[s.tipoAporte]}</td>
              <td className="text-right whitespace-nowrap tabular-nums">{porciento(pct.get(s.id) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!p.cuadra ? <NotaDoc>La participación suma {porciento(p.total)}: falta acordar el reparto.</NotaDoc> : null}
    </>
  );
}

export function InversionDoc({ d, socios, hoy }: { d: DatosSeccion<"inversion">; socios: DatosSeccion<"socios">["items"]; hoy: string }) {
  const t = totalesInversion(d, socios);
  return (
    <>
      <DatosDoc
        filas={[
          ["Inversión total", formatCurrency(t.total)],
          ["Aportan los socios", socios.length > 0 ? formatCurrency(t.aportesSocios) : ""],
          ["Ganancia esperada al mes", d.gananciaMensualEsperada ? formatCurrency(d.gananciaMensualEsperada) : ""],
          ["Recuperación", t.mesesRecupero ? fraseRecupero(t.mesesRecupero, hoy) : ""],
        ]}
      />
      {d.items.length > 0 ? (
        <DataTable aria-label="Gastos de la inversión inicial">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Categoría</th>
              <th>De dónde salió</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((i) => (
              <tr key={i.id}>
                <td className="font-medium">{i.concepto}</td>
                <td>{i.categoria}</td>
                <td>{etiquetaFuente(i.fuente, socios)}</td>
                <td className="text-right whitespace-nowrap tabular-nums">{formatCurrency(i.monto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-semibold">Total</td>
              <td />
              <td />
              <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatCurrency(t.total)}</td>
            </tr>
          </tfoot>
        </DataTable>
      ) : null}
    </>
  );
}
