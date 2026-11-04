# Contrato: cajón de Anexos 04 del Libro CTP — arquitecto 28-10 (sólo lectura)

Pedido aprobado por Brandon 28-10. Sin schema. **No arrancar sin las respuestas de §Decisiones** (al menos la 1).

## Hallazgo principal
El Anexo 04 **no tiene casillero de comprador** por norma (casilleros 1-16 son del emisor, `anexo04-serfor.ts:24-40`); el destinatario (casilleros 20-28) y el vehículo van en la GTF: `ForestCtpEntry.destino` y `gtfDatos.destinatario` (`ctp-gtf-datos.ts:266`). Los «18 sin comprador» medidos antes eran la `empresa` (razón social del CTP emisor) vacía. Lo que cuenta: **14 guías sin salida**.

## Dónde vive
- Una fila de `PlatformSetting`, clave `ctp-anexos:<tenantId>` (`lib/db/forest-anexos.db.ts:31-36`). **Sí se ve con SQL**: `select … from "PlatformSetting", jsonb_array_elements(value::jsonb) a where key='ctp-anexos:'||$1`.
- 18 anexos = 971.610 bytes (~54 KB c/u). Tope 200 (`MAX_EMITIDOS`); `recortarBandeja` saca los viejos que no están en el libro.
- Campos (`anexo04-registro.ts:14-81`): N°, GTF, fecha, empresa, firmante, documento, cargo, PT, m³, piezas, `especieGlobal`, `ctpEntryId`, `permiso`, `despachoIds`, `reemplazadoPor`. Sin comprador ni vehículo.

## Blas hoy (SQL, sólo lectura)
| Medida | Valor |
|---|---|
| Anexos | 18: 16 con GTF de 14 guías; 2 sin N° ni GTF (03-10 y 24-10) |
| Guías con dos anexos | 064 y 065, ninguno marcado reemplazado. N° 2-19-0488732 en la 065 y la 066 (7.201,04 PT cada uno) |
| Empresa, firmante, DNI del emisor | vacíos 18/18 |
| Con salida en el libro | 0 (`despachoIds` y `ctpEntryId` vacíos); el libro tiene 0 despachos |
| Libreta de partes | 3 de 13 reciben madera (destinatario/cliente) |
| Plazo | 13 de 14 guías fuera de plazo; sólo la 071 (28-10) en plazo hasta ~30-10 (no verificado) |

## Se reusa
`clasificarAnexos` (`anexo-a-despacho.ts:1110`: pendientes/reemplazados/registrados/sin guía) · `salidasPorRegistrar` (2 días hábiles) · ruta `anexos/a-despacho` (admin/owner, `route.ts:110`) + `CtpGuiasSinRegistrarModal` · `useFlujoAlLibro().abrir()` (hoy no recibe el anexo) · `CtpParteBarra rol="destinatario"`, `CtpParteCampos`, `useDirectorioForestal().receptores()` (`CtpGtfDatosForm.tsx:298-312`) · pestañas `CtpDespachoPestanas.tsx:37`, `SUBS_DESPACHO` (`ctp-vistas-fusionadas.ts:33`).
Falta: campo comprador; endpoint para completarlo; lista sin piezas; que la salida copie el comprador (`entradaDeLinea` no pone `destino` ni `gtfDatos`, `forest-ctp-guia-desde-anexo.db.ts:367-397`). Ctrl+K abre el anexo por **id**, no por N° (`AnexoBuscadoEnUrl.tsx`).

## Contrato (escribirlo y confirmarlo ANTES de lanzar los 2 carriles)
```ts
// lib/forestal/anexo04-registro.ts
/** El destinatario de la GTF. No se imprime en el Anexo 04. */
export type CompradorDelAnexo = Pick<GtfDatos["destinatario"],
  "nombre"|"docTipo"|"docNumero"|"direccion"|"departamento"|"provincia"|"distrito"> & { parteId?: string|null };
// AnexoEmitido + comprador?: CompradorDelAnexo|null; compradorAt?: string; compradorPor?: string;
// vinculosDe() tiene que CONSERVAR el comprador (save() rearma el registro y lo borraría al rebajar el PDF).
export type EstadoEnCajon = "pendiente"|"registrado"|"reemplazado"|"sin-guia";
export interface AnexoEnCajon extends Omit<AnexoEmitido,"piezas"|"trasera"> {
  estado: EstadoEnCajon; especies: string[]; despachosVivos: string[];
  reemplazadoPorNumero?: string; porGtf?: string; venceEl?: string; fueraDePlazo?: boolean;
  compradorDeLaSalida?: string|null;
}
export interface CajonDeAnexos { anexos: AnexoEnCajon[];
  resumen: { guiasSinSalida: number; fueraDePlazo: number; sinComprador: number; sinGuia: number; ptPendiente: number; m3Pendiente: number } }
```
- `lib/forestal/anexo04-comprador.ts` (nuevo): `compradorSchema` (nombre 2-200; `docTipo` RUC|DNI|CE|PASAPORTE; doc ≤20 con `superRefine` RUC 11 / DNI 8; dirección/ubicación `default("")`; `parteId` nullish). PATCH `{ id, comprador: compradorSchema.nullable() }`.
- `app/api/admin/forestal/anexos/cajon/route.ts` (nuevo): `GET` → `CajonDeAnexos`; `PATCH` → `{ anexo }`. Roles admin/almacenero/owner, CSRF, rate limit `GENEROUS`. Errores 409 `ANEXO_REGISTRADO`, 409 `TANDA_EN_CURSO`, 404.
- `ForestAnexosDB.cajon(tenantId, hoy)` y `ponerComprador(tenantId, id, comprador, user)` (`PlatformSettingsDB.actualizar`, espera ≤3 s; `auditCtp("ctp_anexo04_comprador")`). Sin caché que invalidar; el cliente emite `EVENTO_ANEXO_GUARDADO`.

## Fases
| Fase | Archivos | Tests | No se toca |
|---|---|---|---|
| F1 cajón + comprador | backend: `anexo04-registro.ts`, `anexo04-comprador.ts`, `forest-anexos.db.ts`, `anexos/cajon/route.ts` · frontend: `ctp-vistas-fusionadas.ts`, `CtpDespachoPestanas.tsx`, `subvistas-modulos.ts` (`{vista:"despacho",key:"anexos",label:"Anexos 04"}`), `CtpAnexosCajon.tsx`, `CtpAnexoCompradorModal.tsx`, `hooks/use-cajon-anexos.ts` | `__tests__/anexo04-comprador.test.ts` (RUC/DNI; sobrevive a `save`; casos de Blas: 064/065 dobles, 0488732 en 2 guías, sin GTF) | `anexos/route.ts`, paso al libro, schema |
| F2 salida desde el anexo | `forest-ctp-guia-desde-anexo.db.ts` (`destino`/`gtfDatos.destinatario` del anexo GUARDADO, nunca del cliente), `CtpGuiasSinRegistrarEntrada.tsx` (`abrir(anexoId?)`), `CtpGuiasSinRegistrarModal.tsx` (prop `inicial`), acciones de fila: «Pasar al libro» sólo si `puedePasarAlLibro`, «Ver salida» | ampliar `forestal-anexo-a-despacho.test.ts` (sin comprador → `destino` `null`, nunca `""`) | `propietario` de la guía (WASACO: la madera no es del CTP) y orígenes |
F2 pasa por `reviewer` (cambia lo que escribe el libro). PT/m³ pendientes = derivados: contar sólo el anexo vigente por guía y decir «según los anexos».

Sacar los anexos del KV a una tabla: NO ahora (tabla nueva + migrar 18 + doble lectura + rehacer el candado de la bandeja, archivo de 1.335 líneas). Pensarlo con ~90 anexos (~5 MB), ≈12 meses al ritmo de 6/mes.

## ADR
Chico: «El comprador de la guía se anota en el Anexo 04 hasta que exista su salida».

## Decisiones (preguntadas el 28-10; Brandon cerró la terminal antes de contestar)
1. ¿Comprador = destinatario de la guía (a quién se entrega la madera), guardado en el anexo hasta su salida? (recomendado sí)
2. ¿Llenar razón social, firmante y DNI del emisor desde la Ficha CTP? (18/18 vacíos; cambia la regla de 2026-08 de «el anexo abre en blanco»)
3. ¿El comprador entra a la libreta de partes buscado por RUC/DNI? (recomendado sí)
4. Los 2 sin N° ni GTF: ¿mostrar como «sin GTF»? (recomendado) ¿o borrar?
5. N° 2-19-0488732 en la 065 y la 066: ¿de cuál es? (recomendado: marcarlo «mismo N° en 2 guías» para revisar con el papel)
