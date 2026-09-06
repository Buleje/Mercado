"use client";

/**
 * «En tus guías hay contactos que no están en la libreta» (ADR-357).
 *
 * El Directorio mostraba 0 proveedores, 0 destinatarios, 0 transportistas y 0
 * conductores en un tenant con **17 guías cargadas**, todas con su titular, su
 * destinatario y su chofer con DNI. Los datos estaban; vivían dentro de cada
 * guía y había que volver a tipearlos a mano.
 *
 * Acá se PROPONEN, no se dan de alta solos: una guía trae el nombre como lo
 * tipeó el emisor y un alta automática llenaría la libreta de duplicados que
 * después nadie limpia. El operador ve quién es, en cuántas guías aparece y con
 * qué documento, y decide.
 */

import { useCallback, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Check, Loader2, Plus, Users } from "@buleje/design-system/icons";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { claveDeParte, descubrirEnGuias, normalizarPlaca, type CandidatoParte, type GuiaConPartes } from "@/lib/forestal/directorio-desde-guias";
import { ROL_LABEL, type Parte, type ParteInput, type RolParte, type Vehiculo } from "@/lib/forestal/directorio";
import { Btn } from "./ctp-shared";

/** El tope del listado: una libreta se arma con las guías que hay, no con mil. */
const GUIAS_A_LEER = 500;

const DOC_VALIDOS = new Set(["RUC", "DNI", "CE", "PASAPORTE"]);

export default function CtpDirectorioDesdeGuias({
  partes,
  vehiculos,
  onGuardarParte,
  onGuardarVehiculo,
}: {
  partes: Parte[];
  vehiculos: Vehiculo[];
  onGuardarParte: (input: ParteInput & { id?: string }) => Promise<Parte>;
  onGuardarVehiculo: (input: { placa: string; tipo?: string }) => Promise<Vehiculo>;
}) {
  const [guias, setGuias] = useState<GuiaConPartes[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listos, setListos] = useState<Set<string>>(new Set());

  const buscar = useCallback(async () => {
    setBuscando(true);
    setError(null);
    try {
      const r = await ctpGet<{ entries?: GuiaConPartes[] }>(
        `/api/admin/forestal/wood-entries?limit=${GUIAS_A_LEER}`,
      );
      setGuias(r.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuias([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  /** Lo que ya está en la libreta, con la misma clave que usa el descubrimiento. */
  const yaEstan = useMemo(
    () => new Set(partes.map((p) => claveDeParte(p.docNumero, p.nombre))),
    [partes],
  );
  const placas = useMemo(
    () => new Set(vehiculos.map((v) => normalizarPlaca(v.placa))),
    [vehiculos],
  );

  const descubierto = useMemo(
    () => (guias ? descubrirEnGuias(guias, yaEstan, placas) : null),
    [guias, yaEstan, placas],
  );

  const pendientes = useMemo(
    () => (descubierto?.partes ?? []).filter((p) => !listos.has(p.clave)),
    [descubierto, listos],
  );
  const placasPendientes = useMemo(
    () => (descubierto?.vehiculos ?? []).filter((v) => !listos.has(`veh:${v.placa}`)),
    [descubierto, listos],
  );

  const alta = useCallback(
    async (c: CandidatoParte) => {
      setGuardando(c.clave);
      setError(null);
      try {
        await onGuardarParte({
          roles: c.roles as RolParte[],
          nombre: c.nombre,
          /* El tipo de documento sólo viaja si es uno de los que el libro
             admite: mandar «—» haría fallar el Zod del endpoint entero. */
          ...(c.docNumero && c.docTipo && DOC_VALIDOS.has(c.docTipo.toUpperCase())
            ? { docTipo: c.docTipo.toUpperCase() as ParteInput["docTipo"], docNumero: c.docNumero }
            : {}),
          notas: `Tomado de la guía ${c.ejemplos[0] ?? "—"}${c.guias > 1 ? ` y ${c.guias - 1} más` : ""}.`,
        });
        setListos((prev) => new Set(prev).add(c.clave));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setGuardando(null);
      }
    },
    [onGuardarParte],
  );

  const altaVehiculo = useCallback(
    async (placa: string) => {
      setGuardando(`veh:${placa}`);
      setError(null);
      try {
        await onGuardarVehiculo({ placa });
        setListos((prev) => new Set(prev).add(`veh:${placa}`));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setGuardando(null);
      }
    },
    [onGuardarVehiculo],
  );

  const total = pendientes.length + placasPendientes.length;

  return (
    <section className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
            Traer contactos de las guías
          </CardTitle>
        </div>
        <Btn variant="secondary" onClick={() => void buscar()} disabled={buscando}>
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          {guias == null ? "Buscar en las guías" : "Volver a buscar"}
        </Btn>
      </div>

      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Cada guía ya trae su titular, su destinatario y su chofer con DNI. Acá se listan los que{" "}
        <b>todavía no están en la libreta</b>. No se dan de alta solos: el nombre viene como lo tipeó quien emitió la
        guía, y cargarlos a ciegas llena el directorio de duplicados.
      </p>

      {error && (
        <p className="mt-2 rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {descubierto != null && total === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {guias?.length
            ? "Todos los contactos de tus guías ya están en la libreta."
            : "No hay guías cargadas todavía."}
        </p>
      )}

      {total > 0 && (
        <ul className="mt-3 space-y-2">
          {pendientes.map((c) => (
            <li
              key={c.clave}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm">
                <b className="text-[var(--text-primary)]">{c.nombre}</b>
                <span className="ml-2 text-[var(--text-tertiary)]">
                  {c.roles.map((r) => ROL_LABEL[r]).join(" · ")}
                  {c.docNumero ? ` · ${c.docTipo ?? "Doc"} ${c.docNumero}` : " · sin documento"}
                </span>
                <span className="block font-mono text-xs text-[var(--text-tertiary)]">
                  en {c.guias} guía{c.guias === 1 ? "" : "s"}
                  {c.ejemplos.length > 0 && ` · ${c.ejemplos.join(", ")}`}
                </span>
              </span>
              <Btn variant="secondary" onClick={() => void alta(c)} disabled={guardando === c.clave}>
                {guardando === c.clave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Agregar
              </Btn>
            </li>
          ))}

          {placasPendientes.map((v) => (
            <li
              key={v.placa}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm">
                <b className="font-mono text-[var(--text-primary)]">{v.placa}</b>
                <span className="ml-2 text-[var(--text-tertiary)]">
                  vehículo {v.modo ?? "terrestre"} · en {v.guias} guía{v.guias === 1 ? "" : "s"}
                </span>
              </span>
              <Btn
                variant="secondary"
                onClick={() => void altaVehiculo(v.placa)}
                disabled={guardando === `veh:${v.placa}`}
              >
                {guardando === `veh:${v.placa}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Agregar
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
