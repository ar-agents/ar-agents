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
