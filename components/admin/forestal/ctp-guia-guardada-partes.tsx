"use client";

/**
 * Piezas del modal de UNA guía guardada antes del ingreso (ADR-442): los
 * campos de la guía, la ficha de SERFOR resumida y el estado frente al libro.
 * Viven aparte para que `CtpGuiaGuardadaModal` sea sólo el guion (cargar,
 * guardar, eliminar) y no pase las 300 líneas.
 */

import { CheckCircle2, Loader2, Search, ShieldCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateShort, formatNumber } from "@/lib/format";
import type { Contrato } from "@/lib/forestal/contratos";
import type { GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";
import { limaDateKey } from "@/lib/utils";
import { DatoVence, SinFechaDeVencimiento } from "./ctp-guia-vence-chip";
import { Btn, CampoGrid, Field, FormularioClaro, I } from "./ctp-shared";
import { conPermiso, conTitular, type FormGuia } from "./guia-guardada-form";

/* ── Los campos ───────────────────────────────────────────────────────────── */

/** Un dato que ya no se escribe a mano se ve apagado, pero se puede leer y copiar. */
/* El borde punteado es la señal que se ve en los DOS temas: en oscuro el fondo
   «hundido» y el del campo quedan casi iguales (medido 27-09). */
const FIJO =
  "read-only:border-dashed read-only:bg-[var(--surface-sunken)] read-only:text-[var(--text-secondary)]";
const DE_LA_FICHA = "Sale de la ficha de SERFOR: no se cambia a mano. Si está mal, vuelve a buscar la guía.";

export function CamposDeGuia({
  form,
  onChange,
  contratos,
  onBuscarSerfor,
  buscando,
  bloqueado,
  oficial,
  ingresada,
}: {
  form: FormGuia;
  onChange: (f: FormGuia) => void;
  contratos: readonly Contrato[];
  onBuscarSerfor: () => void;
  buscando: boolean;
  bloqueado: boolean;
  /** Tiene la ficha de SERFOR: GTF, fecha, titular y permiso son los del papel oficial. */
  oficial: boolean;
  /** Ya entró al libro: su N° de GTF y de registro no se cambian (el ingreso perdería sus papeles). */
  ingresada: boolean;
}) {
  const set = (patch: Partial<FormGuia>) => onChange({ ...form, ...patch });
  const titulares = [...new Set(contratos.map((c) => c.titularNombre).filter(Boolean))];
  const YA_EN_EL_LIBRO = "La guía ya entró al libro: este número no se cambia desde aquí.";
  return (
    <FormularioClaro>
      <CampoGrid>
        <Field
          label="N° de registro"
          span={12}
          hint={
            ingresada
              ? YA_EN_EL_LIBRO
              : "El número que SERFOR le da a la guía en el SNIFFS (ej. 1-19-0313629), no el N° de GTF impreso. Con él se busca la ficha oficial y el ingreso reconoce la guía."
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              aria-label="N° de registro"
              className={`${I} ${FIJO} font-mono sm:flex-1`}
              value={form.numeroRegistro}
              onChange={(e) => set({ numeroRegistro: e.target.value })}
              placeholder="1-19-0313629"
              autoComplete="off"
              readOnly={ingresada}
              disabled={bloqueado}
            />
            <Btn
              variant="secondary"
              onClick={onBuscarSerfor}
              disabled={bloqueado || !form.numeroRegistro.trim()}
              title="Trae de SERFOR la GTF, la fecha, el titular y el permiso, y guarda la guía con esos datos"
            >
              {buscando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              {buscando ? "Consultando SERFOR…" : oficial ? "Volver a buscar" : "Buscar en SERFOR"}
            </Btn>
          </div>
        </Field>
        <Field
          label="N° de GTF"
          span={6}
          hint={
            oficial
              ? DE_LA_FICHA
              : ingresada
                ? YA_EN_EL_LIBRO
                : "El número impreso en la guía (ej. 019-001-0000003). Es la llave de sus documentos."
          }
        >
          <input
            className={`${I} ${FIJO} font-mono`}
            value={form.gtfNumber}
            onChange={(e) => set({ gtfNumber: e.target.value })}
            placeholder="019-001-0000003"
            autoComplete="off"
            readOnly={oficial || ingresada}
            disabled={bloqueado}
          />
        </Field>
        <Field label="Fecha de la guía" span={6} hint={oficial ? DE_LA_FICHA : undefined}>
          <input
            type="date"
            className={`${I} ${FIJO}`}
            value={form.gtfDate}
            onChange={(e) => set({ gtfDate: e.target.value })}
            readOnly={oficial}
            disabled={bloqueado}
          />
        </Field>
        <Field
          label="Titular"
          span={8}
          hint={oficial ? DE_LA_FICHA : "El dueño del permiso. Da nombre a la carpeta de sus documentos."}
        >
          <input
            className={`${I} ${FIJO}`}
            list={oficial ? undefined : "guia-guardada-titulares"}
            value={form.titularNombre}
            onChange={(e) => onChange(conTitular(form, e.target.value, contratos))}
            placeholder="COMUNIDAD NATIVA SANTA ROSA"
            autoComplete="off"
            readOnly={oficial}
            disabled={bloqueado}
          />
        </Field>
        <Field label="RUC o DNI del titular" span={4}>
          <input
            className={`${I} font-mono`}
            value={form.titularDoc}
            onChange={(e) => set({ titularDoc: e.target.value.replace(/\s+/g, "") })}
            inputMode="numeric"
            autoComplete="off"
            disabled={bloqueado}
          />
        </Field>
        <Field
          label="N° de permiso"
          span={oficial ? 6 : 12}
          hint={
            oficial
              ? DE_LA_FICHA
              : "El título habilitante que ampara la madera. Si ya está cargado en Permisos, elígelo de la lista: la guía queda atada a él."
          }
        >
          <input
            className={`${I} ${FIJO} font-mono`}
            list={oficial ? undefined : "guia-guardada-permisos"}
            value={form.permisoCodigo}
            onChange={(e) => onChange(conPermiso(form, e.target.value, contratos))}
            placeholder="19-SEC/REG-PLT-2021-017"
            autoComplete="off"
            readOnly={oficial}
            disabled={bloqueado}
          />
        </Field>
        {/* Con el permiso fijado por la ficha, el permiso CARGADO al que se ata
            se elige aparte (ADR-421): el código del papel no se toca. */}
        {oficial && (
          <Field label="Permiso cargado" span={6} hint="A qué permiso de tu lista de Permisos se ata la guía.">
            <select
              className={I}
              value={form.contratoId}
              onChange={(e) => set({ contratoId: e.target.value })}
              disabled={bloqueado}
            >
              <option value="">Sin atar</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.titularNombre}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Notas" span={12}>
          <textarea
            className={`${I} h-auto py-2.5`}
            rows={2}
            value={form.notas}
            onChange={(e) => set({ notas: e.target.value })}
            placeholder="Llega el lunes con el camión de Juan"
            disabled={bloqueado}
          />
        </Field>
        <datalist id="guia-guardada-permisos">
          {contratos.map((c) => (
            <option key={c.id} value={c.codigo}>
              {c.titularNombre}
            </option>
          ))}
        </datalist>
        <datalist id="guia-guardada-titulares">
          {titulares.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </CampoGrid>
    </FormularioClaro>
  );
}

/* ── La ficha de SERFOR, resumida ─────────────────────────────────────────── */

function Dato({ label, children, ancho = "" }: { label: string; children: React.ReactNode; ancho?: string }) {
  return (
    <div className={`min-w-0 ${ancho}`}>
      <dt className="text-xs font-medium text-[var(--text-tertiary)]">{label}</dt>
      <dd className="truncate text-sm font-bold text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export function SelloSerfor({ en }: { en: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-500)]/15 px-2.5 py-1 text-xs font-bold text-[var(--data-success-ink)]">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      Verificada en SERFOR{en ? ` · ${formatDateShort(en)}` : ""}
    </span>
  );
}

/** `hoy`: día de Lima `AAAA-MM-DD` (opcional, por defecto el de ahora). */
export function FichaResumen({ g, hoy }: { g: GuiaGuardadaVista; hoy?: string }) {
  const r = g.resumen;
  const dia = hoy ?? limaDateKey();
  // Sin ficha no hay fecha de vencimiento: se dice corto, sin inventarla.
  if (!r) return g.ingreso ? null : <SinFechaDeVencimiento g={g} hoy={dia} />;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-[var(--surface-sunken)] p-3 sm:grid-cols-4">
      <Dato label="Especies" ancho="col-span-2">
        <span title={r.especies.join(", ")}>{r.especies.length ? r.especies.join(", ") : "—"}</span>
      </Dato>
      <Dato label="Volumen">
        <span className="tabular-nums">{r.volumenM3 != null ? `${formatNumber(r.volumenM3, { max: 3 })} m³` : "—"}</span>
      </Dato>
      <Dato label="Trozas">
        <span className="tabular-nums">{r.trozas}</span>
      </Dato>
      <DatoVence g={g} hoy={dia} />
      <Dato label="Placa">
        <span className="font-mono">{r.placa ?? "—"}</span>
      </Dato>
      <Dato label="Transportista" ancho="col-span-2">
        <span title={r.transportista ?? undefined}>{r.transportista ?? "—"}</span>
      </Dato>
    </dl>
  );
}

/* ── Frente al libro ──────────────────────────────────────────────────────── */

/** `en` puede venir como día (`2026-09-27`) o como instante: el día se lee en UTC. */
export function fechaDeIngreso(en: string): string {
  const soloDia = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(en);
  return formatDateShort(en, soloDia ? { soloFecha: true } : undefined);
}

export function PastillaIngresada({ ingreso }: { ingreso: { en: string; asientos: number } }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-500)]/15 px-3 py-1.5 text-sm font-bold text-[var(--data-success-ink)]">
      <CheckCircle2 className="h-4 w-4" aria-hidden />
      Ya entró al libro el {fechaDeIngreso(ingreso.en)} ({ingreso.asientos}{" "}
      {ingreso.asientos === 1 ? "asiento" : "asientos"})
    </span>
  );
}

/** El ⓘ de la sección «La guía». */
export function AyudaDeGuia() {
  return (
    <InfoTip
      title="Guardar la guía antes del ingreso"
      what="Anota la guía con su N° de registro y su GTF, y sube sus papeles, antes de que llegue la madera."
      affects="Al registrar el ingreso con esa GTF o ese N° de registro, los datos y los documentos ya están. Eliminar el ingreso no borra la guía guardada; eliminar la guía guardada no borra sus documentos."
      example="Te mandan la guía por WhatsApp el viernes: la guardas y subes la factura. El lunes llega el camión y el ingreso ya tiene todo."
    />
  );
}
