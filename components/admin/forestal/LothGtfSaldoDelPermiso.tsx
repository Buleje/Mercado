"use client";

/**
 * Lo que trae la guía, por especie, contra lo autorizado del permiso elegido en
 * «Asignar permiso» (15-10). Sólo muestra lo que midió el servidor
 * (`compararGuiaConPermiso`): el botón vuelve a medir en la transacción.
 */

import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Ban, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  avisoSinEspecie,
  type EstadoEspecieEnElPermiso,
  type SaldoDelPermisoParaLaGuia,
} from "@/lib/forestal/loth-guia-permiso-saldo";

const NUM = "text-right font-mono tabular-nums";
const GUION = "—";
const m3 = (v: number | null) => (v == null ? GUION : fmtM3(v));

const ESTADO: Record<EstadoEspecieEnElPermiso, { texto: string; clase: string }> = {
  cabe: { texto: "Cabe", clase: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]" },
  pasa: { texto: "Pasa lo autorizado", clase: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]" },
  fuera_del_permiso: { texto: "No está en el permiso", clase: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]" },
  sin_techo: { texto: "Sin volumen autorizado", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

/** Los primeros 6 códigos y «y N más»; un código no se parte en el guion. */
function CodigosCortos({ codigos }: { codigos: readonly string[] }) {
  const vistos = codigos.slice(0, 6);
  return (
    <>
      (
      {vistos.map((c, i) => (
        <span key={c}>
          {i > 0 && ", "}
          <span className="whitespace-nowrap font-mono">{c}</span>
        </span>
      ))}
      {codigos.length > vistos.length && ` y ${codigos.length - vistos.length} más`})
    </>
  );
}

function Aviso({ children, testid }: { children: React.ReactNode; testid: string }) {
  return (
    <p data-testid={testid} className="flex items-start gap-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export default function LothGtfSaldoDelPermiso({ saldo, cargando, error }: { saldo: SaldoDelPermisoParaLaGuia | null; cargando: boolean; error: string | null }) {
  if (cargando) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Midiendo lo autorizado de ese permiso…
      </p>
    );
  }
  if (error) return <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>;
  if (!saldo) return null;
  const nada = saldo.especies.length === 0 && saldo.sinEspecie.trozas === 0 && saldo.deOtroPermiso.trozas === 0;
  const techo = saldo.plantacion ? "Registrado" : "Autorizado";
  return (
    <section data-testid="saldo-del-permiso" aria-labelledby="saldo-del-permiso-titulo" className="space-y-2">
      <p id="saldo-del-permiso-titulo" className="flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
        Lo que trae la guía contra lo {saldo.plantacion ? "registrado" : "autorizado"}
        <InfoTip
          title="Cómo se lee"
          what="Ya salió = lo movilizado de ese permiso sin esta guía (las guías sin permiso cuentan en todos). Queda = lo autorizado menos lo que ya salió y esta guía."
          affects="Si una especie no está en el permiso o pasa lo autorizado, no se puede asignar: es la misma regla del despacho (T7 y T6)."
          example="Autorizado 320 m³, ya salió 10 m³, la guía trae 1,2 m³ → queda 308,8 m³."
        />
      </p>
      {saldo.bloqueo && (
        <div
          role="alert"
          data-testid="saldo-del-permiso-bloqueo"
          className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{saldo.bloqueo.mensaje}</span>
        </div>
      )}
      {saldo.especies.length > 0 && (
        <DataTable>
          <caption className="sr-only">Por especie: la guía contra lo {techo.toLowerCase()} del permiso</caption>
          <thead>
            <tr>
              <th scope="col">Especie</th>
              <th scope="col" className="text-right">Esta guía m³</th>
              <th scope="col" className="text-right">{techo} m³</th>
              <th scope="col" className="text-right">Ya salió m³</th>
              <th scope="col" className="text-right">Queda m³</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {saldo.especies.map((e) => (
              <tr key={e.especie}>
                <td data-label="Especie" className="font-semibold">
                  {e.especie}
                  <span className="block text-xs font-normal text-[var(--text-tertiary)]">
                    {e.trozas} {e.trozas === 1 ? "troza" : "trozas"}
                  </span>
                </td>
                <td data-label="Esta guía m³" className={NUM}>{m3(e.guiaM3)}</td>
                <td data-label={`${techo} m³`} className={NUM}>{m3(e.autorizadoM3)}</td>
                <td data-label="Ya salió m³" className={NUM}>{m3(e.yaSalioM3)}</td>
                <td data-label="Queda m³" className={`${NUM} ${e.quedaM3 != null && e.quedaM3 < 0 ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : ""}`}>{m3(e.quedaM3)}</td>
                <td data-label="Estado">
                  <span className={`inline-flex whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-bold ${ESTADO[e.estado].clase}`}>{ESTADO[e.estado].texto}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {saldo.permisoSinEspecies && saldo.especies.length > 0 && (
        <Aviso testid="saldo-permiso-sin-especies">Este permiso no tiene especies cargadas: no hay contra qué comparar.</Aviso>
      )}
      {saldo.sinEspecie.trozas > 0 && (
        <Aviso testid="saldo-sin-especie">
          {avisoSinEspecie(saldo.sinEspecie.trozas)} <CodigosCortos codigos={saldo.sinEspecie.codigos} />.
        </Aviso>
      )}
      {/* Las trozas de otro permiso las nombra el bloqueo, cada una con su permiso (`TROZA_DE_OTRO_PERMISO`). */}
      {nada && <p className="text-sm text-[var(--text-secondary)]">La guía no tiene trozas con despacho vivo: no mueve el saldo de este permiso.</p>}
    </section>
  );
}
