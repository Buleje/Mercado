"""Guion de la demo, página 5: «Minuto extra · El archivo de cada cliente» (04-11).
Uso: python3 armar_guion_p5.py <guion de 4 págs> <salida.pdf>"""
import fitz, sys
src, out = sys.argv[1:3]
d = fitz.open(src); assert d.page_count == 4, d.page_count
p = d.new_page(width=595.2756, height=841.8898)
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255)
y = [38]
def tb(t, font="helv", size=10, color=(0, 0, 0), alto=40, gap=8):
    R = fitz.Rect(40, y[0], 553, y[0] + alto)
    rc = p.insert_textbox(R, t, fontname=font, fontsize=size, color=color, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)
    y[0] += alto - rc + gap
tb("Minuto extra (1 minuto) · El archivo de cada cliente, con la versión que vale", "hebo", 13, VERDE, 24)
tb("Qué mostrar: la página 7 del folleto o las capturas «17 Archivo por cliente - Oficial» y «18 Archivo por cliente - Archivado». "
   "Nunca el Archivo de Blas: trae los papeles reales de sus clientes y comunidades.", alto=40)
tb("Qué decir: «Cada cliente tiene su carpeta. Cada papel dice si es el Oficial, el que vale y se manda, o si "
   "todavía está en revisión. Cuando corrige un estado de cuenta, el viejo no se bota: pasa atrás, a Archivado. "
   "Es como el archivador del cliente: adelante la hoja que vale, atrás el sobre con lo viejo.»", alto=64)
tb("Ejemplo para contar: «Al estado de cuenta le faltaba el flete de S/ 300.00. Se corrigió: a la vista queda el de "
   "S/ 3,989.32 y el de S/ 3,689.32 sigue guardado por si alguien reclama.»", alto=40)
tb("Si preguntan «¿y si quiero ver el viejo?»: «Un toque en Archivado, o lo busca por su nombre: sale igual.»", alto=28)
tb("Si preguntan «¿lo puedo mandar desde ahí?»: «Sí, se descarga el PDF y se manda por WhatsApp o correo como "
   "siempre. Lo importante es que el que manda es el Oficial.»", alto=40)
tb("No prometer: que se ordena solo desde la carpeta de su computadora (todavía no está prendido para clientes).", alto=28)
tb("Para cerrar: «En la prueba sin costo le armamos la carpeta de uno de sus clientes con sus papeles reales.»", "hebo", alto=28)
R = fitz.Rect(51, 805, 544, 817)
p.insert_textbox(R + (0, 0, 0, 6), "Buleje · guion de demo para aserraderos · uso interno", fontname="helv", fontsize=8, color=GRIS)
p.insert_textbox(fitz.Rect(480, 805, 544, 823), "Página 5", fontname="helv", fontsize=8, color=GRIS, align=2)
d.save(out, garbage=3, deflate=True); print("ok", round(y[0]), d.page_count)
