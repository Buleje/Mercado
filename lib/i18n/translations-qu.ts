/**
 * translations-qu.ts — Overlay de Runa Simi (Quechua sureño chanka).
 *
 * Variedad chanka (Ayacucho/Apurímac/Huancavelica): es la más neutral
 * y comprensible para hablantes de Cusco-Collao y central. Estas
 * traducciones cubren las keys más visibles del navbar, carrito,
 * producto y checkout. Las keys sin entrada caen a español
 * automáticamente (ver `translate()` en translations.ts).
 *
 * Convención ortográfica: alfabeto trivocálico de la Academia Mayor
 * de la Lengua Quechua (a, i, u). Sin tildes en quechua.
 *
 * Para sumar más traducciones, agregá la key con la frase quechua —
 * el sistema la usa automáticamente.
 */

export const QU_OVERRIDES: Record<string, string> = {
  // ── Navegación ──────────────────────────────────────────────────
  "nav.home": "Wasi",
  "nav.stores": "Qhatu",
  "nav.shopDirectory": "Qhatukuna",
  "nav.explore": "Maskay",
  "nav.discover": "Tariy",
  "nav.recipes": "Mikhuy ruway",
  "nav.about": "Ñuqayku",
  "nav.account": "Cuentay",
  "nav.cart": "Apaq",
  "nav.orders": "Mañakusqaykuna",
  "nav.favorites": "Munasqaykuna",
  "nav.openStore": "Qhatuykita kichay",
  "nav.login": "Yaykuy",
  "nav.logout": "Lluqsiy",
  "nav.search": "Maskay",
  "nav.searchPlaceholder": "Maskay rantinata, qhatukunata Pucallpapi...",
  "nav.darkMode": "Tutayaq",
  "nav.lightMode": "K'anchay",
  "nav.live": "Kunan",
  "nav.offers": "Pisi qullqi",
  "nav.howToPay": "Imaynam paganki",
  "nav.new": "Musuq",
  "nav.notifications": "Willakuykuna",

  // ── Carrito ─────────────────────────────────────────────────────
  "cart.add": "Apaqman churay",
  "cart.added": "Churasqa",
  "cart.empty": "Apaqniyki ch'usaqmi",
  "cart.total": "Tukuy",
  "cart.checkout": "Rantiyta tukuchay",
  "cart.quantity": "Hayk'a",
  "cart.remove": "Hurquy",
  "cart.viewCart": "Apaq qaway",

  // ── Producto ────────────────────────────────────────────────────
  "product.outOfStock": "Tukukapun",
  "product.buyNow": "Kunan rantiy",
  "product.buyOneClick": "Hukllapi rantiy",
  "product.wishlist": "Munasqaman churay",
  "product.inWishlist": "Munasqapi",
  "product.share": "T'aqay",

  // ── Checkout / Pago ─────────────────────────────────────────────
  "checkout.payment": "Pagay",
  "checkout.delivery": "Apachiy",
  "checkout.address": "Wasi qillqa",
  "checkout.confirm": "Sut'inchay",
  "checkout.pay": "Pagay",
  "checkout.success": "Allinmi rurakurqa",
  "checkout.failed": "Pantasqam karqa",

  // ── Estados / Acciones ─────────────────────────────────────────
  "common.loading": "Suyariy...",
  "common.error": "Pantasqa",
  "common.retry": "Yapamanta ruway",
  "common.cancel": "Sayachiy",
  "common.save": "Waqaychay",
  "common.continue": "Qatipay",
  "common.back": "Kutiy",
  "common.close": "Wichq'ay",
  "common.yes": "Arí",
  "common.no": "Manam",

  // ── Landing Header ─────────────────────────────────────────────
  "landing.nav.howItWorks": "Imaynam ruwakun",
  "landing.nav.plans": "Plankuna",
  "landing.nav.faq": "Tapuykuna",
  "landing.nav.openStore": "Qhatuykita kichay",
  "landing.nav.signin": "Yaykuy",
  "landing.nav.startStore": "Qhatuyta qallariy",

  // ── Landing Hero ────────────────────────────────────────────────
  "landing.hero.kicker": "Tukuy huk plataformapi",
  "landing.hero.title1": "Astawan rantiqkuna.",
  "landing.hero.title2": "Astawan mañakuykuna.",
  "landing.hero.titleAccent": "Mana sasa.",
  "landing.hero.description":
    "Catalogu, Yape paguy, apachiy, willaykuna — pichqa minutullapi listo. Qam rantichiyllapi sayariy.",
  "landing.hero.ctaPrimary": "Ñawpaq killata mana paguspa",
  "landing.hero.ctaSecondary": "Demo qaway",

  // ── Landing — Stats Marquee ─────────────────────────────────────
  "landing.stats.kicker": "Buleje yupayllapi",
  "landing.stats.headline1": "Huk marketplace,",
  "landing.stats.headline2": "waranqa kawsaykuna.",
  "landing.stats.description":
    "Sapa qhatu huk ayllum, sapa mañakuy huk thaski ñawpaqman. Pucallpapi, Constituciónpipas tukuy hina kuska wiñachisqayku yupaykunam kaykuna.",
  "landing.stats.activeStores": "Kawsaq qhatukuna",
  "landing.stats.products": "Rantinakuna",
  "landing.stats.rating": "Anchaywa qispichisqa",
  "landing.stats.coverage": "Llaqta tupanay",

  // ── Landing — Categorías populares ──────────────────────────────
  "landing.categories.kicker": "Anchaywa rantisqa",
  "landing.categories.title": "Mañakuy",
  "landing.categories.titleAccent": "imatapas munanki.",
  "landing.categories.description":
    "Tukuy qhatukunamanta rantinakuna, utqay tariykunaykipaq churasqakuna.",

  // ── Landing — Final CTA ──────────────────────────────────────────
  "landing.finalCta.kicker": "Kunan qallariy",
  "landing.finalCta.title1": "Qhatuyki munanmi",
  "landing.finalCta.titleAccent": "aswan hatun.",
  "landing.finalCta.description":
    "Qhatuykita pichqa minutullapi kichay, kunan punchawmanta mañakuykunata chaskiy. Mana tarjeta, mana compromiso.",
  "landing.finalCta.tryFree": "90 punchaw mana paguspa",
  "landing.finalCta.openStore": "Qhatuykita kichay",

  // ── Landing — Métodos de pago ────────────────────────────────────
  "landing.payment.kicker": "Paguy ñankuna",
  "landing.payment.title": "Imaynatam paguyta munanki,",
  "landing.payment.titleAccent": "chayhinata pagay.",
  "landing.payment.description":
    "Tawa ñankunam paguypaq, mana sasa. Checkout-pi akllay — mana pakaykusqa cobrokuna.",
  "landing.payment.yapeDesc": "Utqay apachiy",
  "landing.payment.plinDesc": "Bancoyki app-manta",
  "landing.payment.cash": "Qullqi",
  "landing.payment.cashDesc": "Apachiypaqkama",
  "landing.payment.cardDesc": "Débito hinaspa crédito",

  // ── Cómo funciona section ────────────────────────────────────────
  "landing.how.kicker": "Imaynam ruwakun",
  "landing.how.title": "Tawa thaski.",
  "landing.how.titleAccent": "Mana sasa.",
  "landing.how.description":
    "Negocioyki online kichaymanta, ñawpaq mañakuyta chaskinaykama — sapan tutamanta.",
  "landing.how.step": "Thaski",
  "landing.how.step1.title": "Negocioykita kichay",
  "landing.how.step1.desc": "Logo, catalogu, horakuna. Pichqa minutullapi listo.",
  "landing.how.step2.title": "Rantiqkunata aysay",
  "landing.how.step2.desc": "Maskaqkuna, mapa, app-pipas mana publicidaduta paguspa rikhurinki.",
  "landing.how.step2.tag": "Wiñay",
  "landing.how.step3.title": "Utqay paguy chaskiy",
  "landing.how.step3.desc": "Yape, Plin, tarjeta, qullqi. Mana pagana 90 punchaw.",
  "landing.how.step3.tag": "Paguy",
  "landing.how.step4.title": "Apachiy mana llakikuyniyuq",
  "landing.how.step4.desc": "Apaqniykikunawan, ñuqaykukunawan utaq iskaynin. Kawsaq qatipay.",
  "landing.how.stat1.label": "Setup tiempo",
  "landing.how.stat2.label": "Mana paguy 90 punchaw",
  "landing.how.stat3.label": "WhatsApp yanapay",
  "landing.how.cta": "Ñawpaq killata mana paguspa",

  // ── Promo Banners ────────────────────────────────────────────────
  "landing.promo.business.kicker": "Dueñokunapaq",
  "landing.promo.business.title1": "Mana paguspa rantichiy",
  "landing.promo.business.titleAccent": "ñawpaq 90 punchawkuna.",
  "landing.promo.business.desc":
    "Bodegayki online pichqa minutullapi. Yape, qullqi, kikiykipa apachiyniyki. Mana sapa killa paguy.",
  "landing.promo.business.statLabel": "mana paguy 90 punchaw",
  "landing.promo.business.cta": "Qhatuyta mana paguspa kichay",
  "landing.promo.business.cta2": "Plankunata qaway",
  "landing.promo.driver.kicker": "Apaqkunapaq",
  "landing.promo.driver.title1": "Motoyki, horayki,",
  "landing.promo.driver.titleAccent": "yapaq qullqiyki.",
  "landing.promo.driver.desc":
    "Qayllaykipi mañakuykuna chaskiy. Sapa apachiy + propina. Mana patrón, mana suyay.",
  "landing.promo.driver.statLabel": "tarifa base sapa apachiyman",
  "landing.promo.driver.cta": "Apaq kayta munani",

  // ── Planes ────────────────────────────────────────────────────────
  "landing.plans.kicker": "Plankuna",
  "landing.plans.title": "Huk killata probay,",
  "landing.plans.titleAccent": "munaqtiykilla pagay.",
  "landing.plans.description":
    "Ima horatapas plankita tikray. Mana contrato, mana qhipakuy, mana facturapi sorpresakuna.",
  "landing.plans.compare": "Tukuy comparativata qaway",

  // ── FAQ ──────────────────────────────────────────────────────────
  "landing.faq.kicker": "Achka tapuykuna",
  "landing.faq.title": "Imatachá",
  "landing.faq.titleAccent": "tapuwanku.",

  // ── Nosotros ─────────────────────────────────────────────────────
  "landing.about.kicker": "Ñuqayku",
  "landing.about.title": "Pucallpamanta",
  "landing.about.titleAccent": "ruwasqa.",

  // ── Footer ───────────────────────────────────────────────────────
  "footer.tagline": "Perú llaqtapi qhatukunaq marketplace",
  "footer.product": "Rantina",
  "footer.company": "Compañía",
  "footer.help": "Yanapay",
  "footer.legal": "Legal",
  "footer.terms": "Kamachikuykuna",
  "footer.privacy": "Pakay",
};
