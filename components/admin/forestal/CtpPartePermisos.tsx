"use client";

/**
 * Los permisos de un titular, dentro de su ficha del Directorio.
 *
 * ## Por qué
 *
 * Brandon (2026-09-21): «poder agregar de una misma comunidad diferentes
 * permisos que maneja y áreas de manejo». Una comunidad nativa no tiene *un*
 * papel: tiene los que le fueron aprobando, cada uno con **su área, su
 * resolución y su vigencia**. La ficha guardaba UN `tituloHabilitante` y UNA
 * `resolucion` — el último que alguien escribió —, así que el segundo permiso
 * pisaba al primero.
 *
 * El permiso ya era una entidad: `ForestContrato` (ADR-421). Lo que faltaba era
 * atarlo al titular — medido en el tenant de Blas, **6 de 6 permisos tenían
 * `titularId` en `null`**: la columna existía y ninguna pantalla la llenaba.
 *
 * ## Tres estados, tres tratos distintos
 *
 * · **Suyos** — atados por `titularId`. Se editan acá mismo.
 * · **Candidatos** — escritos a nombre de alguien que se llama parecido y sin
 *   vínculo (la ficha dice «COMUNIDAD SANTA ROSA DE CHIVIS» y el papel
 *   «COMUNIDAD *NATIVA* SANTA ROSA DE CHIVIS»). Se ofrecen para atar en un
 *   clic; **nunca se atan solos**: dos comunidades pueden llamarse parecido.
 * · **Pendientes** — cargados mientras se da de alta la ficha, cuando todavía
 *   no hay id al que colgarlos. Se crean cuando el servidor devuelve la ficha.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Link2, Loader2, Plus, Trash2, X as XIcon } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { crearPermiso, usePermisosForestal, type UsosDelPermiso } from "@/hooks/use-permisos-forestal";
import { TIPOS_CONTRATO, type Contrato, type ContratoInput, type TipoContrato } from "@/lib/forestal/contratos";
import {
  areaDelPermiso,
  camposDelPlanDesdePermiso,
  habilitaPlanDeManejo,
  opcionesEscritas,
  permisosDeParte,
  tipoPlanDesdePermiso,
} from "@/lib/forestal/permisos-de-parte";
import { TIPOS_PLAN_META } from "@/lib/forestal/loth-tipos-plan";
import { ESTADO_CLASE, ESTADO_LABEL, TIPO_LABEL, fmtFechaCorta } from "./contratos-ui";
import { SelectConOtra, SelectRegion } from "./campos-elegibles";
import { Btn, CampoGrid, Field, I } from "./ctp-shared";

/** Un permiso en edición. Todo string: sale de inputs, y `""` es «sin cargar». */
export interface PermisoBorrador {
  /** Identidad local de la fila mientras no existe en el servidor. */
  clave: string;
  id?: string;
  codigo: string;
  tipo: TipoContrato | "";
  areaHa: string;
  resolucionNumero: string;
  resolucionFecha: string;
  arffs: string;
  region: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
}

let secuencia = 0;
export function permisoVacio(sugerido: Partial<PermisoBorrador> = {}): PermisoBorrador {
  secuencia += 1;
  return {
    clave: `p${secuencia}`,
    codigo: "",
    tipo: "",
    areaHa: "",
    resolucionNumero: "",
    resolucionFecha: "",
    arffs: "",
    region: "",
    vigenciaDesde: "",
    vigenciaHasta: "",
    ...sugerido,
  };
}

/** Del contrato guardado al borrador, para editarlo sin perder nada. */
function aBorrador(c: Contrato): PermisoBorrador {
  const campos = camposDelPlanDesdePermiso(c);
  secuencia += 1;
  return {
    clave: `c${c.id}`,
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo ?? "",
    areaHa: campos.areaHa,
    resolucionNumero: campos.resolucionNumber,
    resolucionFecha: campos.resolucionDate,
    arffs: campos.arffs,
    region: campos.region,
    vigenciaDesde: campos.vigenciaDesde,
    vigenciaHasta: campos.vigenciaHasta,
  };
}

/** Quién es el dueño del papel, como lo pide el alta de contrato. */
export interface TitularDelPermiso {
  id?: string | null;
  nombre: string;
  docTipo?: string | null;
  docNumero?: string | null;
}

/**
 * El borrador, listo para el servidor.
 *
 * Los vacíos viajan como `null` y no como `""`: una cadena vacía guardada se
 * lee después como «hay un dato y está en blanco», que es distinto de «no se
 * cargó». El área va como número — `null` si no se escribió, nunca 0.
 */
export function aContratoInput(b: PermisoBorrador, titular: TitularDelPermiso): ContratoInput {
  const txt = (v: string) => (v.trim() ? v.trim() : null);
  const area = b.areaHa.trim() ? Number(b.areaHa) : null;
  return {
    codigo: b.codigo.trim(),
    titularNombre: titular.nombre.trim() || "Sin registrar",
    titularId: titular.id ?? null,
    titularDoc: txt(titular.docNumero ?? ""),
    titularDocTipo: txt(titular.docTipo ?? ""),
    tipo: b.tipo || null,
    areaHa: area != null && Number.isFinite(area) ? area : null,
    resolucionNumero: txt(b.resolucionNumero),
    resolucionFecha: txt(b.resolucionFecha),
    arffs: txt(b.arffs),
    region: txt(b.region),
    vigenciaDesde: txt(b.vigenciaDesde),
    vigenciaHasta: txt(b.vigenciaHasta),
  };
}

/**
 * Crea los permisos que quedaron esperando el id de una ficha recién dada de
 * alta. De a uno: si un código ya existía, los demás igual entran y el aviso
 * dice cuál fue.
 */
export async function guardarPermisosPendientes(
  titular: TitularDelPermiso,
  pendientes: readonly PermisoBorrador[],
): Promise<{ creados: number; errores: string[] }> {
  const res = { creados: 0, errores: [] as string[] };
  for (const p of pendientes) {
    if (!p.codigo.trim()) continue;
    const r = await crearPermiso(aContratoInput(p, titular));
    if (r.error) res.errores.push(`${p.codigo}: ${r.error}`);
    else if (r.yaExistia) res.errores.push(`${p.codigo}: ese permiso ya estaba cargado; quedó como estaba.`);
    else res.creados += 1;
  }
  return res;
}

/** Cuántos documentos de cada tipo cuelgan del permiso, en una frase. */
function detalleDeUsos(u: UsosDelPermiso): string {
  const partes = [
    u.madera ? `${u.madera} ingreso${u.madera === 1 ? "" : "s"} de madera` : null,
    u.produccion ? `${u.produccion} corrida${u.produccion === 1 ? "" : "s"} de producción` : null,
    u.lotes ? `${u.lotes} lote${u.lotes === 1 ? "" : "s"}` : null,
    u.gastos ? `${u.gastos} gasto${u.gastos === 1 ? "" : "s"}` : null,
    u.adelantos ? `${u.adelantos} adelanto${u.adelantos === 1 ? "" : "s"}` : null,
    u.fletes ? `${u.fletes} flete${u.fletes === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return partes.join(", ");
}

export default function CtpPartePermisos({
  parteId,
  titular,
  arffsDeLaFicha,
  pendientes,
  onPendientes,
  onConteo,
}: {
  /** `null` mientras la ficha es un alta: ahí los permisos quedan pendientes. */
  parteId: string | null;
  titular: TitularDelPermiso;
  /** La ARFFS que la ficha ya tiene escrita, para ofrecerla sin tipearla. */
  arffsDeLaFicha?: string | null;
  pendientes: PermisoBorrador[];
  onPendientes: (p: PermisoBorrador[]) => void;
  /**
   * Cuántos permisos tiene el titular, para la barra de salud de la ficha.
   *
   * Sube por callback en vez de que el padre pida la lista: `usePermisosForestal`
   * hace su propio GET por montaje (el `pedidoRef` es de cada instancia), así
   * que llamarlo arriba **también** serían dos consultas al mismo endpoint para
   * el mismo dato. Acá la lista ya está en la mano.
   */
  onConteo?: (permisos: number) => void;
}) {
  const { contratos, cargando, disponible, crear, actualizar, eliminar, usosDe } = usePermisosForestal();
  const { confirm } = useConfirm();
  const [edicion, setEdicion] = useState<PermisoBorrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [atando, setAtando] = useState<string | null>(null);
  /** El permiso cuya baja se está resolviendo: cubre desde que se pide `usosDe` hasta que responde el DELETE. */
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  const { suyos, candidatos } = useMemo(
    () => permisosDeParte({ id: parteId ?? undefined, nombre: titular.nombre }, contratos),
    [parteId, titular.nombre, contratos],
  );

  /** Las autoridades que este negocio ya escribió: el segundo papel se escribe como el primero. */
  const arffsUsadas = useMemo(
    () => opcionesEscritas([...contratos.map((c) => c.arffs), arffsDeLaFicha]),
    [contratos, arffsDeLaFicha],
  );

  /* Los papeles que el titular ya tiene: los atados más los que se cargaron en
     esta alta y todavía esperan el id. Se calcula acá arriba —antes de
     cualquier salida temprana— porque el efecto que lo avisa es un hook. */
  const total = suyos.length + pendientes.length;
  useEffect(() => {
    onConteo?.(total);
  }, [total, onConteo]);

  if (!disponible) return null;

  async function guardar() {
    if (!edicion) return;
    const codigo = edicion.codigo.trim();
    if (codigo.length < 3) {
      setAviso("El código del permiso es lo que lo identifica: cargalo antes de guardar.");
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      /* Sin ficha guardada todavía no hay a qué colgarlo: queda pendiente y se
         crea cuando el servidor devuelva el id. */
      if (!parteId) {
        const yaEsta = pendientes.some((p) => p.clave !== edicion.clave && p.codigo.trim().toUpperCase() === codigo.toUpperCase());
        if (yaEsta) {
          setAviso("Ese código ya está en la lista de abajo.");
          return;
        }
        const sinEse = pendientes.filter((p) => p.clave !== edicion.clave);
        onPendientes([...sinEse, { ...edicion, codigo }]);
        setEdicion(null);
        return;
      }
      const input = aContratoInput(edicion, { ...titular, id: parteId });
      const r = edicion.id ? await actualizar(edicion.id, input) : await crear(input);
      if ("error" in r && r.error) {
        setAviso(r.error);
        return;
      }
      if ("yaExistia" in r && r.yaExistia && r.contrato) {
        /* El código ya era un permiso de otra ficha (o de ninguna). No se
           duplica el papel: se ofrece atarlo, que es lo que se quería hacer. */
        setAviso(`«${r.contrato.codigo}» ya estaba cargado. Abajo podés atarlo a esta ficha.`);
        setEdicion(null);
        return;
      }
      setEdicion(null);
    } finally {
      setGuardando(false);
    }
  }

  async function atar(c: Contrato) {
    setAtando(c.id);
    setAviso(null);
    const r = await actualizar(c.id, {
      titularId: parteId,
      titularDoc: titular.docNumero ?? null,
      titularDocTipo: titular.docTipo ?? null,
    });
    if (r.error) setAviso(r.error);
    setAtando(null);
  }

  /**
   * Dar de baja un permiso ya creado. Es baja lógica: el papel deja de
   * ofrecerse en los selectores, pero lo que ya se imputó contra él (guías,
   * corridas, gastos…) sigue apuntándolo — por eso se pide `usosDe` ANTES de
   * confirmar: dar de baja uno con 24 documentos no es lo mismo que uno recién
   * cargado, y el diálogo lo tiene que decir con el número real.
   */
  async function darDeBaja(c: Contrato) {
    setBorrandoId(c.id);
    setAviso(null);
    try {
      const usos = await usosDe(c.id);
      const detalle =
        usos == null
          ? "No se pudo calcular cuántos documentos usan este permiso. Si lo das de baja igual, lo ya imputado no se borra: sólo deja de ofrecerse en los selectores."
          : usos.total === 0
            ? "No hay nada imputado a este permiso todavía: se puede dar de baja sin dejar nada suelto."
            : `Tiene ${usos.total} documento${usos.total === 1 ? "" : "s"} imputados (${detalleDeUsos(usos)}). Nada de eso se borra: sigue apuntando a «${c.codigo}», que deja de ofrecerse en los selectores.`;
      const ok = await confirm({
        title: `¿Dar de baja el permiso ${c.codigo}?`,
        description: detalle,
        intent: "danger",
        confirmLabel: "Sí, dar de baja",
      });
      if (!ok) return;
      const r = await eliminar(c.id);
      if (!r.ok) setAviso(r.error ?? "No se pudo dar de baja el permiso.");
      else if (edicion?.id === c.id) setEdicion(null);
    } finally {
      setBorrandoId(null);
    }
  }

  /* Qué plan de manejo le toca al papel elegido: se muestra, no se vuelve a preguntar. */
  const tipoDoc = edicion ? tipoPlanDesdePermiso(edicion.tipo || null) : null;
  const docDelPermiso = tipoDoc ? TIPOS_PLAN_META[tipoDoc] : null;

  return (
    <div className="sm:col-span-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            Permisos y áreas de manejo
            {total > 0 && (
              <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)]">
                {total}
              </span>
            )}
          </span>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Un mismo titular puede manejar varios: cada uno con su área, su resolución y su vigencia.
          </p>
        </div>
        {!edicion && (
          <Btn
            size="sm"
            onClick={() =>
              setEdicion(
                permisoVacio({
                  // Lo que la ficha ya sabe no se vuelve a tipear.
                  arffs: arffsDeLaFicha ?? "",
                }),
              )
            }
          >
            <Plus className="h-3.5 w-3.5" /> Agregar permiso
          </Btn>
        )}
      </div>

      {aviso && (
        <p className="mt-2 rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          {aviso}
        </p>
      )}

      {edicion && (
        <div className="mt-3 rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--surface-raised)] p-3">
          <CampoGrid>
            <Field label="Código del permiso" required span={6} hint="Tal como está en el papel — es el título habilitante que se declara">
              <input
                type="text"
                className={`${I} font-mono`}
                value={edicion.codigo}
                placeholder="19-SEC/REG-PLT-2021-017"
                onChange={(e) => setEdicion({ ...edicion, codigo: e.target.value })}
              />
            </Field>
            <Field
              label="Qué papel es"
              span={6}
              hint={
                /* El plan de manejo no se pregunta aparte: lo decide el papel.
                   Un permiso en comunidad nativa se aprueba con DEMA, uno en
                   predio privado con PMFI (RJ 001-2018-OSINFOR). Decirlo acá
                   evita elegir dos veces el mismo dato y elegirlo distinto. */
                docDelPermiso ? `Plan de manejo: ${docDelPermiso.sigla} — ${docDelPermiso.nombre}` : "Decide qué plan de manejo le corresponde"
              }
            >
              <select className={I} value={edicion.tipo} onChange={(e) => setEdicion({ ...edicion, tipo: e.target.value as TipoContrato | "" })}>
                <option value="">Elegir…</option>
                {TIPOS_CONTRATO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Área de manejo (ha)" span={4} hint="La que dice la resolución">
              <input
                type="number"
                step="0.01"
                min="0"
                className={`${I} tabular-nums`}
                value={edicion.areaHa}
                onChange={(e) => setEdicion({ ...edicion, areaHa: e.target.value })}
              />
            </Field>
            <Field label="N° de resolución" span={4}>
              <input type="text" className={I} value={edicion.resolucionNumero} onChange={(e) => setEdicion({ ...edicion, resolucionNumero: e.target.value })} />
            </Field>
            <Field label="Fecha de la resolución" span={4}>
              <input type="date" className={I} value={edicion.resolucionFecha} onChange={(e) => setEdicion({ ...edicion, resolucionFecha: e.target.value })} />
            </Field>
            <Field label="Región" span={4} hint="Departamento donde está el área">
              <SelectRegion className={I} valor={edicion.region} onCambio={(region) => setEdicion({ ...edicion, region })} />
            </Field>
            <Field label="ARFFS competente" span={8} hint="La autoridad regional que lo aprobó">
              <SelectConOtra
                className={I}
                valor={edicion.arffs}
                opciones={arffsUsadas}
                textoOtra="Otra autoridad…"
                placeholder="ATFFS Selva Central"
                onCambio={(arffs) => setEdicion({ ...edicion, arffs })}
              />
            </Field>
            <Field label="Vigente desde" span={6}>
              <input type="date" className={I} value={edicion.vigenciaDesde} onChange={(e) => setEdicion({ ...edicion, vigenciaDesde: e.target.value })} />
            </Field>
            <Field label="Vence el" span={6} hint="Comprarle con el permiso vencido invalida la guía que se emita">
              <input type="date" className={I} value={edicion.vigenciaHasta} onChange={(e) => setEdicion({ ...edicion, vigenciaHasta: e.target.value })} />
            </Field>
          </CampoGrid>
          <div className="mt-3 flex justify-end gap-2">
            <Btn size="sm" variant="ghost" onClick={() => { setEdicion(null); setAviso(null); }}>
              Cancelar
            </Btn>
            <Btn size="sm" variant="primary" disabled={guardando} onClick={() => void guardar()}>
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {edicion.id ? "Guardar permiso" : parteId ? "Agregar permiso" : "Dejar listo"}
            </Btn>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {cargando && suyos.length === 0 && <p className="text-xs text-[var(--text-tertiary)]">Buscando sus permisos…</p>}

        {suyos.map((c) => (
          <FilaPermiso
            key={c.id}
            contrato={c}
            onEditar={() => setEdicion(aBorrador(c))}
            onBorrar={() => void darDeBaja(c)}
            borrando={borrandoId === c.id}
          />
        ))}

        {pendientes.map((p) => (
          <div key={p.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{p.codigo}</span>
            {p.tipo && <span className="text-xs text-[var(--text-secondary)]">{TIPO_LABEL[p.tipo]}</span>}
            {p.areaHa && <span className="text-xs tabular-nums text-[var(--text-secondary)]">{p.areaHa} ha</span>}
            <span className="ml-auto text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Se crea al guardar la ficha
            </span>
            <button
              type="button"
              onClick={() => onPendientes(pendientes.filter((x) => x.clave !== p.clave))}
              aria-label={`Quitar el permiso ${p.codigo}`}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {candidatos.length > 0 && (
          <div className="rounded-lg border border-[var(--data-info-100)] bg-[var(--data-info-50)] p-2 dark:bg-[var(--data-info-500)]/10">
            <p className="px-1 text-xs text-[var(--text-secondary)]">
              Estos permisos están a nombre de alguien que se llama parecido y no cuelgan de ninguna ficha. Si son de este titular,
              atalos: el libro lo escribe distinto de como lo escribe el Directorio.
            </p>
            <div className="mt-1.5 space-y-1.5">
              {candidatos.map((c) => (
                <FilaPermiso
                  key={c.id}
                  contrato={c}
                  accion={
                    <Btn size="sm" variant="ghost" disabled={!parteId || atando === c.id} onClick={() => void atar(c)} title={parteId ? undefined : "Guardá la ficha primero"}>
                      {atando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Es de esta ficha
                    </Btn>
                  }
                />
              ))}
            </div>
          </div>
        )}

        {!cargando && total === 0 && candidatos.length === 0 && !edicion && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Todavía no hay permisos a nombre de este titular. Agregá el primero: sin él, el plan de manejo y la guía piden el
            título habilitante tipeado a mano cada vez.
          </p>
        )}
      </div>
    </div>
  );
}

/** Una fila de permiso: el código manda, lo demás lo acompaña. */
function FilaPermiso({
  contrato: c,
  onEditar,
  onBorrar,
  borrando,
  accion,
}: {
  contrato: Contrato;
  onEditar?: () => void;
  /** Sólo se pasa para los permisos suyos: un candidato se ata, no se borra desde acá. */
  onBorrar?: () => void;
  borrando?: boolean;
  accion?: React.ReactNode;
}) {
  const area = areaDelPermiso(c);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2">
      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{c.codigo}</span>
      {c.tipo && <span className="text-xs text-[var(--text-secondary)]">{TIPO_LABEL[c.tipo]}</span>}
      <span className={`text-xs tabular-nums ${area ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}>
        {area ?? "sin área cargada"}
      </span>
      <span className="text-xs text-[var(--text-tertiary)]">
        {c.vigenciaHasta ? `vence ${fmtFechaCorta(c.vigenciaHasta)}` : "sin vigencia cargada"}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${ESTADO_CLASE[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span>
      {!habilitaPlanDeManejo(c) && (
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">No habilita a talar: es un papel comercial</span>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        {accion}
        {onEditar && (
          <Btn size="sm" variant="ghost" onClick={onEditar}>
            Editar
          </Btn>
        )}
        {onBorrar && (
          <button
            type="button"
            onClick={onBorrar}
            disabled={borrando}
            aria-label={`Dar de baja el permiso ${c.codigo}`}
            title={`Dar de baja el permiso ${c.codigo}`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
          >
            {borrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </span>
    </div>
  );
}
