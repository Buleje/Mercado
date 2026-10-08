# ADR-479 — Cámaras: personas distintas del día por la ropa y el chaleco, sin biometría

- **Estado:** aceptado (2026-10-08). Construido: firma en el servidor, agrupador del día, `GET /api/admin/camaras/personas/resumen`, «Visitantes del día» y la pastilla «Hoy: N personas · aprox.». Tests: `__tests__/camaras-apariencia.test.ts`, `camaras-visitantes.test.ts`, `camaras-ruta-persona-cajas.test.ts`.
- **Relacionados:** contrato K3 (c) `.claude/autonomo/contratos-2026-10-08/camaras-trozas-personas.md` · ADR-456 §3-4 (chalecos, la cámara propone y la persona confirma) · ADR-475 (detector D-FINE) · ADR-480 (marcadores, fase 5: el número del chaleco leído como marcador 200-249).
- **Pedido (Brandon, doc del 08-10):** «Hoy: 6 personas, 4 con chaleco» · «Visitante A: 9 fotos, 08:12-08:40, Portón y Patio». Decidido con él: chaleco + apariencia, **sin cara**.

## Contexto

- El detector guarda una foto cuando aparece alguien y una por minuto mientras siga: contar fotos no es contar personas. Hasta hoy las fotos no guardaban **dónde** estaba cada persona.
- Blas, 08-10 (sólo lectura): 69 fotos (856×480 y 1280×736), 129 apariciones (1→33 fotos, 2→21, 3→8, 4→5, 5→2). 0 chalecos cargados, nadie con chaleco fluorescente en las fotos.
- Una persona del patio mide de 33 a 275 px de alto en la foto guardada; en SD de lejos, 10-25 px.

## Decisión

1. **El cliente manda las cajas, el servidor calcula la firma.** `POST /api/admin/camaras/[id]/persona` acepta `cajas` (JSON de `cajaPersonaSchema[]`, fracciones 0-1, **≤10 y no más que las `personas` declaradas**; el cliente manda las 10 más seguras). Sin el campo = cliente viejo (se acepta); JSON roto o cajas de más → 400; foto más alta que ancha → 400 `foto_vertical` antes de decodificarla (el detector manda 16:9). `firmarCajas` decodifica la foto **una vez** a píxeles crudos y muestrea **sólo el cuerpo** de cada caja (del 18 % para abajo, sin la banda del rótulo) a ≤64×128, por vecino más cercano (promediar inventaría tonos: franja fluorescente + tela oscura ≠ chaleco). La franja de la cabeza no se copia, no se lee y no se guarda.
2. **Firma = histograma de la ropa**, 24 hex: 8 tonos + 4 grises, del torso (18-55 %) y de las piernas (55-100 %), 4 bits por casillero, en la **mitad central** del ancho (los costados son fondo y el trazo de la caja dibujada). El tono no cambia con la luz; el gris se mide relativo a lo más claro de la persona, con piso 0,7 (ropa clara al sol = relativo; ropa oscura o a la sombra ≈ absoluto). Reparto suave entre casilleros vecinos.
3. **Chaleco** = ≥25 % del torso en amarillo-verde (48-90°) o naranja (8-34°) fluorescente. El ámbar de 35-47° queda afuera: es el color con que se dibujan las cajas sobre la foto.
4. **Cajas de menos de 40 px de alto: sin firma** («sin agrupar», se cuentan aparte). Adivinar con 10-25 px sería inventar.
5. **Se guarda dentro de la foto** (`ocrMetadata.cajas[i] = {x, y, ancho, alto, confianza, firma, chaleco}`): vive y muere con ella (misma retención, misma papelera, mismos roles de la carpeta «Personas»). Nada más se guarda.
6. **Agrupar al leer** (`agruparPersonasDelDia`, puro y determinista): orden por hora; cada caja va al grupo más parecido si el **promedio** de distancias a sus últimas 5 cajas es ≤ 0,30; nunca a un grupo que ya tiene una caja de la misma foto; con chaleco → «Personal 1, 2…», sin chaleco → «Visitante A, B…» (no se cruzan); un marcador de chaleco (fase 5, 200-244) manda sobre la ropa **sólo si ese chaleco está registrado** en el negocio: el número lo manda el cliente; hoy no hay registro de chalecos (el de marcadores asigna 0-199 a trozas), así que se descarta al guardar y al agrupar. «Visitante A» vale sólo para ese día; la UI elige un grupo por su `clave` (primera foto y caja), que no se corre al actualizar. Las cifras van con «aprox.».
7. **Altura: fuera.** En una cámara de patio la altura en px depende de la distancia y es un dato del cuerpo.

## Calibración con las fotos reales de Blas (sólo lectura, 08-10)

Sin cajas guardadas, se ubicaron las cajas que `componerFoto` dibuja en ámbar sobre cada foto: 28 cajas «limpias» (sin otra caja encima), 26 con ≥40 px. Etiquetadas a ojo (sólo el cuerpo): 4 personas con varias fotos (camisa blanca ×7, polo lila sentado ×7, polo azul oscuro ×3, ropa verde oscura ×2), 4 sueltas y 3 falsos del detector (camión, madera, lona).

| Variante | AUC (pares misma persona vs. distinta) |
|---|---|
| Gris relativo con piso 0,35 | 0,933 |
| Gris absoluto | 0,954 (pero una camisa blanca a la sombra cae a «gris») |
| **Gris relativo con piso 0,7** | **0,951** |

| Agrupador (piso 0,7) | Grupos | Precisión de pares | Cobertura de pares |
|---|---|---|---|
| Mínimo contra las últimas 3, U 0,30 | 10 | 0,52 (junta a dos personas) | 0,63 |
| **Promedio contra las últimas 5, U 0,30** | **11 (hay 11)** | **0,86** | **0,70** |
| Promedio de 5, U 0,25 | 15 | 0,84 | 0,35 |

Chaleco: 0 de 26 cajas reales con color fluorescente (máximo 0 %): no hay falsos positivos con madera, arena ni el camión rojo. **No se pudo medir el acierto con chaleco** (nadie lo usa en las fotos): lo confirma la primera foto con chaleco.

## Ley 29733

- La imagen es dato personal (no sensible) mientras no haya biometría. La firma son colores contados de la ropa: no identifica sola a nadie, no se cruza con nombres y no sale del día.
- Falta, y no es código (lo hace Blas): cartel de zona videovigilada, inscribir el banco de datos de videovigilancia, avisar a los trabajadores.
- **Retención:** sigue el tope de 365 días (`DIAS_RETENCION_PERSONAS_MAX`). La Directiva 01-2020-JUS/DGTAIPD apunta a 30-60 días: **se propone bajar el tope a 60** (decide Brandon). El defecto ya es 30.

## Consecuencias

- Sin schema ni migración: Json que ya existe. Las 69 fotos de antes quedan «sin conteo» y la pantalla lo dice.
- Al guardar: una decodificación + ≤10 muestreos de 64×128. Revisión de seguridad 08-10: antes se decodificaba por caja y 1280×16 383 con 50 cajas costaba 45,9 s de CPU y 328 MB; ahora esa foto se rechaza con sólo leer la cabecera (1 ms) y, aun sin los topes de la ruta, `firmarCajas` la resuelve en 0,46 s; el peor caso admitido (40 MP apaisada → 1280×960, 10 cajas de foto entera) firma en 34 ms. La lectura agrupa ≤2.000 fotos en memoria.
- Alguien del personal con el chaleco tapado (casaca encima, de espaldas) cuenta como visitante: la ayuda (ⓘ) lo dice.
- Errores esperables (siempre «aprox.»): polos iguales juntan a dos personas; quien se saca la casaca se parte en dos; una persona sentada y tapada cambia de firma. Unir/separar a mano queda para una v2.

## Alternativas descartadas

- Reconocimiento facial, re-identificación con redes o embeddings: codifican rasgos físicos (biometría, ADR-456 §3; pide consentimiento escrito).
- Calcular la firma en el navegador: sería un dato que viene de afuera; el servidor ya tiene la foto.
- Tabla nueva de visitantes: «Visitante A» no tiene que durar más que el día; guardarlo sería crear un perfil.
