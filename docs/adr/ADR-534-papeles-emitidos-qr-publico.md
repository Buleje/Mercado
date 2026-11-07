# ADR-534 — Papeles emitidos con QR público (sin datos personales)

- **Estado:** aceptado (2026-11-04). Schema: `20261104b_papeles_emitidos_adr534` (tabla `PapelEmitido`).
- **Pedido por:** Brandon (04-11): «QR que abre la copia del papel en el panel» — que quien recibe una proforma o una liquidación de Blas pueda comprobar con el celular que el papel es real y sigue vigente.
- **Relacionados:** formato único de papeles de Blas (programa local `papel`, 11 moldes), ADR-530 (respaldos del libro: comparar sin pisar), Ley 29733 (datos personales).

## Contexto

El programa local `papel` emite los papeles de Blas (proforma PRO-0002, liquidación LIQ-0001…) y en el pie imprime un código `BLAS-PRO-0002-7F3A` (4 hex del sha256 del contenido). `papel rehacer` = mismo número, contenido nuevo → código NUEVO; `papel estado` = mismo código, cambia el estado (borrador, en revisión, oficial, anulado). Hasta hoy el panel no sabía nada de esos papeles: un papel viejo o anulado circulando no se podía distinguir del vigente.

El QR de la hoja tiene que abrir una página PÚBLICA (sin sesión). Esa página la ve cualquiera que tenga la hoja o una foto de ella: no puede mostrar nombre, DNI, dirección ni el detalle de lo cobrado.

## Decisión

1. **Tabla propia `PapelEmitido` sin datos personales**: tipo, número, título, fecha, estado, código, clave, total, moneda, hojas, PDF en Documentos (opcional) y `reemplazadoPor`. Lo que no se guarda no se puede filtrar: la página pública no tiene de dónde sacar un nombre.
2. **Clave del QR**: 12 hex que viajan SOLO dentro del QR (no se imprimen en texto). Sin la clave, la página muestra tipo, número, fecha y estado; con la clave, también el total. Se compara en tiempo constante (`crypto.timingSafeEqual`). El panel lista sin la clave.
3. **Versiones**: la fila más nueva (createdAt) de un número es la vigente. Al registrarla, las anteriores no anuladas pasan a `reemplazado` → código vigente. Un código viejo que vuelve a llegar queda reemplazado aunque pida otro estado (salvo `anulado`). La regla es una función pura (`planVersiones`, `lib/papeles/registro.ts`) con test.
4. **El código no se pisa**: mismo código con otro número u otra clave = 409 `codigo_en_uso`. Registrar el mismo código otra vez (con su clave) actualiza estado y datos: así `papel estado` es un POST más.
5. **Candado por número** (`pg_advisory_xact_lock(tenant, papel:<número>)`) dentro de la transacción: dos versiones del mismo número a la vez no pueden quedar las dos vigentes.
6. **`reemplazado` lo pone solo el servidor**: el esquema del pedido lo rechaza.
7. **El PDF enlazado se verifica del negocio** (`documentId` con `tenantId` en el where) antes de guardarlo.
8. Escribir = `POST /api/admin/papeles` (admin/owner; CSRF; auditoría `papel_registrar`). Leer en el panel = `GET` (sin clave). Lo público sale de `PapelesEmitidosDB.publico` con un `select` explícito, nunca la fila entera.

## Alternativas descartadas

- **Guardar el papel como `Document` con etiquetas** (`papel:PRO-0002`, `estado:oficial`): el lector OCR/IA de Documentos reescribe metadatos y título, las etiquetas ensucian la vista de Documentos y la fila de Document sí tiene nombres de archivo con datos de la persona: la página pública quedaría a un `select` de mostrarlos.
- **Firmar el QR (HMAC) sin tabla**: prueba que el papel salió de Blas, pero no puede decir que fue anulado o reemplazado después de imprimirse, que es justo lo que importa.
- **Mostrar el total a cualquiera con el código**: el código está impreso en texto y sale en fotos de WhatsApp; el total es información comercial.

## Consecuencias

- Cada papel nuevo del programa `papel` hace un POST al panel del negocio; si falla (sin internet), el papel se imprime igual y se registra después (mismo código, idempotente).
- La página pública (`/verificar/papel/[codigo]`) lee del negocio que resuelve el host y debe limitar pedidos por IP: el código de 4 hex se puede adivinar por número, pero sin la clave solo muestra lo que ya dice la hoja.
- `PapelEmitido` es aditiva (sin enum): el Prisma viejo de producción no la lee.
- Una versión anulada que era la vigente sigue siéndolo (la regla es por fecha de alta): las anteriores quedan reemplazadas por ella, no reviven.

## Revisión de seguridad (04-11, `security` opus)

Veto solo para imprimir el 1.er QR real hasta cerrar H1; todos arreglados antes de guardar:

- **H1 (alto)** — cualquiera que se dé de alta podía registrar «BLAS-PRO-…» y su página parecía de Blas. Ahora el prefijo del código es de UN solo negocio (`prefijo_de_otro_negocio`, 422) y la página dice «Emitido por <negocio>» y muestra el código para compararlo con el impreso.
- **H2** — adivinar códigos de 4 hex: tope de 30 consultas por minuto por IP en la página (en memoria, por instancia; el proxy no limita `/v` ni `/verificar` y no se tocó: zona de peligro).
- **H3** — un papel ya registrado no se reescribe: solo cambian su estado o su PDF (`papel_distinto`, 409).
- **H4** — el título lo pone el servidor según el tipo (nunca texto libre del cliente: podía llevar nombres o DNI).
- **H5** — los rechazos quedan anotados (`logger.warn`).

En pruebas sobre la base compartida se usa el prefijo `QAPR`, nunca `BLAS` (el prefijo quedaría reservado para `main`). Probado en el panel local 04-11: alta 200, mismo código con otro total 409, página sin clave sin total, con clave S/ 1,250.00, anulado en rojo, código inventado «no encontrado».

## Pantalla en el panel (04-11 noche)

`Documentos › Papeles emitidos` (`components/admin/documentos/papeles/`): un papel por número con su versión vigente (la más nueva), las anteriores plegadas debajo, filtros por estado con su cuenta, buscador (número, código o tipo), «Ver PDF» con el visor del Archivo y «QR» a la dirección corta del negocio (`useBaseVerificacion` + `/p/<código>`, sin la clave → sin total). Solo lectura a propósito: el estado va impreso en la hoja, cambiarlo es rehacer el PDF con el programa `papel`. La pestaña se esconde cuando el rol ya se sabe y no es admin/owner (mientras carga queda, para no perder `?vista=papeles` ni la vista recordada); un cajero que llegue igual ve «solo dueño y administrador» (la ruta da 403).
