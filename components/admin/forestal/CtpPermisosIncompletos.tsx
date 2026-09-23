"use client";

/**
 * «Qué le falta a tus permisos» — completar el papel sin salir de Contratos.
 *
 * ## Por qué existe
 *
 * ADR-425 dio la pantalla para cargar permisos desde la ficha del Directorio,
 * pero el dato viejo siguió vacío. Medido en el tenant de Blas el 2026-09-21:
 * de 6 permisos cargados, **0 tenían ficha atada, 0 área de manejo y 0
 * vigencia**. Mientras siga así, todas las pantallas nuevas dicen «sin área
 * cargada» y el aviso de permiso por vencer no puede existir.
 *
 * El bloque sólo aparece si falta algo: un cartel «todo bien» ocuparía la misma
 * pantalla que la tabla de contratos sin decir nada nuevo.
 *
 * ## El orden: primero lo que más madera movió
 *
 * No por «al que más le falta». Un permiso al que le faltan las cuatro cosas y
 * no ampara un solo ingreso es papeleo; uno al que sólo le falta el área pero
 * amparó 28,9 m³ es una cifra que hoy no se puede contrastar contra lo
 * autorizado. Se ordena por volumen amparado, después por documentos colgados y
 * recién ahí por cuántos huecos tiene.
 *
 * ## La ficha se propone, nunca se ata sola
 *
 * El libro escribe «COMUNIDAD **NATIVA** SANTA ROSA DE CHIVIS» y el Directorio
 * «COMUNIDAD SANTA ROSA DE CHIVIS»: el candidato sale de `partesParecidas`
 * (núcleo del nombre sin forma societaria, ADR-317). Pero atar mal un permiso
 * manda la plata al contrato equivocado, así que siempre es un clic explícito
 * con el nombre a la vista.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Link2, Loader2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { partesParecidas, type Parte } from "@/lib/forestal/directorio";
import type { BalanceContrato, Contrato } from "@/lib/forestal/contratos";
import { Btn, CampoGrid, Field, I } from "./ctp-shared";

/**
 * Nombres que NO son un titular: son el hueco escrito con palabras.
 *
 * `Sin registrar` lo pone el sembrado de contratos cuando ninguna guía dice a
 * nombre de quién está el papel; «(por confirmar)» lo escribieron a mano en 3
 * de los 6 permisos de Blas. Los dos significan lo mismo y los dos hay que
 * completarlos.
 */
const TITULAR_SIN_CONFIRMAR = /^(|-+|—|s\/?n|sin registrar|sin titular|\(?por confirmar\)?|desconocid[oa]|no registrado)$/i;

export function titularSinConfirmar(nombre: string): boolean {
  return TITULAR_SIN_CONFIRMAR.test((nombre ?? "").trim());
}

/** Un hueco del permiso, con su nombre en palabras y para qué sirve llenarlo. */
interface Hueco {
  clave: "ficha" | "titular" | "area" | "vigencia";
  /** Como se nombra en el chip de la fila. */
  etiqueta: string;
  /** Como se cuenta en el título: «5 de 6 permisos <frase>». */
  frase: string;
  /** Qué se pierde mientras siga vacío. Una línea, en el idioma del patio. */
  paraQue: string;
  falta: (c: Contrato) => boolean;
}

const HUECOS: readonly Hueco[] = [
  { clave: "area", etiqueta: "área de manejo", frase: "sin área de manejo", falta: (c) => c.areaHa == null,
    paraQue: "Sin ella no se puede contrastar lo aprovechado contra lo autorizado." },
  { clave: "vigencia", etiqueta: "vigencia", frase: "sin vigencia cargada", falta: (c) => !c.vigenciaHasta,
    paraQue: "Sin ella nadie avisa antes de comprarle a un permiso vencido." },
  { clave: "ficha", etiqueta: "ficha del Directorio", frase: "sin ficha del Directorio", falta: (c) => !c.titularId,
    paraQue: "Sin atarla, el permiso no aparece en la ficha de su titular." },
  { clave: "titular", etiqueta: "titular sin confirmar", frase: "con el titular sin confirmar",
    falta: (c) => titularSinConfirmar(c.titularNombre),
    paraQue: "El papel no dice todavía a nombre de quién está." },
];

const huecosDe = (c: Contrato): Hueco[] => HUECOS.filter((h) => h.falta(c));

/**
 * Cuánto hay en juego bajo este permiso. El m³ manda: es la cifra que el área
 * de manejo tiene que poder amparar.
 */
function movimiento(b?: BalanceContrato) {
  const bloques = [b?.madera, b?.produccion, b?.gastos, b?.fletes, b?.adelantos];
  return { m3: b?.madera.m3 ?? 0, docs: bloques.reduce((n, x) => n + (x?.documentos ?? 0), 0) };
}

function textoMovimiento(b?: BalanceContrato): string {
  const { m3, docs } = movimiento(b);
  if (m3 > 0) {
    const ingresos = b?.madera.documentos ?? 0;
    return `${m3.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³ en ${ingresos} ${ingresos === 1 ? "ingreso" : "ingresos"}`;
  }
  if (docs > 0) return `${docs} ${docs === 1 ? "documento colgado" : "documentos colgados"}`;
  return "sin movimiento todavía";
}

/**
 * El parche local sobrevive sólo mientras la carga del servidor siga mostrando
 * el hueco que ya se llenó (guarda de «carga vieja pisa lo optimista»): el GET
 * que salió antes del PATCH vuelve con la fila vieja y repondría el permiso en
 * la lista. En cuanto el servidor trae el dato, el parche deja de aplicar — así
 * un cambio hecho desde otra pantalla no queda tapado para siempre.
 */
function parcheVigente(parche: Contrato, delServidor: Contrato): boolean {
  return HUECOS.some((h) => !h.falta(parche) && h.falta(delServidor));
}

/** Lo que se está completando. Todo string: sale de inputs, y `""` es «sin cargar». */
interface Borrador {
  areaHa: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  /** Id de la ficha del Directorio elegida. `""` = ninguna. */
  fichaId: string;
}

const borradorDe = (c: Contrato): Borrador => ({
  areaHa: c.areaHa == null ? "" : String(c.areaHa),
  vigenciaDesde: (c.vigenciaDesde ?? "").slice(0, 10),
  vigenciaHasta: (c.vigenciaHasta ?? "").slice(0, 10),
  fichaId: c.titularId ?? "",
});

export default function CtpPermisosIncompletos({
  contratos,
  balances,
  onGuardado,
}: {
  contratos: Contrato[];
  balances?: Record<string, BalanceContrato>;
  /** Para que la lista de arriba se entere del cambio. */
  onGuardado?: () => void;
}) {
  const [parches, setParches] = useState<Record<string, Contrato>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Un permiso CERRADO no entra: ya terminó, y completarle la vigencia no
     cambia ninguna decisión. Los vencidos y suspendidos sí — su área sigue
     siendo con qué contrastar lo que se aprovechó. */
  const mirables = useMemo(
    () =>
      contratos
        .filter((c) => c.isActive && c.estado !== "cerrado")
        .map((c) => {
          const p = parches[c.id];
          return p && parcheVigente(p, c) ? p : c;
        }),
    [contratos, parches],
  );

  const incompletos = useMemo(
    () =>
      mirables
        .map((c) => ({ c, huecos: huecosDe(c), mov: movimiento(balances?.[c.id]) }))
        .filter((x) => x.huecos.length > 0)
        .sort(
          (a, b) =>
            b.mov.m3 - a.mov.m3 ||
            b.mov.docs - a.mov.docs ||
            b.huecos.length - a.huecos.length ||
            a.c.codigo.localeCompare(b.c.codigo, "es"),
        ),
    [mirables, balances],
  );

  /* El directorio sólo se pide si hay algo que atar: con todo completo, esta
     pantalla no tiene por qué pegarle a un endpoint más. */
  const { partes } = useDirectorioForestal({ activo: incompletos.length > 0 });
  const fichas = useMemo(() => partes.filter((p) => p.activo), [partes]);

  if (incompletos.length === 0) return null;

  /* El título trae la cifra del hueco más repetido: «Pendientes» no dice
     cuánto falta ni de qué. El denominador son todos los permisos vivos, así
     que «5 de 6» se lee como lo que es. */
  const total = contratos.filter((c) => c.isActive).length;
  const cuenta = HUECOS.map((h) => ({ h, n: mirables.filter((c) => h.falta(c)).length })).filter((x) => x.n > 0);
  const peor = cuenta.reduce((a, b) => (b.n > a.n ? b : a));

  async function guardar(c: Contrato, b: Borrador, ficha: Parte | null) {
    const area = b.areaHa.trim() ? Number(b.areaHa) : null;
    if (area != null && (!Number.isFinite(area) || area < 0)) {
      setError("El área de manejo se carga en hectáreas, como número.");
      return;
    }
    if (b.vigenciaDesde && b.vigenciaHasta && b.vigenciaHasta < b.vigenciaDesde) {
      setError("La fecha de vencimiento no puede ser anterior a la de inicio.");
      return;
    }
    const cuerpo: Record<string, unknown> = {
      areaHa: area,
      vigenciaDesde: b.vigenciaDesde || null,
      vigenciaHasta: b.vigenciaHasta || null,
    };
    if (ficha) {
      cuerpo.titularId = ficha.id;
      cuerpo.titularDoc = ficha.docNumero ?? null;
      cuerpo.titularDocTipo = ficha.docTipo ?? null;
      /* El nombre del papel NO se pisa: es lo que se declara ante SERFOR. Sólo
         se completa cuando lo que hay es el hueco escrito con palabras. */
      if (titularSinConfirmar(c.titularNombre)) cuerpo.titularNombre = ficha.nombre;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/contratos/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(cuerpo),
      });
      const j = await leerJson<{ contrato?: Contrato; message?: string; error?: string }>(r);
      if (!r.ok || !j?.contrato) {
        setError(j?.message ?? j?.error ?? `No se pudo guardar el permiso (HTTP ${r.status}).`);
        return;
      }
      setParches((prev) => ({ ...prev, [c.id]: j.contrato as Contrato }));
      setAbierto(null);
      setBorrador(null);
      onGuardado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-4">
      <CardTitle as="h3" className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
        {peor.n} de {total} {total === 1 ? "permiso" : "permisos"} {peor.h.frase}
      </CardTitle>
      {/* Qué se pierde mientras cada dato siga vacío, una línea por dato: un
          hueco que nadie sabe para qué sirve no se completa nunca. */}
      <ul className="mt-1.5 space-y-0.5 text-sm text-[var(--text-secondary)]">
        {cuenta.map(({ h, n }) => (
          <li key={h.clave}>
            <span className="font-semibold text-[var(--text-primary)]">
              {n} {h.frase}
            </span>{" "}
            — {h.paraQue}
          </li>
        ))}
      </ul>

      <ul className="mt-3 space-y-2">
        {incompletos.map(({ c, huecos }) => (
          <li key={c.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="block break-all font-mono text-sm font-bold text-[var(--text-primary)]">{c.codigo}</span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  {titularSinConfirmar(c.titularNombre) ? "Titular sin confirmar" : c.titularNombre}
                  <span className="text-[var(--text-tertiary)]"> · {textoMovimiento(balances?.[c.id])}</span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-[var(--text-secondary)]">Le falta:</span>
                  {huecos.map((h) => (
                    <span
                      key={h.clave}
                      title={h.paraQue}
                      /* Texto en `--text-primary`, no en `--data-warning-700`:
                         medido con canvas 1×1, el coral sobre la tarjeta da
                         4,13:1 y a 12 px bold AA pide 4,5. El aro coral
                         conserva la señal sin apoyar el sentido en el color. */
                      className="rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--text-primary)] ring-1 ring-inset ring-[var(--data-warning-500)]/40"
                    >
                      {h.etiqueta}
                    </span>
                  ))}
                </span>
              </div>
              {/* Tamaño normal (44 px) y no `sm`: es la acción de la fila y en
                  celular se toca con el dedo. */}
              <Btn
                variant={abierto === c.id ? "ghost" : "secondary"}
                aria-expanded={abierto === c.id}
                onClick={() => {
                  const cerrando = abierto === c.id;
                  setAbierto(cerrando ? null : c.id);
                  setBorrador(cerrando ? null : borradorDe(c));
                  setError(null);
                }}
              >
                {abierto === c.id ? "Cancelar" : "Completar"}
              </Btn>
            </div>

            {abierto === c.id && borrador && (
              <FormularioCompletar
                contrato={c}
                borrador={borrador}
                fichas={fichas}
                guardando={guardando}
                error={error}
                onCambio={setBorrador}
                onGuardar={(ficha) => void guardar(c, borrador, ficha)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Los tres datos que faltan, en una sola pasada y sin cambiar de pantalla. */
function FormularioCompletar({
  contrato: c,
  borrador: b,
  fichas,
  guardando,
  error,
  onCambio,
  onGuardar,
}: {
  contrato: Contrato;
  borrador: Borrador;
  fichas: Parte[];
  guardando: boolean;
  /** El motivo por el que el último guardado no entró. */
  error: string | null;
  onCambio: (b: Borrador) => void;
  onGuardar: (ficha: Parte | null) => void;
}) {
  /* El candidato se busca por el núcleo del nombre sin forma societaria: el
     libro y el Directorio escriben al mismo titular distinto. Se propone; el
     clic lo da la persona. */
  const candidatos = useMemo(
    () => (c.titularId || titularSinConfirmar(c.titularNombre) ? [] : partesParecidas(c.titularNombre, fichas).slice(0, 3)),
    [c.titularId, c.titularNombre, fichas],
  );
  const elegida = fichas.find((f) => f.id === b.fichaId) ?? null;
  /* Sin un solo cambio no se guarda: `ForestContratoDB.actualizar` deja asiento
     de auditoría, y un PATCH que repite lo que ya estaba ensucia el historial
     del permiso con un movimiento que nadie hizo. */
  const original = borradorDe(c);
  const hayCambio = (Object.keys(b) as (keyof Borrador)[]).some((k) => b[k] !== original[k]);

  return (
    <div className="mt-3 border-t border-[var(--rule-soft)] pt-3">
      <CampoGrid>
        <Field label="Área de manejo (ha)" span={4} hint="La que dice la resolución. Sin ella no se puede contrastar lo aprovechado contra lo autorizado.">
          <input
            type="number"
            step="0.01"
            min="0"
            className={`${I} tabular-nums`}
            value={b.areaHa}
            onChange={(e) => onCambio({ ...b, areaHa: e.target.value })}
          />
        </Field>
        <Field label="Vigente desde" span={4}>
          <input type="date" className={I} value={b.vigenciaDesde} onChange={(e) => onCambio({ ...b, vigenciaDesde: e.target.value })} />
        </Field>
        <Field label="Vence el" span={4} hint="Sin esto nadie avisa antes de comprarle a un permiso vencido.">
          <input type="date" className={I} value={b.vigenciaHasta} onChange={(e) => onCambio({ ...b, vigenciaHasta: e.target.value })} />
        </Field>
        <Field label="Ficha del Directorio" span={12} hint="A qué titular pertenece. Sin atarla, el permiso no aparece en la ficha de su titular.">
          <select className={I} value={b.fichaId} onChange={(e) => onCambio({ ...b, fichaId: e.target.value })}>
            <option value="">Sin atar</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
                {f.docNumero ? ` — ${f.docNumero}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </CampoGrid>

      {candidatos.length > 0 && !b.fichaId && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span>Se parece por el nombre — confírmalo tú:</span>
          {candidatos.map((f) => (
            <Btn key={f.id} size="sm" variant="ghost" onClick={() => onCambio({ ...b, fichaId: f.id })}>
              <Link2 className="h-3.5 w-3.5" aria-hidden /> Es «{f.nombre}»
            </Btn>
          ))}
        </p>
      )}

      {error && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {elegida && titularSinConfirmar(c.titularNombre) && (
          <span className="mr-auto text-sm text-[var(--text-secondary)]">
            El titular del permiso pasa a ser «{elegida.nombre}».
          </span>
        )}
        <Btn variant="primary" disabled={guardando || !hayCambio} onClick={() => onGuardar(elegida)}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Guardar
        </Btn>
      </div>
    </div>
  );
}
