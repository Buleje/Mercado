# ADR-525 — Persona de Adelantos: relación, Yape/Plin, referencia, nacimiento y foto del DNI privada

- **Estado:** aceptado (2026-10-30). Schema: `prisma/migrations/20261030b_adelanto_persona_ficha_adr525` (aditivo: 6 columnas nullable en `AdelantoBeneficiario`).
- **Pedido por:** Brandon (30-10). Eligió los 4 grupos de datos nuevos para la persona de Adelantos: qué es para el negocio, Yape/Plin, contacto de referencia y fecha de nacimiento + foto del DNI.
- **Relacionados:** ADR-491 (bucket privado de las hojas firmadas y los vouchers), ADR-330 (identidad RENIEC/SUNAT en la misma ficha), ADR-524 (fichas del directorio forestal, que ya tienen `nacimientoEl` y `parentesco`).

## Contexto
La ficha de la persona tenía documento, teléfono, banco y la identidad del padrón, pero no tenía:
- qué es la persona para el negocio,
- a qué número se le paga por Yape,
- a quién llamar si no contesta,
- su fecha de nacimiento,
- dónde guardar la foto de su DNI.

Esa foto andaba en el WhatsApp de quien atendió. Es un dato personal sensible (Ley 29733): no puede ir al bucket público `media`.

## Decisión
1. **Seis columnas nullable**, sin default, sin índice y **sin enum de Postgres**: `tipoRelacion`, `yape`, `referenciaNombre`, `referenciaTelefono` (TEXT), `fechaNacimiento` (DATE) y `fotoDocumentoKey` (TEXT). Un valor nuevo de enum rompe al Prisma viejo de producción. Por eso la lista de relaciones vive en TS: `TIPOS_RELACION` en `lib/adelantos/persona-campos.ts` (trabajador, proveedor, chofer, cliente, familia, otro).
2. **Validación en un solo lugar.** `CAMPOS_PERSONA` (Zod) se esparce en el POST y en el PATCH de `/api/adelantos/beneficiarios`:
   - Yape/Plin y el celular de la referencia: 9 dígitos que empiezan con 9; los espacios y guiones se sacan.
   - Nacimiento: «AAAA-MM-DD» que exista en el calendario, entre 1900 y hoy (día de Lima).
   - `""` se guarda como `null` y borra lo guardado. Una clave ausente no toca nada, así RRHH y el asistente no pisan lo que no conocen.
3. **El GET nunca devuelve la clave.** El lector único (`mapBeneficiario`) publica `tieneFotoDocumento: boolean`. Se agrega `GET /api/adelantos/beneficiarios/[id]` (la ficha de una persona; otro negocio → 404).
4. **La foto del DNI**: `POST | GET | DELETE /api/adelantos/beneficiarios/[id]/foto-documento`, con permiso de adelantos (write/read/write) y el tenant del JWT en el WHERE (otro negocio → 404).
   - Entra JPG/PNG/WebP/HEIC de hasta 8 MB en el campo `archivo`.
   - sharp decide qué es por el contenido. La rehace en WebP sin metadatos (sin GPS), la gira según su orientación y la achica a 1600 px.
   - Se guarda en el bucket **privado** `forestal-privado`, el de ADR-491 (`public: false`, solo WebP), en `<tenantId>/adelantos-personas/<id>/<ms>-dni-<azar>.webp`. Es otra carpeta que `<tenantId>/adelantos/`, así el borrado de las hojas de un adelanto no la ve.
   - La columna se escribe con **compara-y-cambia** (`updateMany … where fotoDocumentoKey = la leída`). Si dos subidas llegan a la vez, la perdedora borra su archivo y recibe 409. Al reemplazar, la foto vieja se borra.
   - El GET sirve el binario con `private, no-store`, CORP `same-origin` y `nosniff`. Solo sirve una ruta con la forma exacta de la carpeta de ESA persona. Nunca hay URL pública ni firmada.
   - Todo queda en el historial: subir, reemplazar y borrar, y la vista una vez por hora por cada persona que mira.

## Alternativas descartadas
- **Bucket público `media` vía `/api/upload`:** el DNI quedaba a la vista de cualquiera con la URL. Es el mismo problema que ADR-491 cerró para los vouchers.
- **URL firmada de 10 min (como las fotos de la carga):** la URL sale del servidor y queda en el historial del navegador. Servir el binario por la ruta permite auditar cada vista y no deja nada afuera.
- **Enum de Postgres para la relación:** rompería al Prisma viejo en cuanto una fila use un valor nuevo.
- **Guardar el HEIC tal cual:** Chrome no lo muestra y conserva el GPS de la foto.

## Consecuencias
- **HEIC del iPhone:** el sharp de npm lee HEIF solo en AV1 (AVIF). El HEIC en HEVC responde 422 `heic_no_soportado` con un mensaje claro. Para que sí entre, la pantalla debe convertirlo o comprimirlo a JPG antes de subir. Con `accept="image/jpeg,image/png,image/webp"`, Safari del iPhone ya lo transcodifica solo.
- **Tope de Vercel:** en producción el cuerpo de una función no pasa de 4,5 MB, así que una foto de 8 MB cae antes de llegar a la ruta. La pantalla debe achicar la foto en el navegador, como ya hace con la huella (≤1600 px). Con eso el archivo pesa unos cientos de KB.
- El MCP `buleje` y el CSV de exportación no muestran los campos nuevos hasta que alguien los agregue (son listas blancas).
- Ley 29733, supresión: borrar la persona (`DELETE …/beneficiarios/[id]`) también borra su foto del bucket. La baja lógica (`activo: false`) la conserva, igual que el resto de la ficha.

**30-10 (decisión de Brandon):** ver la imagen pide además permiso de **editar** adelantos: el rol `analista` (solo lectura) ve la ficha y `tieneFotoDocumento`, pero el GET de la foto le da 403.
