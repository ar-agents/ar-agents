# Un estándar abierto y verificable para el registro de operaciones de las empresas de IA en Argentina

*Resumen para decisores — 1 página, sin tecnicismos. Autor: Nazareno Clemente · naza@helloastro.co · /arg (ar-agents.vercel.app)*

---

**Qué es.** Cuando un agente de IA opera de verdad —cobra, factura, contrata, decide— tiene que quedar un registro de lo que hizo que **nadie pueda alterar después sin que se note**, para que un regulador, un auditor o un juez puedan revisarlo. Construimos ese estándar de forma abierta, junto con la herramienta para verificarlo. Es gratuito, de código abierto, y ya está implementado.

**Por qué le importa al Estado argentino.** Si Argentina crea la figura de la sociedad de IA, la norma va a necesitar señalar **una especificación técnica concreta** de "qué registro de operaciones debe llevar obligatoriamente cada una". Sin eso, cada empresa inventa el suyo y el resultado es inauditable. Esto es esa especificación, lista para ser citada en la norma. No depende de que la ley se apruebe: también sirve para empresas con dueños humanos que quieran operar con trazabilidad seria.

**La parte clave: cualquiera lo verifica sin confiar en nosotros.** El estándar viene con una herramienta diminuta que un regulador, un periodista o usted mismo corre **en un solo comando, sin conexión y sin instalar nada**, para comprobar que la matemática es real y que un registro no fue manipulado. No hay que confiar en nuestra palabra: se comprueba. Además, el diseño fue **sometido a dos auditorías de seguridad hostiles e independientes**; los problemas que encontraron están corregidos y la corrección, a su vez, verificada. Incluso protege contra el caso más difícil: que **el que manipule sea la propia empresa** que lleva el registro.

**Qué NO estamos pidiendo.** No pedimos dinero, ni un contrato, ni exclusividad, ni una reunión. Es abierto (licencias MIT / CC-BY): se puede leer, usar, criticar y copiar libremente. Está disponible por si resulta útil. Si algo ayudara, sería simplemente: que el equipo que redacte el marco lo tenga como referencia técnica, y feedback de quien lo revise.

**Cómo verlo (un minuto).**
- El estándar y el porqué: **ar-agents.vercel.app** (ver RFC-004, RFC-005 y RFC-006).
- Verificarlo usted mismo, sin confiar en nadie:
  `node tools/arg-verify/arg-verify.mjs vectors` → debe imprimir **ALL VECTORS PASS**.
- Repositorio abierto: github.com/ar-agents/ar-agents
- Contacto: Nazareno Clemente — naza@helloastro.co

> En una frase: **construimos, abierto y desde afuera, la pieza técnica de confianza que el régimen de sociedades de IA va a necesitar — y cualquiera puede comprobar que funciona en un comando, sin confiar en nosotros.**

---

### English TL;DR (for international press / forwarding)

We built — open-source, from outside government — the **verifiable audit-log standard** an AI-company legal regime needs: a tamper-evident operational record every AI company would keep, plus a **zero-dependency tool anyone runs in one command, offline, to verify it without trusting us**. It survived **two independent hostile security reviews** (all critical issues fixed and re-verified), including defence against the operator itself forging its own logs. It's free (MIT/CC-BY), implemented, and ready to be cited by legislation. We're not asking for money, a contract, or a meeting — only that whoever drafts the framework use it as the technical reference. See **ar-agents.vercel.app**; reproduce it with `node tools/arg-verify/arg-verify.mjs vectors`. Contact: Nazareno Clemente, naza@helloastro.co.
