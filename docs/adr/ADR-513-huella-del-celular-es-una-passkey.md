# ADR-513 — La huella del celular es una passkey del que recibe, no una imagen
- **Estado:** aceptado (2026-10-23). Schema: `prisma/migrations/20261023b_adelanto_passkey_adr513` (tabla `AdelantoPasskey` + `AdelantoFirma.metodo/credentialId/constancia` + CHECK `AdelantoFirma_passkey_chk`), aditiva; revisión de seguridad (mismo día) en `20261023c_adelanto_passkey_registro` (`AdelantoPasskey.enlaceId/registroIp/registroUserAgent`, nullable), aditiva.
- **Pedido por:** Brandon (23-10): «la huella de quien recibe el adelanto con el celular, con el detector de huella, lo que se usa para desbloquear el celular».
- **Relacionados:** ADR-491 (registro de firmas append-only, enlace de firma de un uso), ADR-448 (adelantos DADO/RECIBIDO).

## Contexto
El recibo del adelanto ya junta firma y huella como **imagen** (cámara del panel o foto en el celular por el enlace, ADR-491). Brandon pidió usar el lector de huella del celular. La web **no puede** leer la huella: el navegador sólo expone WebAuthn, donde el teléfono verifica al usuario (huella, cara o PIN) y firma un reto con una llave que nunca sale del aparato. El servidor recibe una firma criptográfica, no un dedo.

## Decisión
1. La «huella del celular» es una **passkey** (WebAuthn, autenticador de plataforma, `userVerification: "required"`, attestation `none`) **de la persona del adelanto** (`AdelantoPasskey`, por `tenantId` + `beneficiarioId`, `credentialId` único por negocio).
2. Se registra y se usa **sólo desde el enlace de firma** (`/firmar-adelanto/[token]`): el token (sha256, 48 h, un uso) más el DNI cuando la ficha lo tiene. Sin ninguna llave vigente → `create` y enseguida `get`; con llave para ese dominio → sólo `get`; con llave en OTRO dominio → 409 `ya_registrada` (ver «Revisión de seguridad»).
3. El reto es de **un uso** (KV efímero, 5 min, consumido con `kvBorrarSiEs` atómico: sólo quien lo borra con el valor exacto sigue) y está **atado al recibo**: 16 bytes al azar + `sha256(tenant | adelanto | monto | moneda | código)`. El celular firma ese reto: la firma vale por ESE monto de ESE adelanto.
4. Se verifica **en el servidor** (`@simplewebauthn/server` 14.0.3) con origen y rpId **de una lista** (`NEXT_PUBLIC_BASE_URL` + `PASSKEY_ORIGENES`; fuera de producción, localhost y los túneles de `allowedDevOrigins`). El `Origin` del pedido sólo elige dentro de la lista.
5. Al firmar queda una fila **HUELLA** con `metodo: "passkey"`, `credentialId` y `constancia` (JSONB: clientDataJSON, authenticatorData, firma, contador, rpId, origen, hash del contexto). Sin imagen: `ruta` es un nombre `.passkey` en la carpeta del registro (el CHECK de ruta lo pide; la puerta de la imagen da 404) y `sha256`/`bytes` son de la constancia. El registro sigue append-only (trigger de ADR-491).
6. El **contador** de la llave sube en la MISMA transacción que la firma, con `updateMany … where counter = el leído`: un contador que baja (clon) o dos confirmaciones a la vez con la misma llave → una sola anota, la otra 409 `contador_bajo`.
7. Una llave de otra persona, revocada o de otro dominio → 403 `credencial_ajena`; de otro negocio no existe (el WHERE lleva `tenantId`).
8. **Revocar** = admin/dueño desde la ficha de la persona (`DELETE …/beneficiarios/[id]/passkeys/[passkeyId]`, `permisoAdelantos(…, "delete")`). Es blando (`revokedAt`): lo ya firmado sigue verificable con su llave pública.
9. El papel dice «Lo confirmó el aparato registrado para esta persona (passkey) el 23/10 14:05» dentro de la casilla, «Confirmación (passkey)» debajo y el origen de la llave («llave registrada con este mismo enlace» / «llave registrada el 20/10 con otro enlace»); el registro del panel, lo mismo.

## Revisión de seguridad (23-10, sin críticos; un ALTO cerrado)
El ALTO: con sólo el enlace y el DNI cualquiera registraba una llave, y `nueva: true` sumaba otra sin aprobación. Cierre:
1. **El enlace no suma un segundo celular.** Si la persona tiene una llave vigente (en CUALQUIER dominio: con el comodín de `PASSKEY_ORIGENES` otro subdominio abriría la puerta), `opciones` y `registrar` contestan 409 `ya_registrada`: «pídele al administrador que revoque el anterior». La revocación del admin desde la ficha ES la aprobación del cambio. La opción «Cambié de celular» y el campo `nueva` se quitaron (el schema es `.strict()`: mandarlo = 400).
2. La llave guarda **con qué enlace, IP y user-agent** se registró. La constancia (v2) y el papel dicen si la llave se registró con el MISMO enlace con que se firma (prueba más débil: el mismo token hizo todo) o con otro enlace y cuándo.
3. El nombre del celular que mandaba el cliente ya no se acepta (`dispositivo` = 400); el panel muestra «según su navegador: Android» (del user-agent, falsificable y rotulado así) y las filas viejas como «nombre que puso quien lo registró».
4. **Tope**: 3 llaves vigentes por persona, contado bajo `SELECT … FOR UPDATE` de la persona en la misma transacción que el alta (dos altas a la vez no pasan el tope ni la regla 1). `allowCredentials` siempre son las vigentes reales.
5. Texto honesto en constancia, papel y panel: «lo confirmó el aparato registrado para esta persona», nunca «su huella».
- MEDIO: la constancia copia `publicKey` y `credentialId`: verificable aunque la fila de la llave cambie.
- BAJO: el reto se consumía en dos pasos (leer + borrar); ahora el KV guarda un texto con el contexto y se borra con `kvBorrarSiEs` (comparar y borrar en uno). Un reto ya usado deja una lápida 10 min para distinguir `reto_usado` de `reto_vencido`.

## Límites (lo que NO prueba)
- Prueba que quien confirmó **es el dueño de ESE celular** (el que desbloquea con su huella o PIN) y que el celular firmó ESTE monto. **No** prueba identidad ante RENIEC: un celular con dos huellas enroladas o con PIN compartido confirma igual.
- La confianza del **registro** es la del enlace: token + DNI. Quien tenga el enlace y el DNI de una persona SIN llave puede registrar su celular; por eso el panel muestra cuándo, con qué enlace y según qué navegador se registró, el papel avisa si fue con el mismo enlace, y se revoca.
- `rpId` = dominio. **Cambiar de dominio** (localhost → túnel → producción, o un dominio propio) obliga a registrar de nuevo; la llave vieja queda y sólo valida lo firmado con ella.
- Celulares sin lector o navegadores sin WebAuthn de plataforma: el botón no aparece y queda la foto de la huella.

## Alternativas descartadas
- **Foto de la huella por la cámara** (ya existe, ADR-491): sigue como opción; sirve sin celular propio, pero es una imagen sin verificación.
- **Lector de huella USB** en el mostrador: compra de hardware, driver por equipo y no sirve en el monte (donde se firma por enlace).
- Guardar o comparar la imagen de la huella del celular: imposible por diseño de WebAuthn y además sería dato biométrico (Ley 29733).

## Consecuencias
- Dependencias nuevas: `@simplewebauthn/server` 14.0.3 y `@simplewebauthn/browser` 14.0.0 (la 14.0.3 del navegador no existe; la 14.0.0 tiene más de 14 días).
- Env opcional `PASSKEY_ORIGENES` (coma, `*` como comodín de subdominio) para dominios propios de tiendas.
- Rutas públicas nuevas bajo `/api/public/adelantos/[token]/passkey/{opciones,registrar}` (STRICT por IP, balde `adelanto-passkey`, exentas de CSRF por el prefijo de `lib/csrf.ts`, tapadas en telemetría por `lib/telemetry/secretos-en-url.ts`).
- La supresión de una huella (Ley 29733) sobre una fila passkey no tiene archivo que borrar: el log lo dice.
