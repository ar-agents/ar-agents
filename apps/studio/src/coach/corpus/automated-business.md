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

## Cost-plus vs. precio por valor

- Cobrar un multiplo del costo de inferencia estimado es una heuristica de
  partida valida para un servicio agentico: cubre el costo directo, la
  variabilidad de uso real, y deja margen para infraestructura, soporte y
  utilidad del negocio. El numero exacto es una decision de cada negocio, no
  un valor fijo: no hay un multiplicador "correcto" universal.
- Ese numero no es un techo ni un piso fijo: en mercados con competencia de
  precio baja hacia el costo real; en mercados donde el resultado vale mucho
  para el cliente (no el costo de producirlo) el precio se ancla al valor,
  no al costo.
- Publicar el MODELO de precio (cuando se cobra, sobre que se mide) genera
  confianza. Publicar la MECANICA exacta (el multiplicador, la formula) no
  es necesario para esa confianza y muchos negocios agenticos, con razon, la
  mantienen privada: es informacion de margen, no de honestidad con el
  cliente.

## Señales de alerta al validar una idea automatizable

- Si el "MVP automatizado" en realidad esconde un humano haciendo el
  trabajo manualmente detras de escena de forma permanente (no como
  concierge temporal de aprendizaje, sino como plan final), no es un
  negocio automatizable, es una operacion con sueldos disfrazada de
  software.
- Si ningun proveedor ni cliente relevante tiene una API disponible hoy, el
  negocio probablemente depende de terceros humanos en el camino critico y
  conviene revisar el diseño antes de constituir la sociedad.
