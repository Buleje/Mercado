# ADR-516 — Código único y correlativo de cada papel del Archivo

- **Estado:** aceptado (2026-10-24). Schema: `20261024a_documento_codigo_adr516` + `20261024b_documento_codigo_trigger_robusto` (revisión de security, mismo día).
- **Pedido por:** Brandon (24-10): «cada documento en general, sea de mi sistema o subido, tenga un código único correlativo y fácil de entender que no se repetirá en ninguna parte… cuando me da el código en digital, ese código lo pondré en mi archivo físico… y lo colocaré como "ya ingresado el código al físico"; los que todavía no tienen el código puesto saldrán como pendientes, y avisos para ponerlo».
- **Relacionados:** ADR-500 (ID de tienda: código aleatorio, la otra receta), ADR-502 (Archivo como hub), ADR-474 (código único de troza).

## Contexto

Un papel físico del negocio y su copia en el Archivo no tenían nada en común que una persona pudiera escribir a mano. El `id` (cuid) no se dicta, y el nombre cambia. Hacía falta un número corto, que no se repita nunca (tampoco después de borrar) y que diga si ya está escrito en el papel.

## Decisión

1. **Columnas aditivas y anulables en `Document`:**
   - `codigo INT` con `UNIQUE (tenantId, codigo)`;
   - `codigoFisicoAt TIMESTAMP` y `codigoFisicoPor TEXT` (el `username` del JWT).
2. **Formato:** se muestra como `DOC-000123` (`lib/documentos/codigo-documento.ts`). El prefijo es un parámetro, así que un prefijo propio por negocio es un cambio de lectura, sin tocar el schema.
3. **Contador por negocio en `DocumentCodigoContador(tenantId, ultimo)`.** Nunca baja.
   - Lo sube un trigger `BEFORE INSERT` (`documento_asignar_codigo`) con `UPDATE … RETURNING`. El candado de esa fila ordena a las altas simultáneas; medido: 12 a la vez dan 1…12 sin repetir.
   - Borrar (a la papelera o del todo) no libera el número.
   - El siguiente es `GREATEST(ultimo, MAX(codigo) del negocio) + 1` (el `MAX` lo resuelve el índice único). Si el contador quedó por debajo de un código que existe (su fila borrada, un cambio a mano), el alta sigue sin chocar. Antes de `20261024b`, ese caso hacía fallar TODAS las altas del negocio, también las de la producción vieja.
   - Un código explícito crea o sube el contador hasta él (`INSERT … ON CONFLICT DO UPDATE SET ultimo = GREATEST(…)`). En un negocio viejo todavía sin relleno, eso adelanta la numeración: lo nuevo sale antes que lo viejo. Se acepta porque sólo pasa al restaurar un respaldo, y el número no se reutiliza.
   - Va en la base y no en `DocumentsDB.create` porque así también numera el cliente Prisma viejo de producción (sin deploy) y cualquier alta que no pase por la clase.
4. **Fotos de las cámaras sin código** (etiquetas `personas` y `asistencia`, las de `TAGS_FOTOS_DE_MAQUINA`; `tags` admite NULL y se lee con `COALESCE(tags, '{}')`). Son de máquina, nadie las archiva en papel, y en Blas son ~365. Un test guardián exige que el trigger, el relleno y la app usen las mismas etiquetas.
5. **Los negocios existentes se numeran con el relleno** (`scripts/documentos-codigo-relleno.mjs`):
   - mientras un negocio tiene papeles sin número y no tiene contador, el trigger no numera (si numerara, lo nuevo quedaría antes que lo viejo);
   - el relleno va en orden de `uploadedAt` e incluye la papelera;
   - es idempotente y deja el contador en el máximo;
   - un negocio nuevo crea su contador con el primer papel;
   - el relleno y el trigger (en el camino «sin contador visible») toman el mismo candado consultivo por negocio (`pg_advisory_xact_lock(hashtextextended('documento_codigo:' || tenantId, 516))`). Un alta en el mismo instante espera a que el relleno confirme y sale numerada a continuación. Si alguna vez queda un papel sin número (un alta en REPEATABLE READ), se vuelve a correr el relleno: es idempotente;
   - `--tenant` va con el id del negocio. El script rechaza un id que no existe o que empieza con `--`.
   - El 24-10 se corrió sólo en `main` (99 papeles). Los demás negocios están listos: `--todas` o `--tenant <id>`.
6. **Marcar «ya lo puse en el físico»** con `PATCH /api/admin/documents/codigo-fisico {ids[], puesto}`:
   - uno o una selección;
   - cualquier rol del panel (los mismos que editan un papel), y sólo sobre lo que su rol ve;
   - el negocio sale del JWT;
   - queda en el historial (`codigo_fisico`);
   - no toca `updatedAt`: anotar el código no es modificar el papel.
7. **Pendientes:**
   - vista «Código por poner» del drive (`?sub=codigo`), con su cifra en la cabecera (`GET ?conteo=1&codigoPendiente=1`);
   - aviso sólo en la campana, uno por día como máximo (fecha de Lima en el `entityId`), y sólo si algún papel lleva 2 días o más (cron `documentos-codigo-avisos`, 09:25 UTC);
   - sin WhatsApp ni correo.
8. **Búsqueda:**
   - `DOC-000123`, `doc 123` y `#123` se buscan tal cual y el papel de ese código va primero, en el Archivo y en el buscador del panel;
   - un número solo sigue interpretándose: `2026` es el año del papel.

## Alternativas descartadas

- **`SEQUENCE` de Postgres por negocio:** habría que crear una por tenant. Además `nextval` no vuelve atrás con un ROLLBACK, así que deja huecos.
- **`MAX(codigo)+1` en la app:** dos altas a la vez leen el mismo máximo. Además, borrar el último papel devolvería su número.
- **Código aleatorio como el de ADR-500:** Brandon pidió un correlativo «fácil de entender».
- **Numerar las fotos de las cámaras:** gastaría el correlativo en lo que nunca va a papel.

## Consecuencias

- Hay un trigger en `Document`: un `INSERT` masivo hace una ida al contador por fila. Sirve para el ritmo del Archivo (decenas al día), no para importar 100.000 de golpe.
- Cada negocio ve **huecos** donde hubo papeles borrados (`DOC-000004` borrado ⇒ el siguiente es el 5). Es a propósito: el código no se reutiliza.
- Mientras un negocio no corra su relleno, sus papeles nuevos no tienen código y la UI no dibuja nada.
- Si alguien borra la fila del contador, la numeración sigue desde el código más alto que **queda**. Los números quemados por encima de ese máximo (papeles purgados del todo) podrían volver a salir. Ese registro sólo vive en el contador, y borrarlo es una intervención a mano en la base.
- Verificación contra la base: `node -r dotenv/config scripts/documentos-codigo-conducta.mjs dotenv_config_path=.env.local` (ROLLBACK + negocio sintético; no deja filas).
