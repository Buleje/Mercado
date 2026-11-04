"""Guion de la demo, página 4: «Minuto extra · Quién le debe, cada tarde» (03-11).
Uso: python3 armar_guion_p4.py <guion de 3 págs> <salida.pdf>"""
import fitz, sys
src, out = sys.argv[1:3]
d = fitz.open(src); assert d.page_count == 3, d.page_count
p = d.new_page(width=595.2756, height=841.8898)
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255)
y = [38]
def tb(t, font="helv", size=10, color=(0, 0, 0), alto=40, gap=8):
    R = fitz.Rect(40, y[0], 553, y[0] + alto)
    rc = p.insert_textbox(R, t, fontname=font, fontsize=size, color=color, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)
    y[0] += alto - rc + gap
tb("Minuto extra (1 minuto) · Quién le debe, cada tarde", "hebo", 13, VERDE, 24)
tb("Qué mostrar: el video «16 Quién te debe en el correo» (19 segundos, en la carpeta de capturas) o la página 6 del "
   "folleto. En el negocio de prueba se puede abrir Libro CTP > Opciones > Reportes diarios y señalar la casilla "
   "«Quién te debe», sin enviar. Nunca el parte de Blas: trae a sus deudores reales.", alto=64)
tb("Qué decir: «Cada tarde, a la hora que usted elija, le llega el parte por correo o WhatsApp con quién le debe: "
   "cada persona, lo que le adelantó y la madera que se llevó sin pagar, de mayor a menor. No tiene que abrir el "
   "sistema para acordarse de cobrar.»", alto=52)
tb("Si preguntan «¿sale de lo que yo anoto?»: «Sí, de la misma cuenta por persona de Adelantos. Lo que dice el "
   "correo es lo que dice el panel, y se corrige en un solo lugar.»", alto=40)
tb("Si preguntan «¿les manda mensaje a los que me deben?»: «No. El parte le llega solo a usted o a quien usted "
   "ponga; cobrar sigue siendo suyo.»", alto=40)
tb("Para cerrar: «En la prueba sin costo le activamos el parte con sus propias cuentas.»", "hebo", alto=28)
R = fitz.Rect(51, 805, 544, 817)
p.insert_textbox(R + (0, 0, 0, 6), "Buleje · guion de demo para aserraderos · uso interno", fontname="helv", fontsize=8, color=GRIS)
p.insert_textbox(fitz.Rect(480, 805, 544, 823), "Página 4", fontname="helv", fontsize=8, color=GRIS, align=2)
d.save(out, garbage=3, deflate=True); print("ok", round(y[0]), d.page_count)
