# ADR-496 — Trozas por foto: escala con hoja ArUco, medición en el navegador y correlativo que sigue por permiso

- **Estado:** aceptado (2026-10-16). Fase 1 construida; F2-F4 pendientes.
- **Pedido por:** Brandon (16-10): «tomar foto a los laterales del camión o a la cara de los troncos, sacar de cada tronco su diámetro, asignar código según el correlativo que siga, hacer la tabla y pasarla a la realización de la GTF».
- **Contrato y medición:** `.claude/autonomo/contratos-2026-10-16/fotos-trozas.md`.
- **Schema:** ninguno.

## Contexto

Hoy la Lista de trozas se anota troza por troza, a mano, y después se pasa a la guía. La hoja real N° 000006 (GTF 19-000003) tiene un error de copia: la fila 132 dice 0,593 m³, pero sus medidas dan 0,511. Con 0,511, la columna suma el total escrito (9,916). Ese error no puede pasar si el sistema calcula la tabla.

En la base no hay fotos reales de testas, ni en Blas ni en main. Banco sintético:

| Prueba | Resultado |
|---|---|
| Error medio por troza | 0,02 cm |
| Escenas | 7 con 87 trozas: detectó 86 y ninguna falsa |
| Tiempo por foto | menos de 1 s |

Es una cota superior. Falta probar con fotos del monte.

## Decisión

1. **Escala**: 2 hojas A4 con marcador ArUco `DICT_4X4_250` de 180 mm, pegadas sobre testas de la carga. Ids **248-249** reservados como «escala». Viven en el rango de hojas de prueba 245-249 de `lib/camaras/marcadores.ts`: una cámara de patio no los lee como troza ni como chaleco.
2. **Medición en el navegador**:
   - OpenCV.js 5.0 (`@techstark/opencv-js`, Apache-2.0), en un worker que se carga sólo al elegir «Medir por foto».
   - Busca círculos, ajusta la elipse al borde de cada testa y saca el diámetro en cm con la escala.
   - No usa modelos AGPL (Ultralytics) ni de licencia no comercial (TimberVision).
3. **La foto propone, la persona confirma**:
   - Cada troza sale con un círculo numerado; se toca para corregirla, agregarla o quitarla.
   - «Pasar a la guía» deja las filas en «Anotar a mano», marcadas «Foto» y «D2 = D1» cuando falta la otra punta.
   - El volumen es Smalian SERFOR (ADR-492). Nada se registra sin «Registrar despacho».
   - La observación de cada troza dice «medido por foto, confirmado por <usuario>».
4. **Correlativo**: el GET del despacho devuelve el N° que sigue por permiso (`siguientesCorrelativos`), que es el último código de la guía entre las trozas vivas + 1. El POST acepta `desde`, que es opcional: sin él la numeración arranca en 1 como antes. El código único de ADR-474 no cambia.
5. **Fotos**: al registrar, la foto va a los papeles de la guía.

## Consecuencias

- D1 y D2 son las dos puntas (ADR-492). Una foto da una punta y D2 se escribe a mano o queda igual a D1 («troza pareja», marcado).
- Pendiente, F2: emparejar la cara de adelante para tener D2 por foto.
- Pendiente, F3: llevar la carga medida del monte a la oficina sin perder fotos. Hoy, si no se registra, la foto se pierde.
- Pendiente, F4: segmentar al tocar (SAM/EfficientSAM, Apache-2.0) y medir el largo por foto lateral con una vara de 1 m.
- Riesgos medidos en el contrato:
  - **Testas escalonadas:** −2 % de diámetro por cada 6 cm de profundidad a 3 m.
  - **Corteza:** no está definido si se mide con o sin ella.
  - **Monte sin señal:** OpenCV pesa 3,75 MB comprimido y tiene que quedar en caché antes de salir.

## Alternativas descartadas

- **TimberVision** (CC BY-NC-SA) y **YOLOv8** (AGPL): licencias no aptas para un SaaS comercial.
- **IA de visión del servidor para medir**: no mide milímetros. Queda para contar o proponer (F5).
- **Una sola hoja de escala**: sesgo de hasta 1 cm.
- **Columna nueva en `ForestLothEntry` para marcar «por foto»**: alcanza con la observación.
