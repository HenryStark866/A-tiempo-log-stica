# África — región para la internacionalización de YAM

Responsable de región: África. Fecha del análisis: **21 de octubre de 2026**.
Estado: **borrador de trabajo, no ejecutado**. Nada de lo que hay aquí está publicado,
contratado ni enviado.

## Qué es YAM hoy, para no inventar

YAM es la plataforma de A Tiempo Logística (ATL), mensajería de última milla de Medellín.
Opera en el Valle de Aburrá y el Oriente antioqueño: recoge en el comercio, pasa por CEDI,
entrega al destinatario y **recauda el pago contraentrega**. Tiene vitrina pública de
comercios. Dominio `atiempologistica.com`, app en `yam.cdhmaker.com`.

**Lo que YAM no tiene** (y por tanto no se puede prometer en ningún texto):
transporte transfronterizo, agenciamiento aduanero, pagos internacionales, figura legal
fuera de Colombia, soporte en zona horaria africana, ni personal que hable árabe, suajili
o amárico. Tampoco tiene multimoneda ni multiidioma en la app.

Esto no es una advertencia decorativa: condiciona el 100 % de lo que sigue. Un texto que
diga «llevamos tu producto a América Latina» es falso hoy. Lo máximo defendible es
«estamos armando la ruta y queremos tu comercio en la primera tanda».

---

## 0. La recomendación, primero

**Recomiendo licenciar/replicar el modelo de YAM (franquicia de software), no captar comercios
africanos para que exporten a Colombia.** Y recomiendo arrancar con **un solo piloto**, no con
cinco países.

Razones, en orden de peso:

1. **El flujo comercial África → Colombia es minúsculo y, además, competidor.** Las
   exportaciones colombianas a África fueron **1,27 % de las ventas externas de 2025**, con
   una participación promedio del 0,5 % en 30 años
   ([La República](https://www.larepublica.co/economia/exportaciones-a-africa-representaron-solamente-1-3-de-las-ventas-externas-de-2025-4349558)).
   Ese dato es de exportaciones colombianas; el flujo inverso (África vendiendo a Colombia)
   es aún más delgado y no encontré una serie publicada que lo mida. Peor: los productos
   estrella del pequeño exportador africano —**café, cacao**— son justamente lo que Colombia
   produce y exporta. UNCTAD, al estudiar a dónde debería vender el café etíope, eligió UE,
   Arabia Saudita, Sudáfrica, China y Corea del Sur; **América Latina no aparece**, y usa a
   Colombia como *modelo a imitar*, no como mercado
   ([UNCTAD](https://unctad.org/publication/analysis-key-export-markets-ethiopian-coffee-roasters-and-exporters-roasted-coffee)).
   Vender «llegue a Colombia» a un cooperativista etíope es vender la entrada al país de su
   competencia directa.

2. **El modelo operativo de YAM sí calza con el problema africano, y calza bien.** Los
   informes de última milla africana nombran exactamente los tres dolores que YAM ya resolvió
   en Medellín: direcciones informales, manejo de efectivo contraentrega con riesgo de
   cuadre, y reentregas por destinatario ausente o GPS errado
   ([allbusiness.africa](https://allbusiness.africa/insights/african-last-mile-delivery-ecommerce)).
   YAM tiene CEDI, conciliación de recaudo, zonas y tarifas, código de entrega por WhatsApp
   y seguimiento público. Eso es producto, no promesa.

3. **El software se exporta sin aduana, sin transporte y sin figura legal en destino.** Un
   contrato de licencia con un operador local no requiere que ATL constituya sociedad en
   Lagos. Un servicio de mensajería transfronteriza sí. Para una empresa del tamaño de ATL,
   la diferencia es entre «posible este trimestre» y «proyecto de tres años con abogados».

4. **Hay hueco de mercado medible.** En 2024 solo **tres** startups logísticas africanas
   levantaron capital (Renda, Fez Delivery, Cargo Plus), por **USD 2,1 millones** combinados,
   tras el desplome de la generación anterior
   ([allbusiness.africa](https://allbusiness.africa/insights/african-road-freight-trucking-2026)).
   Nadie va a construir software nuevo con ese dinero: lo van a alquilar. Y los operadores
   informales siguen siendo **~25 % de los ingresos del sector de última milla nigeriano en
   2025** ([Ken Research](https://www.kenresearch.com/nigeria-last-mile-delivery-market.md)) —
   ese es el cliente del software, no de la competencia.

**El ángulo de captación no se descarta del todo, pero baja de rango.** Tiene un nicho real
y pequeño: artesanía, textil y cosmética de karité con destino a importadores colombianos de
nicho, canalizado por la vitrina pública de YAM. Eso se puede hacer con una lista de espera
honesta y presupuesto casi cero. Lo que no se puede es montarle una campaña de pago encima.

**Riesgo de la recomendación:** licenciar software a un operador en otro continente exige
soporte en inglés/francés en huso horario +5 a +7 h respecto de Medellín, documentación que
hoy no existe (todo el repo y la UI están en español), y multiidioma + multimoneda en la app.
Ese es trabajo de producto, no de marketing. Si ATL no está dispuesta a eso, la respuesta
honesta no es «captemos comercios», es **«África no todavía»**.

---

## 1. Países prioritarios

Cinco, en este orden. Cada uno trae el papel que juega: **L** = candidato a licenciar el
modelo, **C** = candidato a captación de comercios.

### 1.1 Nigeria — prioridad 1 (L)

- Mercado de última milla de escala real: **~400 millones de envíos estimados en 2025**, con
  operadores informales en torno al 25 % de los ingresos
  ([Ken Research](https://www.kenresearch.com/nigeria-last-mile-delivery-market.md)).
- Ecosistema vivo y con hueco de software: GIG Logistics declara **+170 centros en los 36
  estados y 6 hubs** ([GIG](https://giglogistics.com/)); Kwik vende API de despacho;
  Dellyman cerró acuerdo de entregas con **Temu en diciembre de 2025** tras un piloto de
  +1.300 entregas con 95 % de éxito
  ([TechEconomy](https://www.techeconomy.ng/dellyman-inks-last-mile-deliveries-with-temu)).
- El contraentrega **está cayendo, no desapareciendo**: dLocal reporta que la transferencia
  bancaria instantánea (NIBSS) ya mueve ~20 % de los pagos de e-commerce y que el COD bajó
  17 % en un año ([WeeTracker](https://weetracker.com/2025/07/08/africa-payments-trends-2025/)).
  Esto es un matiz importante y va en contra del guion fácil: en Nigeria el argumento no es
  «ustedes cobran en efectivo», es «ustedes cobran en efectivo **y** por transferencia **y**
  por billetera, y necesitan conciliar las tres». YAM ya tiene medio de pago por partes
  (ver `docs/medio-de-pago-por-partes.md`), que es precisamente eso.
- Datos móviles baratos: **~USD 0,31–0,39/GB**, entre los más bajos del continente, aun
  después del alza tarifaria de 2025
  ([Prime Business Africa](https://www.primebusiness.africa/zimbabwe-tops-list-of-africas-most-expensive-mobile-data-as-nigeria-ranks-among-cheapest/)).
  Permite video en el anuncio.
- Contra: hay licencia obligatoria para operar mensajería (**cuatro categorías, renovación
  anual**, Courier and Logistics Services Operations Regulations). Eso lo asume el licenciatario
  local, no ATL — y es justamente otro argumento para licenciar en vez de operar.

### 1.2 Kenia — prioridad 1 (L)

- **82,3 % de los adultos con acceso a dinero móvil** (CBK, 2024) y M-Pesa con ~90,8 % de
  cuota en el primer trimestre de 2025; **424.404 agentes registrados**
  ([Business Front](https://businessfront.com/finance/news/kenya-mobile-money-payments-drops/)).
  Un recaudo contraentrega que no integre M-Pesa en Kenia no sirve para nada.
- Señal de alerta que hay que decir: el volumen de transacciones de dinero móvil **cayó ~30 %
  en 2025** (309,3 a 217,6 millones) según el Bank Supervision Annual Report del CBK citado
  por [Kenya Times](https://thekenyatimes.com/banking/m-pesa-traffic-slows-as-mobile-money-transactions-drop-30/),
  y el propio CBK habla de crecimiento en meseta. **No verifiqué el informe original**; el
  30 % viene de un solo medio. Tomarlo como bandera amarilla, no como hecho.
- El CBK propone recortar comisiones de transferencia móvil (meta: de Sh23 medios en 2024 a
  Sh10 en 2028, Estrategia Nacional de Inclusión Financiera 2025-2028). Comisión más baja =
  más digital, menos efectivo. Otra razón para no apostar todo al efectivo.
- Cementerio instructivo: **Sendy** (logística) terminó cerrando tras pivotar. Útil como
  argumento comercial: «el software no te quiebra, la flota propia sí».

### 1.3 Egipto — prioridad 2 (L, y **C** por ser top-3 destino colombiano)

- Contraentrega todavía dominante: estimaciones entre **~51 % y ~65 %** de los pedidos
  ([eGrow](https://www.egrow.com/en/blog/egypt-ecommerce-statistics-trends-2026)).
  Son blogs de proveedor, no fuente primaria: **dato débil**, úsese como orden de magnitud.
- Es uno de los **tres mayores destinos de la exportación colombiana a África** junto con
  Costa de Marfil y Marruecos (Analdex, vía
  [Radio Nacional](https://radionacional.co/actualidad/conclusiones-foro-celac-africa-2026)).
  Es el único de la lista donde el ángulo de captación tiene un corredor comercial real que
  lo sostenga.
- Contra fuerte: el **marketing electrónico directo exige licencia/permiso específico** bajo
  el Decreto Ministerial 816 de 2025 (reglamento ejecutivo de la Ley 151/2020)
  ([Al Tamimi](https://www.tamimi.com/news/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law)).
  Eso **mata el mensaje en frío por correo y SMS** en Egipto mientras no haya licencia.
  Solo queda inbound, ferias y presencia orgánica.

### 1.4 Marruecos — prioridad 2 (C, con **L** secundario)

- **Mayor crecimiento de las exportaciones colombianas a África: +304,7 %** interanual
  (Analdex, vía [Radio Nacional](https://radionacional.co/actualidad/conclusiones-foro-celac-africa-2026)).
  Es la señal de corredor más fuerte que encontré.
- Mezcla de pago 2025 según el observatorio marroquí: **tarjeta 47 %, contraentrega 38 %,
  billetera 12 %, transferencia 3 %**
  ([wafir.ma](https://wafir.ma/fr/etudes/observatoire-ecommerce-maroc-2020-2026-bilan-6-ans-cmi-paiements)).
  Ojo: eGrow afirma 54-85 % de COD. **Las fuentes se contradicen abiertamente.** Me quedo con
  el observatorio local (metodología sobre pagos CMI) y marco el dato de eGrow como no fiable.
  Consecuencia práctica: **en Marruecos el gancho de «especialistas en contraentrega» pega
  menos** que en Egipto o Nigeria. Allí el argumento es cross-border y textil.
- Marco de datos manejable: Ley 09-08 y CNDP. La prospección por correo/SMS **no requiere
  consentimiento previo si los datos se recogieron directamente del destinatario**, pero el
  tratamiento **sí debe declararse a la CNDP antes de empezar**
  ([ficha CNDP](https://www.cndp.ma/wp-content/uploads/2025/07/fiche_CNDP_Prospection_RT_fr.pdf)).
  Es el país de la lista con el camino legal más practicable para captación activa.

### 1.5 Sudáfrica — prioridad 3 (L, como mercado de software; **no** para contraentrega)

- Mercado maduro: **~R159.000 millones en 2026, ~10 % del comercio minorista**, creciendo
  22,5 % (World Wide Worx / Mastercard,
  [Connecting Africa](https://www.connectingafrica.com/ecommerce/south-african-e-commerce-spend-to-top-9-9b-in-2026)).
  Takealot con 35,3 % de uso, primer año de utilidad operativa (EBIT R171 millones).
- Pero **el contraentrega no es el problema aquí**: es mercado de tarjeta. El argumento de
  YAM en Sudáfrica no es el recaudo, es el software de operación para couriers medianos. Y
  ahí ya hay oferta local (**ParcelOps**, portal white-label, desde ~ZAR 2.000, cobro por
  guías procesadas). Competencia directa y establecida.
- POPIA es el régimen de datos más severo de la lista para captación en frío (ver §5).

### Descartados, y por qué

| País / bloque | Por qué no |
| --- | --- |
| **Etiopía** | El café etíope no tiene mercado en Colombia: Colombia es productor. UNCTAD ni lo contempla como destino. Además amárico requiere escritura etíope propia, no hay nadie en ATL que la revise, y el riesgo de publicar un texto roto es alto. Datos móviles baratísimos (~USD 0,45/GB, [RAMP Q2 2025](https://researchictafrica.net/2025/07/24/ramp-index-insights-quarter-2-2025/)) pero eso no compensa la falta de caso comercial. |
| **Ghana, Costa de Marfil, Burkina Faso (cinturón del karité)** | Interesantes como *producto* (karité: exportaciones ghanesas **+USD 92 millones en 2022**, ~1 millón de mujeres implicadas, [Africa Renewal / OMC](https://africarenewal.un.org/en/magazine/shea-butter-nourishes-opportunities-african-women)) y Ghana firmó con Colombia un **memorando portuario en marzo de 2026** ([Cancillería](https://cancilleria.gov.co/sala-de-prensa/noticias/colombia-y-ghana-firman-memorando-para-impulsar-la-cooperacion-portuaria-y-abrir-nuevas-rutas-comerciales-entre-america-latina-y-africa)). Pero son mercados de materia prima con política activa de **prohibir la exportación de nuez cruda** para forzar procesamiento local (petición de la Ghana Shea Cooperatives and Processors Network, mayo 2025). Esa pelea es interna y no la resuelve una mensajería. Costa de Marfil fue top destino colombiano pero **sus compras cayeron** en 2025. Reservar para fase 2. |
| **Angola, Mozambique (portugués)** | Añaden un idioma entero por mercados pequeños y con fricción cambiaria severa. Coste/beneficio malo. |
| **Zimbabue, Sudán del Sur, RCA** | Datos móviles de **USD 43,75 / 23,70 / 10,90 por GB** ([Cable.co.uk vía Prime Business](https://www.primebusiness.africa/zimbabwe-tops-list-of-africas-most-expensive-mobile-data-as-nigeria-ranks-among-cheapest/)). Cualquier campaña digital es inviable. |
| **Argelia, Túnez** | Francófonos y con COD alto, pero sin corredor con Colombia y con control de cambios duro. No descartados para siempre; fuera del primer corte. |

---

## 2. Idiomas: cuál se usa de verdad para negociar

| País | Idioma del **negocio** | Idioma de la **calle / confianza** | Qué hacer |
| --- | --- | --- | --- |
| Nigeria | **Inglés** (oficial, contratos, LinkedIn) | Pidgin nigeriano, yoruba (SO), hausa (N), igbo (SE) | Campaña en inglés. El **pidgin** gana en redes y en mercados físicos; el yoruba y el hausa ganan en radio local y asociaciones de comerciantes. Yoruba y hausa **no** para contratos. |
| Kenia | **Inglés** | **Suajili** y sobre todo *sheng* en Nairobi | Titular en inglés, prueba social y WhatsApp en suajili. El suajili gana en cuanto el mensaje habla de dinero o de confianza. |
| Egipto | **Árabe** (el inglés solo en multinacionales) | Árabe egipcio coloquial | Árabe estándar moderno para lo formal; coloquial egipcio para redes. Inglés es error aquí. |
| Marruecos | **Francés** para negocio y administración | Dariya (árabe marroquí), amazigh | Francés para la campaña y el contrato; dariya solo para redes y solo si hay quien lo revise. |
| Sudáfrica | **Inglés** | zulú, xhosa, afrikáans | Inglés basta para B2B. |

**Cuándo el idioma local gana al colonial:** cuando el mensaje pide **confianza o dinero**.
El titular puede ir en inglés o francés; el testimonio, la respuesta de WhatsApp y el audio
de radio deben ir en el idioma local. Ese es el corte práctico.

### Árabe y escritura de derecha a izquierda — lo que implica de verdad

No es «poner el texto al revés». Implicaciones concretas, y todas caen sobre el repo:

1. **`dir="rtl"` y `lang="ar"` en el contenedor**, no solo CSS. Si solo se invierte con CSS,
   la puntuación y los números se colocan mal (el algoritmo bidi del navegador necesita el
   atributo).
2. **Tailwind**: hay que usar propiedades lógicas (`ps-`, `pe-`, `ms-`, `me-`) en lugar de
   `pl-`/`pr-`/`ml-`/`mr-`. Todo el repo hoy usa las físicas. Es una auditoría de clases, no
   un parche.
3. **Iconos direccionales se espejan** (flechas de «siguiente», chevrones del stepper de
   pedido), **los no direccionales no** (reloj, logo, iconos de marca).
4. **Números**: convive el dígito arábigo occidental (1234) con el índico oriental (١٢٣٤).
   En Egipto el occidental es el habitual en comercio. **Fijar uno y no mezclar.** Los
   importes de recaudo nunca deben pasar por localización automática de dígitos.
5. **Mezcla LTR dentro de RTL**: «YAM», URLs, montos con símbolo de moneda y números de
   guía quedan al revés si no se envuelven. Hay que marcarlos con `dir="ltr"` o `&lrm;`.
6. **Fuente**: la tipografía actual de YAM casi seguro no tiene cobertura árabe decente. Hace
   falta una familia con soporte real (p. ej. Noto Sans Arabic / IBM Plex Sans Arabic) o el
   texto se renderiza con sustitución y se ve roto.
7. **Nadie en ATL lee árabe.** Un texto árabe publicado sin revisor nativo es riesgo de
   ridículo público. **Regla: no se publica una sola línea en árabe sin revisión humana
   nativa pagada.** El copy de §7 es un borrador para que lo revise un nativo, no material
   listo para publicar.

El amárico (etíope) añade un sistema de escritura distinto *además* de todo lo anterior y es
la segunda razón —tras la falta de caso comercial— para dejar Etiopía fuera.

---

## 3. Canales reales, con nombre

### Transversal
- **WhatsApp Business.** El canal, no *un* canal. Nigeria aparece como el país de mayor
  penetración del mundo: **95,1 % de la población en línea**; Sudáfrica segundo con 93,9 %;
  Kenia entre los diez primeros ([Oberlo](https://oberlo.com/statistics/who-uses-whatsapp-the-most)
  — metodología poco clara, pero coincide con el resto de fuentes en el orden). Ventaja para
  YAM: **el gateway de WhatsApp ya está casi montado** (ver memoria del proyecto y
  `docs/whatsapp-cloud-api.md`) y el canal del código de entrega ya existe. Es el único canal
  donde YAM parte con ventaja técnica.
- **LinkedIn** para B2B en Nigeria, Kenia y Sudáfrica. Es donde están los dueños de couriers
  medianos, que es el público del licenciamiento.
- **TikTok** sirve para alcance, no para B2B logístico. No invertir pago aquí en la fase 1.

### Por país
- **Nigeria:** **Lagos International Trade Fair** de la LCCI — 40.ª edición, **6 al 15 de
  noviembre de 2026**, Tafawa Balewa Square, entrada libre, registro solo por
  `lagosinternationaltradefair.com` (la LCCI advirtió sobre eventos fraudulentos que usan su
  marca — [RioTimes](https://www.riotimesonline.com/lagos-international-trade-fair-2026/)).
  **Esto es en dos semanas y media: es la única oportunidad de campo del trimestre.**
  Además: Lagos Chamber of Commerce and Industry (LCCI) y NACCIMA como cámaras; mercados
  físicos de Computer Village (Ikeja) y Balogun (Isla de Lagos) para comerciantes reales;
  radio comercial de Lagos para yoruba/pidgin.
- **Kenia:** **Nairobi International Trade Fair** de la Agricultural Society of Kenya
  (anual, septiembre/octubre, Jamhuri Park) — **no verifiqué las fechas de la edición 2027**,
  hay que confirmarlas en `ask.co.ke`. Kenya National Chamber of Commerce and Industry
  (KNCCI). Mercados: Gikomba, Nyamakima (mayoristas de Nairobi).
- **Egipto:** **Destination Africa** (sourcing textil, El Cairo) se celebró el **14-15 de
  octubre de 2026**, ya pasó; la próxima edición es el objetivo. Cámaras: Federation of
  Egyptian Chambers of Commerce. Recordar: **sin licencia de marketing directo, solo inbound
  y feria.**
- **Marruecos:** CGEM (patronal), Maroc Export / AMDIE. Ferias de artesanía y textil en
  Casablanca y Marrakech — no verifiqué calendario 2027.
- **Continental:** **Intra-African Trade Fair (IATF)** — la edición 2025 fue en Argel
  (4-10 de septiembre, ~2.000 expositores, 75 países, +35.000 delegados) y **la 5.ª edición
  de 2027 será en Nigeria** ([AllAfrica](https://allafrica.com/stories/202509050076.html)).
  Esa es la cita grande a la que hay que llegar preparado, no improvisado.

### Dónde el internet caro o intermitente cambia el formato

Regla operativa: **el formato se decide por el precio del GB, no por el gusto del creativo.**

| Precio aprox. del GB | Países de la lista | Formato |
| --- | --- | --- |
| < USD 0,50 | Nigeria (~0,31-0,39), Etiopía (~0,45) | Video corto permitido (≤15 s, ≤2 MB), subtitulado siempre |
| USD 0,50 – 2 | Kenia, Egipto, Marruecos (rango no verificado país por país) | **Imagen estática + texto.** Video solo en wifi, nunca autoplay |
| > USD 2 | Zimbabue, Sudán del Sur, RCA (descartados) | Solo texto / SMS |

Fuente del rango: [RAMP Index Q1 y Q2 2025, Research ICT Africa](https://researchictafrica.net/2025/07/24/ramp-index-insights-quarter-2-2025/);
Sudáfrica ~R20,50/GB, peor que 27 países africanos ([StatRanker vía AllAfrica, feb. 2026](https://allafrica.com/stories/202602170116.html)).

Consecuencias de diseño que afectan al repo: la página de aterrizaje africana debe pesar
**menos de 150 KB sin contar fuentes**, servir imágenes en AVIF/WebP, y funcionar sin JS para
el formulario. El `docs/estandares-de-plataforma.md` ya exige paquete liviano; aquí ese
estándar deja de ser higiene y pasa a ser condición de mercado.

---

## 4. Competencia y referentes

### Jumia — el referente obligado
- Problemas estructurales que reporta la literatura: direcciones informales, congestión y
  **manejo de efectivo contraentrega con riesgo de cuadre**; modos de falla típicos
  (cliente ausente, GPS errado, teléfono sin respuesta) que inflan el coste de reentrega
  ([allbusiness.africa](https://allbusiness.africa/insights/african-last-mile-delivery-ecommerce)).
- Mitigaciones: conciliación con el conductor, empuje a pago digital, y **puntos de recogida
  o entrega por agente** donde la seguridad lo exige.
- Situación financiera: sigue en pérdidas, apunta a **equilibrio de EBITDA ajustado y caja
  positiva en el 4.º trimestre de 2026**, con pérdida anual proyectada de USD 25-30 millones.
  Abrió un hub de consolidación de 10.000 m² en Thiaroye (Senegal) en mayo de 2026 para bajar
  el coste por entrega.
- **Qué le funcionó:** red propia + puntos de recogida + consolidación. **Qué le falló:**
  quemar caja durante una década sin llegar a rentabilidad; el contraentrega como coste, no
  como producto.

### El cementerio, que vale más que los casos de éxito
- **Kobo360** (Nigeria): pagaba a los transportistas por adelantado y cobraba a 30-90 días.
  Cuando un banco retiró la línea de crédito, se cayó la caja; obligaciones estimadas en
  **₦10.000 millones**, fuga de directivos en 2024 y recompra por el exCEO
  ([BrandSpur](https://brandspurng.com/2026/07/20/kobo360s-rise-and-fall-how-a-30-million-startup-ended-up-owing-%E2%82%A610-billion/),
  [TechCabal](https://techcabal.com/2025/03/04/kobo360-investors-sell-equity/) — las fechas
  no coinciden entre fuentes; la cronología no está verificada).
- **Sendy** (Kenia): pivotó y terminó cerrando (**no encontré confirmación del año**).
- **Lori Systems**: sin rondas nuevas anunciadas; silencio.
- Agregado: esas tres captaron **+USD 130 millones entre 2019 y 2022** y la mayor parte está
  amortizada o en estado incierto.

**La lección que YAM debe usar como argumento de venta:** en África lo que quebró fue el
**balance** (flota, anticipos, crédito), no el software. Un licenciatario local que alquila
plataforma en vez de construirla evita exactamente el agujero que se tragó a Kobo360. Ese es
el único discurso de ventas que es a la vez verdadero y diferenciador.

### Competencia directa al software
- **ParcelOps** (Sudáfrica): portal white-label para couriers, desde ~ZAR 2.000, cobro por
  guías procesadas, sin contrato largo. Competidor real en Sudáfrica.
- **Ubezon** (global): white-label, **USD 49/mes + 1,5 % por entrega**, sin coste por
  conductor ni por usuario. **Es el ancla de precio con la que YAM va a ser comparado.**
- **Tookan** USD 99/mes (700 tareas), **Onfleet** desde USD 500/mes (2.000 tareas).
- **Borderless HQ**: SaaS explícitamente para operadores africanos de mensajería. Sin precio
  publicado.
- **Kwik** (Nigeria) vende API de despacho a comercios: es competencia parcial del ángulo
  de software.

**Conclusión de precio:** cualquier licencia de YAM por encima de ~USD 120/mes para un
operador pequeño africano necesita justificar por qué no usan Ubezon. La respuesta tendría
que ser **recaudo contraentrega con conciliación y multimoneda real**, que es lo que los
genéricos hacen mal. Si YAM no entrega eso, no hay precio defendible.

---

## 5. Regulación antes de captar

> No soy abogado y esto no es asesoría legal. Todo lo de abajo viene de comentario de firmas
> y prensa, no de lectura del texto legal consolidado. Antes de enviar el primer mensaje en
> frío hay que validar con abogado local en el país concreto.

| País | Régimen | Correo/SMS en frío | Lo que obliga |
| --- | --- | --- | --- |
| **Sudáfrica** | POPIA, **art. 69** | **Prácticamente prohibido** | Opt-in previo salvo cliente existente. Ofrecer solo un «darse de baja» **no es consentimiento** (así lo dijo el Information Regulator en una notificación de cumplimiento). Se puede contactar **una sola vez** para pedir el consentimiento. Identificar al remitente y dar vía de objeción en cada mensaje. ([Cliffe Dekker Hofmeyr](https://www.cliffedekkerhofmeyr.com/news/publications/2020/technology/tmt-alert-26-august-Direct-marketing-practices-in-the-midst-of-South-Africas-new-era-of-data-protection.html), [Baker McKenzie](https://insightplus.bakermckenzie.com/bm/data-technology/south-africa-direct-marketing-under-scrutiny-key-regulatory-developments-in-2024)) |
| **Nigeria** | **NDPA 2023** (sustituye la NDPR 2019) | Posible con cuidado | Hay que **poder probar** el consentimiento; silencio y casillas premarcadas no valen. Existe interés legítimo como base, pero cede ante los derechos del titular. Alcance **extraterritorial**: aplica a empresa extranjera que trate datos de personas en Nigeria. Sanciones citadas hasta 1-2 % de ingresos anuales. ([KPMG Nigeria](https://assets.kpmg.com/content/dam/kpmg/ng/pdf/the-nigeria-data-protection-act-2023.pdf), [Clym](https://www.clym.io/regulations/nigeria-data-protection-act-ndpa)) **No encontré guía específica de marketing de la NDPC ni confirmación de cómo aplica a extranjero sin presencia local.** |
| **Kenia** | DPA 2019 + Reglamento General 2021 | Requiere consentimiento previo | Prohibido usar datos para marketing directo sin consentimiento previo; para marketing y perfilado debe ser **explícito e informado**. La ODPC ya sancionó (**Grass International**, por no dar mecanismo de baja; multas de hasta **KES 5 millones**). Las fuentes se contradicen sobre el techo de multa (KES 5 M vs. 1 % vs. 2 % de facturación). ([PwC Kenya](https://www.pwc.com/ke/en/assets/pdf/consent-lawful-basis-under-kenyas-data-protection-act.pdf), [Clyde & Co](https://www.clydeco.com/en/insights/2023/10/data-protection-compliance-in-kenya-odpc)) |
| **Egipto** | Ley 151/2020 + **Decreto 816/2025** | **Requiere licencia específica** | El marketing electrónico directo necesita **licencia/permiso propio**, aparte de la autorización general de tratamiento: consentimiento explícito previo, declaración clara al inicio de cada mensaje, mecanismo accesible de retirada. El reglamento (1 nov. 2025) abrió un año de gracia. ([Al Tamimi](https://www.tamimi.com/news/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law), [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins)) **Regla práctica: cero correo y SMS en frío en Egipto.** |
| **Marruecos** | Ley 09-08 + **CNDP** | **El más practicable** | El tratamiento debe **declararse a la CNDP antes de empezar**. No hace falta consentimiento previo para correo/SMS si los datos se recogieron **directamente del destinatario** (la ficha de la CNDP está truncada en la parte de condiciones: **verificar**). Art. 59: prisión de 3 a 12 meses y multa de 20.000 a 200.000 DH por tratar datos para prospección pese a la oposición del titular. ([ficha CNDP](https://www.cndp.ma/wp-content/uploads/2025/07/fiche_CNDP_Prospection_RT_fr.pdf)) |

### Anunciar siendo extranjero
No encontré fuente que confirme requisitos de registro publicitario para extranjero en
ninguno de los cinco países. **Esto queda sin verificar y es un hueco del análisis.** Lo que
sí es cierto operativamente: Meta y Google exigen entidad facturable y, para ciertos
formatos, verificación de identidad del anunciante. ATL puede anunciar desde Colombia con su
NIT, pero no podrá usar formatos que exijan entidad local.

### Restricciones cambiarias que afectan al cobro
- **Nigeria:** el CBN eliminó en enero de 2025 las prórrogas al plazo de repatriación de
  divisas de exportación: **180 días** para no petrolero, 90 para petróleo y gas, con tono
  de «no negociable» y advertencia de sanciones
  ([ThisDay](https://www.thisdaylive.com/2025/01/10/cbn-halts-extension-of-export-proceeds-repatriation/)).
  Las pymes exportadoras son las más golpeadas. Traducción para YAM: **un comercio nigeriano
  puede tener serios problemas para pagarle una suscripción mensual en dólares a una empresa
  colombiana.** Esto es, por sí solo, un argumento de peso a favor de licenciar a **un** socio
  grande (que sí tiene banca corporativa y ventanilla de divisas) en vez de cobrar a cien
  comercios pequeños.
- **Egipto y Marruecos:** control de cambios y restricciones conocidas; **no las verifiqué**
  en esta investigación. Hay que hacerlo antes de fijar precios.
- Implicación de cobro: facturar en USD a través de un intermediario que ya opere allí
  (dLocal, Paystack, Flutterwave) en vez de intentar cobro directo. **No verifiqué** si
  dLocal o Flutterwave soportan a un vendedor colombiano cobrando en Nigeria; es el primer
  dato que hay que conseguir si se sigue adelante.

---

## 6. Qué necesita el formulario de registro de un comercio africano

Hoy el registro de comercio de YAM asume Colombia: NIT, dirección con nomenclatura, pesos,
indicativo +57. Nada de eso sirve. Cambios por bloque:

### 6.1 Identidad del comercio
| País | Identificador fiscal | Nota |
| --- | --- | --- |
| Nigeria | **TIN** (FIRS) y **RC Number** (CAC) | Muchos comercios pequeños solo tienen el «business name», no RC. Hacerlo **opcional** o se pierde al informal, que es el 25 % del mercado. |
| Kenia | **KRA PIN** | Ubicuo y fiable. Puede ser obligatorio. |
| Egipto | Registro comercial + número fiscal | Obligatorio, y en árabe. El campo debe aceptar caracteres árabes. |
| Marruecos | **ICE** (Identifiant Commun de l'Entreprise) | Estándar y bien adoptado. |
| Sudáfrica | Registro CIPC + **VAT number** | VAT solo si factura > R1 M. Opcional. |

**Regla general: ningún identificador fiscal puede ser obligatorio en el primer paso.** Un
formulario que exige RC Number pierde al comerciante de Computer Village, que es el cliente.
Pedirlo en la verificación, no en el registro.

### 6.2 Teléfono
- Selector de país con prefijo, **por defecto el del mercado**, no +57.
- **El teléfono es la identidad real**, no el correo. En Nigeria y Kenia mucho comercio no
  revisa correo nunca. Validar por **WhatsApp OTP**, no por email.
- Guardar en E.164 y aceptar que un mismo comercio tenga dos o tres números (uno por red,
  por el coste de datos y la cobertura).

### 6.3 Moneda y cobro
- Campo **moneda** obligatorio: NGN, KES, EGP, MAD, ZAR. Hoy YAM es monomoneda (COP). Esto es
  cambio de esquema, no de UI: toda tabla `at_` que guarde importes necesita columna de
  moneda, y el recaudo necesita saber en qué moneda cuadra.
- **No convertir a COP para mostrar.** El comerciante cuadra caja en su moneda.
- Método de cobro del contraentrega, con **dinero móvil de primera clase**, no como «otro»:

| País | Opciones mínimas |
| --- | --- |
| Kenia | **M-Pesa** (obligatorio, con Paybill/Till), Airtel Money, efectivo, tarjeta |
| Nigeria | **Transferencia bancaria instantánea (NIBSS)**, OPay / PalmPay / Moniepoint, efectivo, tarjeta |
| Egipto | Efectivo, **Fawry**, Vodafone Cash / InstaPay, tarjeta |
| Marruecos | **Tarjeta (CMI)** primero, efectivo, billetera |
| Sudáfrica | Tarjeta, EFT, **SnapScan / Zapper**, efectivo (minoritario) |

El dato que justifica esto: 82,3 % de adultos kenianos con acceso a dinero móvil y 424.404
agentes; M-Pesa ~90,8 % de cuota. Un desplegable que ponga «M-Pesa» bajo «Otros» en Kenia
es un formulario muerto.

### 6.4 Direcciones sin nomenclatura — el problema de fondo
Esto no se arregla con un campo de texto más largo. Lo que hay que hacer:

1. **El par de coordenadas es el dato primario, el texto es secundario.** Captura obligatoria
   por GPS del dispositivo o pin en mapa (Leaflet, que ya está en el stack).
2. **Campo de referencia física obligatorio y libre** («frente a la mezquita, portón verde»).
   En buena parte del continente la dirección *es* una referencia: en Ghana se describe por
   cruce, árbol o portón de color, no por número y calle
   ([QZ Africa](https://qz.com/africa/1117329/ghanas-ghanapostgps-joins-snoocode-what3words-in-digital-address-systems)).
   Estimación citada: **~70 % del territorio ghanés sin nombre de calle ni número**.
3. **Aceptar código digital nacional como campo opcional**: GhanaPostGPS (Ghana), códigos de
   localización de Ruanda, verificación de direcciones de Nigeria; y Plus Codes de Google como
   genérico. Ghana Post reportó **+10.000 entregas** con dirección digital y caída de las
   devoluciones por dirección no encontrada, aunque la adopción fue más lenta de lo esperado y
   la app recibió críticas de usabilidad y coste.
4. **Teléfono del destinatario obligatorio** y llamada previa como paso del flujo, no como
   excepción: «cliente ausente» y «GPS errado» son los modos de falla que más encarecen la
   última milla africana.
5. **Punto de recogida como alternativa de primera clase**, no como plan B: donde la
   seguridad lo exige, Jumia entrega en punto o por agente. YAM ya tiene CEDI; el concepto es
   el mismo.
6. No validar la dirección contra un catálogo de barrios colombiano. El `src/lib/zones.ts`
   actual es Valle de Aburrá; para otro país hay que poder cargar zonas por tenant.

---

## 7. COPY en idiomas nativos

> **Advertencia que no es formalismo:** esto son **borradores para revisión nativa pagada**.
> Yo no tengo revisor árabe, suajili ni pidgin. En árabe, además, el riesgo no es solo de
> estilo sino de renderizado (ver §2). **Nada de este bloque se publica sin que lo revise un
> hablante nativo del mercado concreto.**
>
> Todas las piezas están escritas bajo la **regla de honestidad**: no se promete entrega a
> América Latina. Se ofrece lista de espera, programa de aliados fundadores o licencia de
> software. Cualquier variante que al traducirse insinúe «entregamos en Colombia» está mal y
> hay que devolverla.

Dos mensajes distintos, no uno:
- **Mensaje L (licencia de software)** → Nigeria, Kenia, Sudáfrica. Público: dueño de courier.
- **Mensaje C (captación de comercios / lista de espera)** → Marruecos, Egipto. Público:
  comercio exportador pequeño.

---

### 7.1 INGLÉS — Nigeria, Kenia, Sudáfrica · mensaje **L**

**Titulares + subtítulos (3 variantes)**

1. **"Your riders. Your brand. Our software."**
   *Sub:* Nine years of cash-on-delivery runs in Medellín, Colombia — now licensed to African courier operators. No fleet to buy. No code to write.
   *(«Tus mensajeros. Tu marca. Nuestro software.» Sub: Nueve años de reparto contraentrega en Medellín, Colombia — ahora en licencia para operadores africanos. Sin flota que comprar. Sin código que escribir.)*

2. **"Kobo360 didn't die from bad software."**
   *Sub:* It died from a balance sheet. Rent the platform instead of building it, and keep your cash where it belongs.
   *(«Kobo360 no murió por software malo.» Sub: Murió por el balance. Alquila la plataforma en vez de construirla y deja tu caja donde debe estar.)*

3. **"Built for cash. Ready for M-Pesa."**
   *Sub:* Collect on delivery, reconcile the same night, and show the merchant where every naira went. The part generic delivery apps get wrong.
   *(«Hecho para el efectivo. Listo para M-Pesa.» Sub: Recauda contraentrega, cuadra la misma noche y muéstrale al comercio dónde fue cada naira. La parte que las apps genéricas hacen mal.)*

**Texto corto para LinkedIn** (el canal B2B real)

> Three African logistics startups raised venture capital in 2024. Combined: $2.1m.
> Nobody is building new delivery software with that.
>
> We run YAM — pickup, hub, delivery and **cash collection with reconciliation** — in Medellín, Colombia. Cash on delivery is not a feature we bolted on; it is what the platform was built around.
>
> We are looking for **one** courier operator in Nigeria and **one** in Kenya to run YAM under their own brand, as a paid pilot. We are not opening a delivery company in your market. We are not your competitor.
>
> Honest limits: our interface is in Spanish today and we are translating it. Multi-currency and M-Pesa are on the roadmap, not shipped. If you want finished software, wait six months. If you want to shape it, reply.

*(Tres startups africanas de logística levantaron capital en 2024. En total: 2,1 millones de dólares. Nadie construye software de entregas nuevo con eso. Operamos YAM —recogida, CEDI, entrega y recaudo contraentrega con conciliación— en Medellín, Colombia. El contraentrega no es una función que añadimos: es aquello alrededor de lo cual se construyó la plataforma. Buscamos UN operador de mensajería en Nigeria y UNO en Kenia para operar YAM con su propia marca, como piloto pagado. No vamos a abrir una empresa de mensajería en tu mercado. No somos tu competencia. Límites honestos: hoy la interfaz está en español y la estamos traduciendo. Multimoneda y M-Pesa están en la hoja de ruta, no entregados. Si quieres software terminado, espera seis meses. Si quieres darle forma, responde.)*

**Anuncio de pago** (LinkedIn / Meta, imagen estática, sin video)

- **Titular:** Stop paying $500 a month for delivery software built for Ohio.
- **Cuerpo:** YAM was built for cash-on-delivery routes in a Latin American city with informal addresses and bike couriers. Sound familiar? We are licensing it to two African operators as founding partners. Spanish interface today, English and Swahili next. Early pricing, direct line to the people who wrote it.
- **CTA:** Apply as founding operator
*(Titular: Deja de pagar 500 dólares al mes por un software de entregas hecho para Ohio. Cuerpo: YAM se construyó para rutas contraentrega en una ciudad latinoamericana con direcciones informales y mensajeros en moto. ¿Te suena? Lo estamos licenciando a dos operadores africanos como aliados fundadores. Interfaz en español hoy, inglés y suajili después. Precio de arranque y línea directa con quienes lo escribieron. CTA: Postúlate como operador fundador.)*

**Mensaje en frío** — **canal: LinkedIn InMail o WhatsApp Business**, no correo masivo
(en Sudáfrica, POPIA; en Nigeria hay que poder probar el consentimiento)

- **Asunto:** One courier operator in Lagos, not a hundred
- **Cuerpo:**
  > Hi [nombre] — I run logistics software in Medellín, Colombia, not a courier company in Nigeria, so this is not a pitch from a competitor.
  >
  > We built YAM for cash-on-delivery last mile: pickup at the merchant, hub sorting, delivery, cash collected and reconciled per rider per night. We want one Nigerian operator to run it under their own brand.
  >
  > Straight about where we are: Spanish interface, no naira support yet, no local entity. That is why the first partner gets founding terms and a say in the roadmap.
  >
  > Worth fifteen minutes? If not, say so and I will not write again.
  >
  > — Henry Taborda, A Tiempo Logística / CDH Maker

*(Asunto: Un operador de mensajería en Lagos, no cien. Cuerpo: Hola [nombre], hago software de logística en Medellín, Colombia, no una empresa de mensajería en Nigeria, así que esto no viene de un competidor. Construimos YAM para la última milla contraentrega: recogida en el comercio, clasificación en CEDI, entrega, efectivo recaudado y cuadrado por mensajero cada noche. Queremos un operador nigeriano que lo opere con su propia marca. Claro sobre dónde estamos: interfaz en español, sin soporte de naira todavía, sin entidad local. Por eso el primer aliado recibe condiciones de fundador y voz en la hoja de ruta. ¿Valen quince minutos? Si no, dímelo y no escribo otra vez.)*
→ La última línea es deliberada: POPIA permite un solo contacto para pedir consentimiento.
Dejarla por escrito protege en Sudáfrica y es buena práctica en Nigeria y Kenia.

**Una línea de qué es YAM**
> YAM is last-mile delivery software built around collecting cash at the door.
*(YAM es software de última milla construido alrededor de cobrar el efectivo en la puerta.)*

---

### 7.2 SUAJILI — Kenia · mensaje **L**, uso en WhatsApp y prueba social

**Titulares + subtítulos (3 variantes)**

1. **"Wapokezi wako. Jina lako. Mfumo wetu."**
   *Sub:* Tunatoka Medellín, Kolombia. Tunajua kukusanya pesa mkononi na kuzilinganisha kila jioni.
   *(«Tus repartidores. Tu nombre. Nuestro sistema.» Sub: Venimos de Medellín, Colombia. Sabemos recaudar efectivo en mano y cuadrarlo cada tarde.)*

2. **"Usijenge mfumo. Uupange."**
   *Sub:* Kodisha mfumo wa YAM. Pesa yako ibaki kwenye biashara, sio kwenye programu.
   *(«No construyas el sistema. Alquílalo.» Sub: Arrienda el sistema YAM. Que tu dinero se quede en el negocio, no en la programación.)*

3. **"Pesa mkononi. Hesabu wazi."**
   *Sub:* Kila bodaboda, kila shilingi, kila jioni — bila kubishana.
   *(«Efectivo en mano. Cuentas claras.» Sub: Cada mototaxista, cada chelín, cada tarde — sin discusiones.)*

**Texto corto para la red que de verdad se usa allá (WhatsApp Business / estado + grupos de comerciantes)**

> Habari. Sisi ni YAM, mfumo wa usafirishaji kutoka Medellín, Kolombia.
>
> Tunachokifanya: kuchukua mzigo dukani, kupanga kwenye kituo, kufikisha kwa mteja, na **kukusanya pesa pale mlangoni** — kisha kuhesabu kila kitu jioni hiyo, kwa kila dereva.
>
> Tunatafuta **kampuni moja** ya usafirishaji hapa Kenya itakayotumia mfumo wetu kwa jina lake lenyewe.
>
> Ukweli mtupu: mfumo bado uko kwa Kihispania, na M-Pesa bado haijaingizwa — tunaifanyia kazi. Hatutoi usafirishaji kwenda Kolombia. Hatuahidi hilo.
>
> Ukitaka kujua zaidi, jibu ujumbe huu.

*(Hola. Somos YAM, un sistema de mensajería de Medellín, Colombia. Lo que hacemos: recoger el paquete en la tienda, clasificarlo en el centro, entregarlo al cliente y recaudar el dinero en la puerta — y cuadrar todo esa misma tarde, por cada conductor. Buscamos UNA empresa de mensajería aquí en Kenia que use nuestro sistema con su propio nombre. La verdad desnuda: el sistema todavía está en español y M-Pesa aún no está integrado, estamos trabajando en eso. No ofrecemos envíos a Colombia. No prometemos eso. Si quieres saber más, responde este mensaje.)*

**Anuncio de pago** (imagen estática — ver §3, Kenia no es mercado de video barato)

- **Titular:** Mfumo wa usafirishaji. Hakuna gari za kununua.
- **Cuerpo:** YAM ulitengenezwa kwa njia za pesa-mkononi katika jiji la Amerika ya Kusini lenye anwani zisizo rasmi na madereva wa pikipiki. Tunatafuta washirika wawili wa kwanza barani Afrika. Bei ya mwanzo, na sauti yako kwenye maamuzi ya mfumo.
- **CTA:** Omba kuwa mshirika wa kwanza
*(Titular: Sistema de mensajería. Sin vehículos que comprar. Cuerpo: YAM se hizo para rutas de pago en efectivo en una ciudad latinoamericana con direcciones informales y conductores de moto. Buscamos dos primeros aliados en África. Precio de arranque y tu voz en las decisiones del sistema. CTA: Solicita ser aliado fundador.)*

**Mensaje en frío** — **canal: WhatsApp Business** (el correo en frío keniano exige
consentimiento previo; WhatsApp a un número comercial publicado es el camino menos malo, y
aun así hay que ofrecer la baja en el primer mensaje)

- **Asunto / primera línea:** Kampuni moja ya usafirishaji Nairobi
- **Cuerpo:**
  > Habari [jina]. Naitwa Henry, natoka Medellín, Kolombia. Tunauza mfumo wa usafirishaji, sio usafirishaji wenyewe — hatushindani na wewe.
  >
  > Mfumo wetu unakusanya pesa mlangoni na kuhesabu kila dereva jioni. Tunatafuta kampuni moja Kenya kuutumia kwa jina lake.
  >
  > Bila kuzungusha: bado uko kwa Kihispania, M-Pesa inakuja. Mshirika wa kwanza anapata bei ya mwanzo.
  >
  > Dakika kumi na tano? Kama hutaki, niambie na sitarudia.
  >
  > — Henry Taborda, A Tiempo Logística

*(Hola [nombre]. Me llamo Henry, vengo de Medellín, Colombia. Vendemos el sistema de mensajería, no la mensajería — no competimos contigo. Nuestro sistema recauda el dinero en la puerta y cuadra cada conductor por la tarde. Buscamos una sola empresa en Kenia que lo use con su nombre. Sin rodeos: todavía está en español, M-Pesa viene en camino. El primer aliado recibe precio de arranque. ¿Quince minutos? Si no quieres, dímelo y no vuelvo a escribir.)*

**Una línea de qué es YAM**
> YAM ni mfumo wa kufikisha mizigo na kukusanya pesa mlangoni.
*(YAM es un sistema para entregar paquetes y recaudar el dinero en la puerta.)*

---

### 7.3 ÁRABE (Egipto) — mensaje **C** · **borrador no publicable sin revisor nativo**

> **Tres avisos antes de usar nada de esto:** (1) en Egipto el **marketing electrónico directo
> exige licencia** (Decreto 816/2025), así que el bloque de «mensaje en frío» de abajo
> **no se puede enviar hoy** — queda documentado para cuando haya licencia, y mientras tanto
> solo sirve lo orgánico y la feria; (2) todo el texto necesita `dir="rtl"` y `lang="ar"`, y
> «YAM», las URL y los importes envueltos en `dir="ltr"`; (3) nadie en ATL lee árabe.

**Titulares + subtítulos (3 variantes)**

1. **«متجرك في القاهرة. مشترون في أمريكا اللاتينية. نحن نبني الطريق الآن.»**
   *Sub:* لا نوصّل إلى كولومبيا اليوم. نُجهّز الطريق، ونريد متجرك في الدفعة الأولى.
   *(«Tu tienda en El Cairo. Compradores en América Latina. Estamos construyendo la ruta ahora.» Sub: Hoy no entregamos en Colombia. Estamos preparando la ruta y queremos tu tienda en la primera tanda.)*

2. **«الدفع عند الاستلام تخصّصنا، لا استثناء عندنا.»**
   *Sub:* نعمل في ميديلين بكولومبيا: نجمع من المتجر، نفرز، نوصّل، ونحصّل النقد عند الباب.
   *(«El pago contraentrega es nuestra especialidad, no una excepción.» Sub: Trabajamos en Medellín, Colombia: recogemos en el comercio, clasificamos, entregamos y cobramos el efectivo en la puerta.)*

3. **«قائمة انتظار، لا وعود.»**
   *Sub:* سجّل متجرك مجانًا. لن نطلب مالًا، ولن نَعِد بشيء قبل أن يكون جاهزًا.
   *(«Lista de espera, no promesas.» Sub: Registra tu comercio gratis. No pediremos dinero ni prometeremos nada antes de que esté listo.)*

**Texto corto para la red** (Facebook es el que de verdad se usa en el comercio egipcio, no LinkedIn)

> نحن YAM، شركة توصيل من مدينة ميديلين في كولومبيا. نعمل بالدفع عند الاستلام منذ سنوات: نجمع الطلب من المتجر، ونفرزه في مركزنا، ونوصّله، ونحصّل النقد عند الباب.
>
> **ما لا نملكه اليوم:** شحن دولي، أو تخليص جمركي، أو مدفوعات عبر الحدود، أو كيان قانوني في مصر.
>
> **ما نفعله الآن:** نفتح قائمة انتظار للمتاجر المصرية المهتمة بالوصول إلى كولومبيا وأمريكا اللاتينية. التسجيل مجاني ولا يُلزمك بشيء. سنكتب لك عندما يصبح هناك شيء حقيقي — وليس قبل ذلك.
>
> إذا كان هذا يبدو بطيئًا، فهو كذلك. نُفضّل أن نكون صادقين على أن نكون سريعين.

*(Somos YAM, una empresa de entregas de la ciudad de Medellín, en Colombia. Trabajamos con pago contraentrega desde hace años: recogemos el pedido en el comercio, lo clasificamos en nuestro centro, lo entregamos y cobramos el efectivo en la puerta. Lo que NO tenemos hoy: envío internacional, despacho aduanero, pagos transfronterizos ni figura legal en Egipto. Lo que SÍ hacemos ahora: abrir una lista de espera para comercios egipcios interesados en llegar a Colombia y América Latina. El registro es gratis y no te obliga a nada. Te escribiremos cuando haya algo real, y no antes. Si esto parece lento, lo es. Preferimos ser honestos antes que rápidos.)*

**Anuncio de pago** (imagen estática + texto; permitido porque no es comunicación directa a un titular identificado — **confirmar con abogado egipcio**)

- **Titular:** **«لا نشحن إلى كولومبيا بعد. نريد متجرك عندما نفعل.»**
- **Cuerpo:** YAM شركة توصيل من ميديلين بكولومبيا، متخصّصة في الدفع عند الاستلام. نحن نُعِدّ طريقًا بين أمريكا اللاتينية وشمال أفريقيا. التسجيل في قائمة الانتظار مجاني، ولا يتضمّن أي التزام أو دفع.
- **CTA:** **سجّل متجرك في قائمة الانتظار**
*(Titular: «Todavía no enviamos a Colombia. Queremos tu comercio cuando lo hagamos.» Cuerpo: YAM es una empresa de entregas de Medellín, Colombia, especializada en pago contraentrega. Estamos preparando una ruta entre América Latina y el norte de África. Registrarse en la lista de espera es gratis y no implica ningún compromiso ni pago. CTA: Registra tu comercio en la lista de espera.)*

**Mensaje en frío — BLOQUEADO EN EGIPTO.** Borrador para cuando exista licencia:

- **Asunto:** **قائمة انتظار للمتاجر المصرية — بدون وعود**
- **Cuerpo:**
  > تحيّة [الاسم]. اسمي هنري تابوردا، من شركة A Tiempo Logística في ميديلين بكولومبيا.
  >
  > نحن شركة توصيل محلية متخصّصة في الدفع عند الاستلام. **لا نشحن دوليًا اليوم** ولا نملك كيانًا في مصر. نفتح قائمة انتظار للمتاجر التي تريد الوصول إلى أمريكا اللاتينية لاحقًا.
  >
  > التسجيل مجاني. إن لم يهمّك الأمر، أخبرني ولن أكتب مرة أخرى.
  >
  > — هنري تابوردا

*(Asunto: Lista de espera para comercios egipcios — sin promesas. Cuerpo: Saludos [nombre]. Me llamo Henry Taborda, de la empresa A Tiempo Logística en Medellín, Colombia. Somos una empresa de entregas local especializada en pago contraentrega. Hoy no enviamos internacionalmente y no tenemos figura legal en Egipto. Abrimos una lista de espera para comercios que quieran llegar a América Latina más adelante. El registro es gratis. Si no te interesa, dímelo y no escribiré otra vez.)*

**Una línea de qué es YAM**
> **YAM شركة توصيل من كولومبيا، تخصّصها تحصيل النقد عند الباب.**
*(YAM es una empresa de entregas de Colombia cuya especialidad es cobrar el efectivo en la puerta.)*

---

### 7.4 FRANCÉS — Marruecos (y Costa de Marfil en fase 2) · mensaje **C**

Es el mercado con el camino legal más practicable para captación activa, pero recordar:
**declarar el tratamiento a la CNDP antes de enviar el primer mensaje.**

**Titulares + subtítulos (3 variantes)**

1. **« Votre atelier à Casablanca. Des acheteurs en Amérique latine. La route n'existe pas encore. »**
   *Sous-titre :* Nous la préparons. Inscrivez-vous sur la liste d'attente — gratuitement, sans engagement.
   *(«Tu taller en Casablanca. Compradores en América Latina. La ruta no existe todavía.» Sub: La estamos preparando. Inscríbete en la lista de espera — gratis, sin compromiso.)*

2. **« Les exportations colombiennes vers le Maroc ont bondi de 304 % en un an. Dans l'autre sens, presque rien. »**
   *Sous-titre :* C'est exactement le vide que nous voulons combler. Et nous cherchons les premiers commerçants pour le faire avec nous.
   *(«Las exportaciones colombianas a Marruecos crecieron 304 % en un año. En el otro sentido, casi nada.» Sub: Ese es justamente el vacío que queremos llenar. Y buscamos a los primeros comerciantes para hacerlo con nosotros.)*

3. **« Nous ne livrons pas encore au Maroc. Nous le disons avant que vous le demandiez. »**
   *Sous-titre :* YAM est un livreur colombien spécialisé dans le paiement à la livraison. Programme de partenaires fondateurs ouvert.
   *(«Todavía no entregamos en Marruecos. Lo decimos antes de que lo preguntes.» Sub: YAM es un repartidor colombiano especializado en pago contraentrega. Programa de aliados fundadores abierto.)*

**Texto corto para la red** (Facebook y WhatsApp Business; LinkedIn para la CGEM)

> YAM, c'est de la livraison du dernier kilomètre à Medellín, en Colombie. On ramasse chez le commerçant, on trie au centre, on livre, et **on encaisse en espèces à la porte**. C'est notre métier depuis des années.
>
> **Ce que nous n'avons pas :** transport transfrontalier, dédouanement, paiements internationaux, structure juridique au Maroc. Rien de tout ça.
>
> **Ce que nous ouvrons :** une liste d'attente pour les commerçants marocains — textile, artisanat, cosmétique — intéressés par l'Amérique latine. Inscription gratuite, aucun engagement, aucun paiement.
>
> On vous écrira quand il y aura quelque chose de réel. Pas avant.

*(YAM es entrega de última milla en Medellín, Colombia. Recogemos en el comercio, clasificamos en el centro, entregamos y cobramos en efectivo en la puerta. Es nuestro oficio desde hace años. Lo que no tenemos: transporte transfronterizo, aduana, pagos internacionales, estructura legal en Marruecos. Nada de eso. Lo que abrimos: una lista de espera para comerciantes marroquíes —textil, artesanía, cosmética— interesados en América Latina. Inscripción gratis, sin compromiso, sin pago. Te escribiremos cuando haya algo real. No antes.)*

**Anuncio de pago**

- **Titre :** Nous ne livrons pas encore au Maroc. Inscrivez-vous quand même.
- **Corps :** YAM livre à Medellín, en Colombie, avec paiement à la livraison. Nous préparons une route entre l'Amérique latine et le Maghreb, et nous cherchons les commerçants de la première vague : textile, artisanat, cosmétique à l'argan et au karité. Liste d'attente gratuite. Aucune promesse de délai.
- **CTA :** Rejoindre la liste d'attente
*(Titular: Todavía no entregamos en Marruecos. Inscríbete igual. Cuerpo: YAM entrega en Medellín, Colombia, con pago contraentrega. Preparamos una ruta entre América Latina y el Magreb y buscamos a los comerciantes de la primera oleada: textil, artesanía, cosmética de argán y karité. Lista de espera gratuita. Ninguna promesa de plazo. CTA: Únete a la lista de espera.)*

**Mensaje en frío** — **canal: correo profesional o WhatsApp Business**, tras declarar el
tratamiento a la CNDP y solo con datos obtenidos directamente del destinatario o de registro
público

- **Objet :** Liste d'attente : commerçants marocains vers l'Amérique latine
- **Corps :**
  > Bonjour [nom],
  >
  > Je m'appelle Henry Taborda, d'A Tiempo Logística, une société de livraison à Medellín, en Colombie. Notre spécialité est le paiement à la livraison.
  >
  > Je vous écris pour une raison simple : **nous ne livrons pas encore au Maroc**, et je ne vais pas vous dire le contraire. Nous constituons une liste d'attente de commerçants marocains intéressés par le marché latino-américain, pour savoir si la route vaut la peine d'être construite.
  >
  > Inscription gratuite, aucun engagement. Si cela ne vous intéresse pas, dites-le-moi et je ne vous réécrirai pas.
  >
  > Vous pouvez vous opposer à tout moment à l'utilisation de vos données en répondant à ce message.
  >
  > — Henry Taborda · A Tiempo Logística / CDH Maker · atiempologistica.com

*(Asunto: Lista de espera: comerciantes marroquíes hacia América Latina. Cuerpo: Buenos días [nombre]. Me llamo Henry Taborda, de A Tiempo Logística, una empresa de entregas en Medellín, Colombia. Nuestra especialidad es el pago contraentrega. Le escribo por una razón simple: todavía no entregamos en Marruecos, y no le voy a decir lo contrario. Estamos formando una lista de espera de comerciantes marroquíes interesados en el mercado latinoamericano, para saber si vale la pena construir la ruta. Inscripción gratis, sin compromiso. Si no le interesa, dígamelo y no le volveré a escribir. Puede oponerse en cualquier momento al uso de sus datos respondiendo a este mensaje.)*
→ La línea de oposición no es adorno: el art. 59 de la ley 09-08 castiga con prisión y multa
tratar datos para prospección **pese a la oposición** del titular.

**Une ligne pour expliquer YAM**
> YAM, c'est un livreur colombien dont le métier est d'encaisser l'argent à la porte.
*(YAM es un repartidor colombiano cuyo oficio es cobrar el dinero en la puerta.)*

---

### 7.5 PIDGIN NIGERIANO — solo redes y mercado físico, nunca contrato

Variante del mensaje L para bajar la barrera en grupos de WhatsApp y mercados de Lagos.
**Requiere revisor nigeriano**: el pidgin mal escrito por extranjero se lee como burla, y eso
es peor que no publicar nada.

- **Titular:** **"Na your brand. Na our software. You no go buy motor."**
  *(«Es tu marca. Es nuestro software. No vas a comprar vehículos.»)*
- **Cuerpo corto:**
  > We be YAM, delivery software from Medellín, Colombia. We sabi collect money at the door and balance am for every rider before night end.
  >
  > We dey look for **one** courier company for Nigeria to run am with your own name. We no go open delivery company here. We no be your competition.
  >
  > True talk: the thing still dey Spanish, naira no dey inside yet. Na why first partner go get founder price.
  *(Somos YAM, software de entregas de Medellín, Colombia. Sabemos recaudar el dinero en la puerta y cuadrarlo por cada mensajero antes de que termine la noche. Buscamos UNA empresa de mensajería en Nigeria que lo opere con tu propio nombre. No vamos a abrir empresa de entregas aquí. No somos tu competencia. Verdad cruda: todavía está en español, el naira aún no está dentro. Por eso el primer aliado tendrá precio de fundador.)*
- **Una línea:** **"YAM na software wey help you collect your money for door."**
  *(«YAM es software que te ayuda a cobrar tu dinero en la puerta.»)*

---

## 8. Calendario de arranque y presupuesto mínimo realista

Supuesto: **nadie se dedica a esto a tiempo completo** y no hay entidad legal africana.
Presupuesto pensado para probar la hipótesis, no para «entrar al mercado».

### Fase 0 — antes de gastar un peso (semanas 1 a 3, hasta el 10 de noviembre de 2026)
| Acción | Coste |
| --- | --- |
| Validar si dLocal / Flutterwave / Paystack aceptan a un vendedor colombiano cobrando en NGN y KES. **Si la respuesta es no, el proyecto se detiene aquí.** | 0 |
| Página de aterrizaje en **inglés** en `atiempologistica.com/partners`, < 150 KB, formulario sin JS | 0 (trabajo propio) |
| Formulario con los campos de §6: teléfono E.164, moneda, sin identificador fiscal obligatorio | 0 |
| Decidir precio de licencia frente al ancla de Ubezon (USD 49/mes + 1,5 %) | 0 |
| **Lagos International Trade Fair, 6-15 nov.** — asistir **no** es realista a tres semanas y sin presupuesto. Sustituto: pedir a un contacto en Lagos la lista de expositores de mensajería y usarla como base de prospección en LinkedIn | 0 – 80 USD |

### Fase 1 — prospección manual, sin pago (semanas 4 a 10, nov. 2026 – ene. 2027)
| Acción | Coste mensual |
| --- | --- |
| Revisión nativa de copy: inglés (0, propio) + **suajili** y **pidgin** por freelance | 120 – 200 USD, una vez |
| 40 mensajes en frío **manuales** por LinkedIn/WhatsApp (20 Nigeria, 20 Kenia), con la línea de baja incluida | 0 – 60 USD (LinkedIn Premium) |
| WhatsApp Business API: aprovechar el gateway que ya existe en el proyecto | ~0 – 20 USD |
| Objetivo medible: **6 conversaciones, 2 demos, 1 carta de intención** | — |

### Fase 2 — un solo piloto pagado (feb. – abr. 2027)
| Acción | Coste |
| --- | --- |
| Traducción de la UI a inglés (es trabajo de producto, el mayor coste real) | interno, 3-5 semanas-persona |
| Multimoneda en esquema `at_` + integración de un método de dinero móvil (M-Pesa **o** NIBSS, no los dos) | interno |
| Asesoría legal local del país elegido, 2 horas | 300 – 600 USD |
| Anuncio de pago, **solo** si hay un piloto firmado y solo en el país del piloto | 300 USD / 30 días |

### Lo que NO se hace en los primeros seis meses
- Árabe y Egipto: **bloqueado por la licencia de marketing directo**. Solo lista de espera
  orgánica y feria.
- Nada de video. Nada de TikTok pagado. Nada de cinco países a la vez.
- Ningún texto que diga que YAM entrega fuera de Colombia.

### Presupuesto total de los tres primeros meses
**USD 500 – 960 en efectivo**, más el tiempo de Henry. El gasto grande no es publicidad: es
traducir el producto. Si no hay disposición a traducir la UI, no hay que gastar los 500.

---

## 9. Lo que no verificué (para que no se cite como hecho)

- Participación del contraentrega en Kenia y Egipto con fuente primaria. Los números de
  Egipto (51-65 %) vienen de **blogs de proveedor**.
- La caída del 30 % del dinero móvil keniano en 2025: **un solo medio**, sin ver el informe
  del CBK.
- Marruecos: el observatorio local (COD 38 %) y eGrow (54-85 %) **se contradicen**. No pude
  resolver la contradicción.
- Cronología de Kobo360: las fuentes dan fechas incompatibles.
- Año de cierre de Sendy.
- Fechas 2027 de la Nairobi International Trade Fair, de las ferias marroquíes y de la
  próxima edición de Destination Africa.
- Requisitos para **anunciar siendo extranjero** en los cinco países. Hueco real.
- Restricciones cambiarias de Egipto y Marruecos aplicadas al cobro de una suscripción.
- Si dLocal / Flutterwave / Paystack admiten a un vendedor colombiano. **Es el dato que
  decide si el proyecto es viable y no lo tengo.**
- Flujo comercial África → Colombia (todas las cifras que encontré son de exportación
  colombiana hacia África).
- Ninguna de las piezas de copy en árabe, suajili o pidgin ha sido revisada por un hablante
  nativo.

---

## Fuentes

- La República — [Exportaciones a África, 1,27 % de 2025](https://www.larepublica.co/economia/exportaciones-a-africa-representaron-solamente-1-3-de-las-ventas-externas-de-2025-4349558)
- Cancillería de Colombia — [Memorando portuario Colombia–Ghana](https://cancilleria.gov.co/sala-de-prensa/noticias/colombia-y-ghana-firman-memorando-para-impulsar-la-cooperacion-portuaria-y-abrir-nuevas-rutas-comerciales-entre-america-latina-y-africa)
- Radio Nacional — [Foro CELAC-África 2026, destinos y cifras](https://radionacional.co/actualidad/conclusiones-foro-celac-africa-2026)
- MinCIT — [Rutas aéreas de carga de Ethiopian Airlines](https://www.mincit.gov.co/prensa/noticias/comercio/colombia-rutas-aereas-de-carga-ethiopian-airlines)
- UNCTAD — [Mercados clave para el café etíope](https://unctad.org/publication/analysis-key-export-markets-ethiopian-coffee-roasters-and-exporters-roasted-coffee)
- WeeTracker / dLocal — [Pagos en África, caída del 17 % del COD](https://weetracker.com/2025/07/08/africa-payments-trends-2025/)
- allbusiness.africa — [Última milla africana](https://allbusiness.africa/insights/african-last-mile-delivery-ecommerce) · [Transporte de carga y cementerio de startups](https://allbusiness.africa/insights/african-road-freight-trucking-2026)
- Ken Research — [Mercado nigeriano de última milla](https://www.kenresearch.com/nigeria-last-mile-delivery-market.md)
- TechEconomy — [Dellyman y Temu](https://www.techeconomy.ng/dellyman-inks-last-mile-deliveries-with-temu)
- BrandSpur — [Auge y caída de Kobo360](https://brandspurng.com/2026/07/20/kobo360s-rise-and-fall-how-a-30-million-startup-ended-up-owing-%E2%82%A610-billion/) · TechCabal — [Inversionistas de Kobo360](https://techcabal.com/2025/03/04/kobo360-investors-sell-equity/)
- Business Front — [Dinero móvil y cuota de M-Pesa](https://businessfront.com/finance/news/kenya-mobile-money-payments-drops/) · Kenya Times — [Caída del 30 %](https://thekenyatimes.com/banking/m-pesa-traffic-slows-as-mobile-money-transactions-drop-30/)
- Research ICT Africa — [RAMP Index Q2 2025](https://researchictafrica.net/2025/07/24/ramp-index-insights-quarter-2-2025/) · [Q1 2025](https://researchictafrica.net/2025/03/31/ramp-index-insights-quarter-1-2025/)
- Prime Business Africa — [Costo del GB en África](https://www.primebusiness.africa/zimbabwe-tops-list-of-africas-most-expensive-mobile-data-as-nigeria-ranks-among-cheapest/) · AllAfrica — [Sudáfrica paga más que 27 países](https://allafrica.com/stories/202602170116.html)
- Oberlo — [Penetración de WhatsApp por país](https://oberlo.com/statistics/who-uses-whatsapp-the-most)
- Connecting Africa — [E-commerce sudafricano 2026](https://www.connectingafrica.com/ecommerce/south-african-e-commerce-spend-to-top-9-9b-in-2026)
- wafir.ma — [Observatorio e-commerce Marruecos, mezcla de pago 2025](https://wafir.ma/fr/etudes/observatoire-ecommerce-maroc-2020-2026-bilan-6-ans-cmi-paiements)
- eGrow — [COD en MENA y Egipto](https://www.egrow.com/en/blog/egypt-ecommerce-statistics-trends-2026) *(fuente débil)*
- Cliffe Dekker Hofmeyr — [POPIA y marketing directo](https://www.cliffedekkerhofmeyr.com/news/publications/2020/technology/tmt-alert-26-august-Direct-marketing-practices-in-the-midst-of-South-Africas-new-era-of-data-protection.html) · Baker McKenzie — [POPIA 2024](https://insightplus.bakermckenzie.com/bm/data-technology/south-africa-direct-marketing-under-scrutiny-key-regulatory-developments-in-2024) · [Notificación del Information Regulator](https://inforegulator.org.za/wp-content/uploads/2020/07/MEDIA-STATEMENT-ENFORCEMENT-NOTICE-ON-DIRECT-MARKETING-COMPLAINT.pdf)
- KPMG Nigeria — [NDPA 2023](https://assets.kpmg.com/content/dam/kpmg/ng/pdf/the-nigeria-data-protection-act-2023.pdf) · Clym — [Alcance de la NDPA](https://www.clym.io/regulations/nigeria-data-protection-act-ndpa)
- PwC Kenya — [Consentimiento bajo la DPA](https://www.pwc.com/ke/en/assets/pdf/consent-lawful-basis-under-kenyas-data-protection-act.pdf) · Clyde & Co — [Sanciones de la ODPC](https://www.clydeco.com/en/insights/2023/10/data-protection-compliance-in-kenya-odpc) · [Reglamento General 2021](https://www.odpc.go.ke/wp-content/uploads/2024/03/THE-DATA-PROTECTION-GENERAL-REGULATIONS-2021-1.pdf)
- Al Tamimi — [Reglamento ejecutivo egipcio y licencia de marketing](https://www.tamimi.com/news/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law) · CMS — [Año de gracia](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins)
- CNDP Marruecos — [Ficha de prospección comercial](https://www.cndp.ma/wp-content/uploads/2025/07/fiche_CNDP_Prospection_RT_fr.pdf)
- ThisDay — [CBN y repatriación de divisas](https://www.thisdaylive.com/2025/01/10/cbn-halts-extension-of-export-proceeds-repatriation/)
- QZ Africa — [GhanaPostGPS y direcciones informales](https://qz.com/africa/1117329/ghanas-ghanapostgps-joins-snoocode-what3words-in-digital-address-systems) · Graphic — [Entregas con dirección digital](https://www.graphic.com.gh/news/general-news/ghanapostgps-records-over-500-000-downloads-in-a-year.html)
- Africa Renewal — [Karité y cooperativas de mujeres](https://africarenewal.un.org/en/magazine/shea-butter-nourishes-opportunities-african-women) · GNA — [Petición de prohibir exportación de nuez cruda](https://gna.org.gh/2025/05/ghana-shea-cooperatives-and-processors-network-calls-on-government-to-ban-raw-shea-exports/)
- RioTimes — [Lagos International Trade Fair 2026](https://www.riotimesonline.com/lagos-international-trade-fair-2026/) · AllAfrica — [Nigeria acoge la IATF 2027](https://allafrica.com/stories/202509050076.html)
- Capterra / G2 / AlternativeTo — [ParcelOps](https://www.capterra.ca/software/1110352/ParcelOps), [Ubezon](https://alternativeto.net/software/ubezon/about) · VC4A — [Borderless HQ](https://vc4a.com/ventures/borderless-hq)
- GIG Logistics — [Red de centros](https://giglogistics.com/)
