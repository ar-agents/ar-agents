/**
 * corpus.ts is the compiled form of `src/coach/corpus/*.md`. Bundling raw
 * `.md` imports needs extra loader config, so each corpus file is mirrored
 * here verbatim as a TS string constant. When a `.md` file under
 * `src/coach/corpus/` changes, update its matching constant below to match.
 *
 * `CORPUS_DIGEST` is a separate, hand-written condensed version (not a
 * mirror of any single file): it is what actually goes into the coach
 * system prompt on every turn, kept short on purpose so the corpus does not
 * blow up the per-message token cost. The full `*_MD` constants exist for
 * reference, tests, and any future surface that wants the complete text
 * (e.g. a "read the sources" panel in the UI).
 */

export const LEAN_STARTUP_MD = `
# Lean startup

Fuente/uso: principios propios, distilados de la metodologia "Lean Startup" de
Eric Ries (libro "The Lean Startup", 2011) y de la practica de Y Combinator.
Sin copiar texto original; uso interno para el prompt del coach.

## Build-measure-learn

- Toda idea de negocio es un conjunto de hipotesis, no un hecho. El ciclo
  build-measure-learn existe para convertir esas hipotesis en conocimiento
  validado lo mas rapido y barato posible.
- Orden real del ciclo: primero definis que vas a medir y que resultado
  confirmaria o mataria la hipotesis, despues construis lo minimo necesario
  para generar esa medicion, despues medis, despues aprendes.
- La velocidad del ciclo importa mas que la calidad de cada vuelta individual.
  Un founder que da tres vueltas chapuceras aprende mas que uno que da una
  vuelta perfecta.
- Metricas de vanidad (visitas, descargas, usuarios registrados sin uso real)
  no sirven para decidir nada. Buscá metricas accionables: conectadas a un
  comportamiento que podes causar y que predice el resultado que te importa
  (retencion, pago, referidos).

## Disciplina de MVP

- El MVP (producto minimo viable) no es una version reducida del producto
  final: es el experimento mas chico que te da aprendizaje valido sobre la
  hipotesis mas riesgosa.
- La hipotesis mas riesgosa casi nunca es tecnica ("¿puedo construirlo?").
  Casi siempre es de valor ("¿alguien lo quiere lo suficiente como para
  actuar?") o de crecimiento ("¿como se entera la proxima persona?").
- Un MVP puede no tener nada de "producto": un concierge manual, una landing
  con un boton que no hace nada todavia, un video demo. Lo que define al MVP
  es la pregunta que responde, no la tecnologia.
- Automatizar antes de validar es la forma mas comun de desperdiciar tiempo
  de founder. Primero probá el proceso a mano (aunque no escale), automatizá
  recien cuando el proceso probo que genera valor.

## Aprendizaje validado

- "Aprendizaje validado" es evidencia empirica de un comportamiento real de
  usuarios, no una opinion, no un halago en una entrevista, no un numero de
  encuesta sobre intencion futura.
- Una entrevista te da intuicion sobre el problema; solo una accion real
  (pagar, volver, invitar a alguien, cancelar) valida o mata la hipotesis.
- Cada experimento necesita un criterio de exito definido ANTES de correrlo.
  Sin ese numero previo, cualquier resultado se puede racionalizar como
  exito despues del hecho.

## Tipos de pivot

Un pivot es un cambio estructurado de una hipotesis central, manteniendo el
aprendizaje acumulado. No es "tirar todo y empezar de cero". Tipos utiles
para reconocer en una conversacion de coaching:

- Zoom-in: una sola funcionalidad se convierte en el producto entero.
- Zoom-out: el producto pasa a ser una funcionalidad dentro de algo mas
  grande.
- Segmento de cliente: mismo producto, pero para un tipo de cliente distinto
  al que imaginaste.
- Necesidad del cliente: mismo cliente, pero resulta que el problema real
  que le importa es otro distinto al que atacaste primero.
- Plataforma: pasar de aplicacion a plataforma (o al reves), cambiando quien
  controla la logica de negocio.
- Arquitectura de negocio: cambiar entre modelo de alto margen/bajo volumen
  y bajo margen/alto volumen (B2B vs B2C suele ser este pivot).
- Captura de valor: cambiar como monetizas (de gratis a pago, de una vez a
  suscripcion, de licencia a comision) sin cambiar el producto.
- Motor de crecimiento: cambiar entre viral, pago y recurrente como fuente
  principal de nuevos usuarios.
- Canal: mismo producto, distinto canal de distribucion o venta.
- Tecnologia: misma solucion al mismo problema, pero con una tecnologia de
  base distinta (suele pasar cuando aparece una plataforma nueva mas barata
  o mas capaz).

En una conversacion de coaching, si la validacion falla, el objetivo es
identificar CUAL de estos pivots aplica, no descartar la idea entera.
`;

export const PAUL_GRAHAM_MD = `
# Paul Graham (ensayos de paulgraham.com)

Fuente/uso: principios propios, distilados a partir de los ensayos de Paul
Graham listados abajo (paulgraham.com, cofundador de Y Combinator). Cada
punto es una paráfrasis de la idea central del ensayo, no una cita textual.
Los ensayos originales están en ingles; los links son la fuente autoritativa.
Uso interno para el prompt del coach, no reproducir el texto original.

## Hacer cosas que no escalan
Fuente: "Do Things that Don't Scale" — https://paulgraham.com/ds.html

- Ningun startup crece organicamente al principio. Los primeros usuarios casi
  siempre se consiguen a mano, uno por uno, no con un lanzamiento.
- El trabajo manual intensivo con los primeros usuarios (onboarding personal,
  atencion desproporcionada, hacer a mano lo que despues el producto
  automatiza) no es ineficiencia: es la unica forma de aprender que necesitan
  de verdad.
- Conviene arrancar en un mercado deliberadamente chico y concentrado antes
  de abrir a todos; asi se llega mas rapido a una masa critica real.
- Grandes lanzamientos y partnerships corporativos rinden menos de lo que
  parece; la adquisicion sostenida de usuarios, persona a persona, importa
  mas.

## Como conseguir ideas de startup
Fuente: "How to Get Startup Ideas" — https://paulgraham.com/startupideas.html

- Las mejores ideas no se inventan por sesion de brainstorming: aparecen
  cuando estas metido de lleno en un campo que cambia rapido y notas un
  problema real, propio.
- Buscá primero problemas que vos mismo sufrís. La frustracion genuina con
  el estado actual de las cosas es una señal mas confiable que una encuesta.
- Es mejor un producto que un grupo chico necesita con desesperacion, que uno
  que a mucha gente le resulta tibiamente simpatico.
- Las ideas "poco sexys" o tediosas son las que la mayoria descarta por
  sesgo; ahi suele haber oportunidad sin competencia.

## Default alive o default dead
Fuente: "Default Alive or Default Dead?" — https://paulgraham.com/aord.html

- Todo founder deberia poder responder, con los numeros actuales de gasto y
  crecimiento, si la empresa llega sola a ser rentable ("default alive") o no
  ("default dead"). No saberlo es el riesgo en si mismo.
- Separá explicitamente los hechos (lo que pasa con las metricas actuales) de
  las esperanzas (lo que pasaria SI conseguis mas inversion). Mezclarlos es
  el error mas comun.
- Nunca trates levantar capital como el unico plan; el plan B (sobrevivir sin
  esa plata) tiene que estar escrito y ser concreto.
- Contratar de mas para "acelerar" cuando el problema real es que el
  producto todavia no engancha, suele apurar la muerte del startup, no
  evitarla.

## Relentlessly resourceful
Fuente: "Relentlessly Resourceful" — https://paulgraham.com/relres.html

- La cualidad que mas distingue a un founder que funciona no es la
  terquedad: es la combinacion de determinacion con adaptacion constante de
  metodo. Los obstaculos de un startup son impredecibles, asi que la
  respuesta correcta tambien tiene que serlo.
- No es "insistir con lo mismo hasta que funcione"; es probar un camino, y si
  no funciona, probar otro, sin soltar el objetivo.
- Es un buen filtro para elegir cofounders: ante un obstaculo nuevo, ¿la
  persona busca un camino distinto o se frena?

## Make something people want
Fuente: "Be Good" — https://paulgraham.com/good.html (origen del lema de YC)

- Priorizar el valor real para el usuario por encima de la extraccion de
  ingresos de corto plazo no es solo etica: en la practica atrae mejores
  empleados, inversores y socios.
- Tener una mision real (ayudar a gente concreta que depende de tu producto)
  sostiene la motivacion del founder en las crisis inevitables mejor que
  perseguir metricas de vanidad.
- Ante cualquier decision de producto ambigua, "¿que es mejor para el
  usuario?" es una heuristica simple y confiable, mas facil de sostener en
  el tiempo que optimizar ingresos de corto plazo.

## Founder mode
Fuente: "Founder Mode" — https://paulgraham.com/foundermode.html

- Delegar en bloque como si cada area fuera una caja negra (el manual de
  management tradicional) no funciona igual en un startup temprano; el
  founder necesita mantenerse metido en el detalle sustantivo, no solo
  gerenciar reportes directos.
- Interactuar directo con niveles no inmediatos del equipo ("skip-level"),
  cuando la empresa todavia es chica, es normal y sano, no una señal de mal
  management.
- Cuanta autonomia dar varia persona a persona y se gana con el tiempo; no es
  una regla rigida de estructura organizativa.

## Como hacer un gran trabajo
Fuente: "How to Do Great Work" — https://paulgraham.com/greatwork.html

- El buen trabajo aparece en la interseccion entre lo que tenes aptitud
  natural para hacer y lo que genuinamente te interesa, no en lo que parece
  prestigioso desde afuera.
- Conviene navegar "a favor del viento" (perseguir en cada momento lo mas
  interesante, manteniendo opciones abiertas) en vez de seguir un plan
  detallado fijado de antemano.
- Arrancar con la version mas simple posible que podria funcionar, e iterar
  version tras version en base a feedback real, rinde mas que planificar el
  resultado final de antemano.

## Otros ensayos relevantes (no distilados en detalle aca)

- "Startups = Growth" — https://paulgraham.com/growth.html
- "The 18 Mistakes That Kill Startups" — https://paulgraham.com/startupmistakes.html
- "How to Start a Startup" — https://paulgraham.com/start.html
`;

export const AUTOMATED_BUSINESS_MD = `
# Que hace automatizable un negocio con agentes

Fuente/uso: principios propios de ar-agents, distilados de la practica de
construir sociedades automatizadas (ver docs/NORTH-STAR.md y ROADMAP.md del
repo). Uso interno para el prompt del coach.

## Condiciones minimas

- Flujo digital repetible: el trabajo se puede describir como una secuencia
  de pasos que no cambian de forma en cada instancia (input -> proceso ->
  output), aunque el contenido de cada instancia sea distinto.
- Cumplimiento low-touch: cada paso se puede ejecutar sin que un humano
  tenga que estar presente en el momento, ni para hacerlo ni para aprobarlo
  en el camino critico. El humano puede supervisar despues, no antes.
- Alcanzable por API: tanto los proveedores (pagos, infraestructura, datos)
  como los clientes (canal de entrada y de entrega) tienen una interfaz
  programable. Si un paso depende de un tramite presencial o una llamada
  telefonica humana, ese paso no es automatizable todavia.
- Economia unitaria medible: se puede calcular el costo marginal de una
  transaccion (incluido el costo de los modelos que la procesan) y el
  ingreso marginal que genera, para saber si el negocio da margen positivo
  por unidad, no solo en agregado.
- Humano en el loop solo para juicio, no para ejecucion: la intervencion
  humana se reserva para decisiones que requieren criterio o que son
  irreversibles (aprobar un gasto grande, aceptar un contrato, constituir
  la sociedad), nunca para pasos mecanicos que un agente puede hacer solo.

## Costo de tokens como costo de mercaderia vendida (COGS)

- Cada llamada a un modelo (de lenguaje, de imagen, de voz) es un costo
  variable directamente atribuible a producir una unidad de servicio: es
  COGS, no gasto operativo fijo.
- Esto cambia como se piensa el pricing: el margen de un negocio agentico
  depende del ratio entre lo que el cliente paga y lo que cuesta la
  inferencia que resuelve su pedido, tanto como del volumen.
- Elegir el modelo correcto por paso (uno barato para tareas de rutina, uno
  caro solo donde el resultado lo justifica) es una decision de unit
  economics, no solo de calidad de producto.
- Medir el costo real de tokens por transaccion desde el dia uno evita
  descubrir tarde que el negocio pierde plata en cada unidad que vende.

## La realidad del precio 5x

- Una heuristica de partida razonable para un servicio agentico es cobrar
  alrededor de 5 veces el costo de inferencia estimado: cubre el costo
  directo, la variabilidad de uso real, y deja margen para infraestructura,
  soporte y utilidad del negocio.
- Ese multiplicador no es un techo ni un piso fijo: en mercados con
  competencia de precio baja hacia el costo real; en mercados donde el
  resultado vale mucho para el cliente (no el costo de producirlo) el precio
  se ancla al valor, no al costo, y puede superar holgadamente el 5x.
- Mostrarle al usuario el costo estimado y el precio resultante de forma
  transparente (como hace este mismo producto en su dashboard) genera
  confianza y es mas facil de defender que un precio opaco.

## Señales de alerta al validar una idea automatizable

- Si el "MVP automatizado" en realidad esconde un humano haciendo el
  trabajo manualmente detras de escena de forma permanente (no como
  concierge temporal de aprendizaje, sino como plan final), no es un
  negocio automatizable, es una operacion con sueldos disfrazada de
  software.
- Si ningun proveedor ni cliente relevante tiene una API disponible hoy, el
  negocio probablemente depende de terceros humanos en el camino critico y
  conviene revisar el diseño antes de constituir la sociedad.
`;

export const ARGENTINA_MD = `
# Contexto Argentina para coaching (no es asesoria legal)

Fuente/uso: contexto operativo propio para orientar la conversacion de
coaching en Argentina. Esto NO es asesoria legal ni impositiva. Los montos,
categorias y requisitos cambian con el tiempo; el usuario tiene que
verificar los valores vigentes en AFIP/ARCA e IGJ antes de decidir. La
sociedad automatizada (sociedad-ia) descripta abajo depende de un
anteproyecto de reforma a la Ley General de Sociedades todavia no
sancionado: nada de esto reemplaza a un abogado o contador.

## Monotributo

- Es un regimen simplificado para personas fisicas con facturacion baja:
  un pago mensual unico reemplaza impuesto a las ganancias, IVA y aportes
  jubilatorios/obra social dentro de ciertos topes.
- Se organiza en categorias (de la mas baja a la mas alta) segun la
  facturacion anual, entre otros parametros; superar el tope de la
  categoria mas alta obliga a pasar a un regimen general (monotributo no
  sirve para cualquier volumen de negocio).
- Para un founder validando una idea chica, sola, sin socios, es tipicamente
  el punto de entrada mas simple para empezar a facturar de forma legal
  mientras valida.
- No sirve como estructura si el negocio va a tener socios, va a levantar
  inversion, o va a operar a traves de una sociedad (una persona juridica
  necesita su propia inscripcion, distinta de la del founder como persona
  fisica).

## SAS (Sociedad por Acciones Simplificada)

- Es el tipo societario mas usado hoy para constituir rapido una sociedad
  comercial en Argentina, tramite mayormente digital, sin necesitar un
  capital inicial grande.
- El capital minimo requerido se fija en relacion al salario minimo vital y
  movil vigente y varia cuando ese salario se actualiza: no asumir un monto
  fijo, verificar el valor actual antes de definir el capital social del
  borrador.
- Una SAS tiene su propio CUIT, su propia facturacion y sus propias
  obligaciones impositivas, separadas de las de sus socios.

## Sociedad automatizada (sociedad-ia)

- Es el tipo societario que el anteproyecto de reforma (art. 14 y 102 de la
  Ley General de Sociedades) habilitaria para una sociedad operada por
  agentes autonomos, con un administrador humano responsable.
- Mientras el anteproyecto no este sancionado, cualquier "constitucion" en
  este producto es una simulacion (LAW_STATUS=pre): no inscribe nada ante
  un organismo real. Hay que ser explicito con el usuario sobre esto en
  cada paso, nunca dar a entender que ya existe legalmente.
- El diseño (borrador, capital, objeto, administrador) igual sirve como
  ejercicio de spec real: cuando la ley exista, el mismo borrador es la
  base para constituir de verdad.

## Facturacion y pagos

- Emitir factura (electronica, via AFIP/ARCA) es obligatorio para casi
  cualquier actividad economica formal en Argentina, sea monotributista o
  sociedad.
- Mercado Pago es el riel de cobro por default a considerar para un negocio
  digital en Argentina: cobertura amplia de medios de pago locales,
  integracion API razonable, reconocimiento del usuario final. No es la
  unica opcion, pero es el default razonable para no perder tiempo evaluando
  alternativas en una validacion temprana.
- Para un negocio con clientes fuera de Argentina, el cobro en dolares y el
  ingreso de esas divisas tiene reglas cambiarias propias que cambian con
  frecuencia: no asumir que "cobrar en el exterior" es trivial sin
  verificarlo.
`;

/**
 * Compact digest actually injected into the coach system prompt. Distilled
 * from the four corpus files above; kept short (well under 1000 words) so
 * the corpus does not dominate the per-message token cost. Not a substitute
 * for the full files: it is a working memory of the headline judgment
 * calls, not the reasoning behind them.
 */
export const CORPUS_DIGEST = `
Principios de juicio para coachear (resumen; fuentes completas en src/coach/corpus/*.md):

Lean startup: toda idea es un conjunto de hipotesis, no un hecho. Empujá
siempre hacia el experimento mas chico que valida la hipotesis mas
riesgosa (casi nunca es tecnica, casi siempre es "¿alguien lo quiere de
verdad?"). Solo una accion real (pagar, volver, invitar) es aprendizaje
validado; una opinion en una entrevista no lo es. Si la validacion falla,
identificá que tipo de pivot aplica (segmento, necesidad, canal, captura de
valor, etc.) en vez de descartar la idea entera.

Paul Graham (paulgraham.com, links completos en el corpus): los primeros
usuarios se consiguen a mano, uno por uno, nunca con un lanzamiento grande.
Las mejores ideas nacen de un problema que el propio founder sufre, en un
campo que conoce a fondo, no de una sesion de brainstorming. Todo founder
deberia poder decir si su negocio es "default alive" o "default dead" con
los numeros actuales, sin contar con levantar mas capital. La cualidad que
mas separa a founders que funcionan es ser "relentlessly resourceful":
determinacion combinada con cambiar de metodo ante cada obstaculo nuevo, no
terquedad ciega. La pregunta "¿que es mejor para el usuario?" es la
heuristica de decision mas confiable en momentos ambiguos.

Negocio automatizable con agentes: para que un negocio sea automatizable
necesita flujo digital repetible, cumplimiento low-touch, proveedores y
clientes alcanzables por API, economia unitaria medible, y humano en el
loop solo para juicio (nunca para ejecucion mecanica). El costo de tokens
es COGS, no gasto fijo: el margen depende del ratio entre precio e
inferencia. 5x el costo estimado es un punto de partida razonable de
pricing, no una regla fija; en mercados de alto valor percibido el precio
se ancla al valor, no al costo. Un "MVP automatizado" que en realidad es un
humano trabajando detras de escena de forma permanente no es un negocio
automatizable.

Contexto Argentina (no es asesoria legal; ver corpus para el detalle):
monotributo sirve para un founder solo con facturacion baja, no para
sociedades ni socios. Una SAS es el vehiculo societario mas rapido de
constituir hoy; su capital minimo esta atado al salario minimo vigente,
hay que verificarlo, no asumir un monto. La sociedad automatizada
(sociedad-ia, art. 14/102) depende de un anteproyecto todavia no
sancionado: cualquier constitucion en este producto es una simulacion
(LAW_STATUS=pre), nunca decir que se inscribio algo real. Mercado Pago es
el riel de cobro por default a considerar en Argentina.
`;
