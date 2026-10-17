/**
 * Plan impreso › hacia dónde va y cómo se organiza (ADR-497): FODA,
 * estrategias, objetivos, organigrama, espacios y políticas. Los nombres de
 * cuadrantes, tipos y estados son los mismos que usa cada vista.
 */
import { BlockTitle, DataTable } from "@buleje/design-system";
import { formatNumber } from "@/lib/format";
import { avanceObjetivo } from "@/lib/planificacion/calculos";
import { CATEGORIAS_POLITICA, type DatosSeccion } from "@/lib/planificacion/secciones";
import { CUADRANTE, ESTADO_ESTRATEGIA, ORDEN_GRILLA, ORDEN_MATRIZ, TIPO } from "../foda/foda-config";
import { ESTADO_OBJETIVO, NOMBRE_PLAZO } from "../objetivos/objetivos-config";
import { construirArbol, type NodoCargo } from "../organizacion/organigrama-arbol";
import { DatosDoc, ListaDoc, NotaDoc, ParrafoDoc, fechaDoc } from "./piezas-doc";

export function FodaDoc({ d }: { d: DatosSeccion<"foda"> }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
      {ORDEN_GRILLA.map((c) => (
        <div key={c} className="break-inside-avoid space-y-1 rounded-lg border border-[var(--rule-base)] p-2">
          <BlockTitle as="h3">{CUADRANTE[c].nombre}</BlockTitle>
          {d[c].length > 0 ? (
            <ListaDoc items={d[c].map((p) => (p.impacto === "alto" ? `${p.texto} (impacto alto)` : p.texto))} />
          ) : (
            <NotaDoc>—</NotaDoc>
          )}
        </div>
      ))}
    </div>
  );
}

export function EstrategiasDoc({ d }: { d: DatosSeccion<"estrategias"> }) {
  const vivas = d.items.filter((e) => e.estado !== "descartada");
  return (
    <>
      {ORDEN_MATRIZ.map((t) => {
        const deTipo = vivas.filter((e) => e.tipo === t);
        if (deTipo.length === 0) return null;
        return (
          <div key={t} className="break-inside-avoid space-y-0.5">
            <BlockTitle as="h3">
              {TIPO[t].nombre} ({t})
            </BlockTitle>
            <ListaDoc items={deTipo.map((e) => `${e.texto} — ${ESTADO_ESTRATEGIA[e.estado].nombre.toLowerCase()}`)} />
          </div>
        );
      })}
      {vivas.length < d.items.length ? <NotaDoc>Las estrategias descartadas no se imprimen.</NotaDoc> : null}
    </>
  );
}

export function ObjetivosDoc({ d }: { d: DatosSeccion<"objetivos"> }) {
  const filas = [...d.items].sort((a, b) => (a.fin || "9999").localeCompare(b.fin || "9999"));
  return (
    <DataTable aria-label="Objetivos">
      <thead>
        <tr>
          <th>Objetivo</th>
          <th>Responsable</th>
          <th>Plazo</th>
          <th className="text-right">Avance</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((o) => (
          <tr key={o.id}>
            <td>
              <span className="block font-medium">{o.titulo}</span>
              {o.indicador || o.meta ? (
                <span className="block text-[var(--text-secondary)]">{[o.indicador, o.meta].filter(Boolean).join(": ")}</span>
              ) : null}
            </td>
            <td>{o.responsable || "—"}</td>
            <td>{o.fin ? `Hasta el ${fechaDoc(o.fin)}` : NOMBRE_PLAZO[o.plazo]}</td>
            <td className="text-right tabular-nums">{avanceObjetivo(o)} %</td>
            <td>{ESTADO_OBJETIVO[o.estado].nombre}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function NodoDoc({ nodo, areas }: { nodo: NodoCargo; areas: ReadonlyMap<string, string> }) {
  const { cargo, hijos } = nodo;
  const area = areas.get(cargo.areaId);
  return (
    <li className="break-inside-avoid">
      <span className="font-medium">{cargo.nombre}</span>
      {cargo.persona ? ` · ${cargo.persona}` : ""}
      {area ? <span className="text-[var(--text-secondary)]"> ({area})</span> : null}
      {cargo.funciones.length > 0 ? (
        <span className="block text-[var(--text-secondary)]">{cargo.funciones.join("; ")}</span>
      ) : null}
      {hijos.length > 0 ? (
        <ul className="mt-1 space-y-1 border-l border-[var(--rule-base)] pl-4">
          {hijos.map((h) => (
            <NodoDoc key={h.cargo.id} nodo={h} areas={areas} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OrganizacionDoc({ d }: { d: DatosSeccion<"organizacion"> }) {
  const areas = new Map(d.areas.map((a) => [a.id, a.nombre]));
  return (
    <>
      {d.areas.length > 0 ? <DatosDoc filas={[["Áreas", d.areas.map((a) => a.nombre).join(", ")]]} /> : null}
      <ul className="space-y-1 text-sm text-[var(--text-primary)]">
        {construirArbol(d.cargos).map((n) => (
          <NodoDoc key={n.cargo.id} nodo={n} areas={areas} />
        ))}
      </ul>
    </>
  );
}

export function EspaciosDoc({ d }: { d: DatosSeccion<"espacios"> }) {
  return (
    <>
      {d.zonas.length > 0 ? (
        <DataTable aria-label="Espacios">
          <thead>
            <tr>
              <th>Espacio</th>
              <th>Tipo</th>
              <th className="text-right">Área</th>
              <th>Uso</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {d.zonas.map((z) => (
              <tr key={z.id}>
                <td className="font-medium">{z.nombre}</td>
                <td>{z.tipo}</td>
                <td className="text-right whitespace-nowrap tabular-nums">{z.area != null ? `${formatNumber(z.area)} ${z.unidad}` : "—"}</td>
                <td>{z.uso || "—"}</td>
                <td>{z.responsable || "—"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}
      {d.croquis.map((c) => (
        <figure key={c.id} className="break-inside-avoid space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por el usuario, se imprime tal cual */}
          <img src={c.url} alt={c.titulo} className="max-h-96 w-auto max-w-full rounded-lg border border-[var(--rule-base)] object-contain" />
          <figcaption className="text-sm text-[var(--text-secondary)]">
            {c.titulo}
            {c.nota ? ` — ${c.nota}` : ""}
          </figcaption>
        </figure>
      ))}
    </>
  );
}

export function PoliticasDoc({ d }: { d: DatosSeccion<"politicas"> }) {
  const orden = (c: string) => CATEGORIAS_POLITICA.indexOf(c as (typeof CATEGORIAS_POLITICA)[number]);
  const items = [...d.items].sort((a, b) => orden(a.categoria) - orden(b.categoria));
  return (
    <>
      {items.map((p) => (
        <div key={p.id} className="break-inside-avoid space-y-0.5">
          <BlockTitle as="h3">{p.titulo}</BlockTitle>
          <NotaDoc>
            {p.categoria}
            {p.vigenteDesde ? ` · vigente desde el ${fechaDoc(p.vigenteDesde)}` : ""}
          </NotaDoc>
          {p.texto ? <p className="text-sm whitespace-pre-line text-[var(--text-primary)]">{p.texto}</p> : null}
        </div>
      ))}
      {d.protocolo.length > 0 ? (
        <div className="break-inside-avoid space-y-0.5">
          <BlockTitle as="h3">Cómo atendemos</BlockTitle>
          <ListaDoc
            numerada
            items={d.protocolo.map((s) => (
              <span key={s.id}>
                <strong className="font-semibold">{s.paso}</strong>
                {s.detalle ? `: ${s.detalle}` : ""}
              </span>
            ))}
          />
        </div>
      ) : null}
      {d.preguntas.map((q) => (
        <ParrafoDoc key={q.id} rotulo={q.pregunta} texto={q.respuesta || "—"} />
      ))}
    </>
  );
}
