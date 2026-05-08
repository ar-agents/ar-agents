import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Sociedades de IA",
  description:
    "Implementación de referencia de sociedades de IA en Argentina. Cómo una empresa 100% IA se incorpora, factura, paga monotributo, atiende clientes — usando /arg.",
  alternates: { canonical: "https://ar-agents.vercel.app/sociedades-ia" },
};

export default function SociedadesIAPage() {
  return (
    <DocShell
      eyebrow="/arg · sociedades de IA"
      title="Implementación de referencia."
      subtitle="Cuando exista la sociedad de IA del proyecto Sturzenegger, así se va a integrar con el Estado argentino. Y ya lo shipeamos."
    >
      <DocH2>El plan, en una línea</DocH2>
      <DocP>
        El Ministro de Desregulación Federico Sturzenegger anunció el 28 de
        abril de 2026 (en{" "}
        <a
          href="https://www.iprofesional.com/economia/453561-sociedades-de-inteligencia-artificial-inedita-apuesta-de-federico-sturzenegger"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Expo EFI
        </a>
        ) un proyecto para reformar la Ley de Sociedades Comerciales y
        crear un nuevo tipo de entidad: <DocCode>sociedad de IA</DocCode>{" "}
        — una empresa con cero accionistas humanos, cero directores
        humanos, cero empleados humanos. Solo código que decide, opera y
        genera ingresos. Pagaría impuestos como cualquier SA o SRL.
      </DocP>
      <DocP>
        Sturzenegger lo pintó así:{" "}
        <em>
          &ldquo;Si en 10 años el 90% del PBI mundial lo producen agentes
          de IA, queremos que ese régimen jurídico esté en Argentina.
          Podríamos tener 50 millones de habitantes y 500 millones de
          agentes de IA incorporados acá, produciendo para el mundo y
          pagando impuestos en nuestro país&rdquo;
        </em>
        .
      </DocP>

      <DocH2>Lo que una sociedad IA va a necesitar (en código)</DocH2>
      <DocP>
        Asumiendo que el proyecto avanza tal cual está planteado, una
        empresa-agente debería poder hacer todo el ciclo de incorporación
        + operación sin intervención humana. Mapeo lo que falta para cada
        paso, y la cobertura actual del toolkit /arg:
      </DocP>
      <DocBlock>
        {`PASO                          REQUIERE                    COBERTURA /arg
─────────────────────────────────────────────────────────────────────────
1. Constitución               IGJ + escritura digital     ❌ pendiente IGJ API
2. Obtención de CUIT          ARCA padrón                 ✅ @ar-agents/identity
3. Validación CUIT vs gob     AFIP WSCDC                  ✅ @ar-agents/identity
4. Apertura cuenta bancaria   CBU + Modo / MP             ✅ @ar-agents/banking
                                                            + @ar-agents/mercadopago
5. Inscripción monotributo    AFIP WSFE setup             ✅ @ar-agents/facturacion
6. Identidad firmante         OIDC gov                    ✅ @ar-agents/mi-argentina
7. Facturación electrónica    AFIP WSFE                   ✅ @ar-agents/facturacion
8. Cobro suscripciones        MP Subscriptions            ✅ @ar-agents/mercadopago
9. Atención al cliente        WhatsApp Business           ✅ @ar-agents/whatsapp
10. Verificación KYC contrap. RENAPER + bypass            ✅ @ar-agents/identity-attest
11. Riesgo crediticio terceros BCRA Central de Deudores   ✅ @ar-agents/banking
12. Logística                 Andreani / OCA / Correo     ✅ @ar-agents/shipping
13. Notificaciones legales    Boletín Oficial monitoring  ✅ @ar-agents/boletin-oficial
14. Variables macro (USD/CER) BCRA Principales Variables  ✅ @ar-agents/banking
15. Domicilio legal digital   GDE / TAD                   ❌ pendiente
16. Designación de oficial    Mi Argentina + firma        🟡 parcial`}
      </DocBlock>

      <DocH2>Por qué importa que esto sea OSS</DocH2>
      <DocP>
        Si la primera sociedad IA de Argentina necesita pagar a una
        consultora USD 200k para integrarse al Estado, el experimento
        muere. Si una /arg-grade sociedad IA se monta en una semana con
        npm + Vercel + un cert ARCA, escala.
      </DocP>
      <DocP>
        El timeline político del proyecto es 6-18 meses. El timeline de
        infrastructure shipeable, ya. La ventana para definir el estándar
        técnico es ahora — antes de que aparezca el draft del proyecto en
        Boletín Oficial.
      </DocP>

      <DocH2>Demo + repro pendiente</DocH2>
      <DocP>
        Próximo hito: un app deployable a Vercel que monta una{" "}
        <em>sociedad IA mock</em> end-to-end —{" "}
        <DocCode>npx create-arg-sociedad mi-empresa-ia</DocCode> — y
        ejercita las 14 piezas de /arg que ya están listas, dejando los 2
        gaps (IGJ + GDE) marcados explícitamente. Si querés contribuir,
        hay un issue abierto:{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/issues"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents/issues
        </a>
        .
      </DocP>

      <DocH2>Caveats</DocH2>
      <DocP>
        El proyecto Sturzenegger no tiene texto publicado todavía — todo
        es retórica + slides + entrevistas. Puede morir en Congreso,
        cambiar de forma, o terminar siendo otra cosa. El toolkit /arg
        funciona y sirve igual: cubre la integración del Estado argentino
        para empresas humanas hoy. Si llega la sociedad IA, está listo
        para ese caso también.
      </DocP>
      <DocP>
        No hay relación entre /arg y los integrantes del gobierno. Esto es
        infraestructura civil-comercial-OSS, escrita por afuera y para que
        la use cualquiera.
      </DocP>
    </DocShell>
  );
}
