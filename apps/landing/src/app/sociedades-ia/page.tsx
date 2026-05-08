import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

const AGENT_FLOW = `// Mock transcript: una sociedad-IA "ACME-AI SAS" se incorpora,
// cobra clientes, y opera en Argentina end-to-end.

▶ user: Necesito constituir una sociedad-IA, conseguir CUIT, abrir cuenta
        MP, emitir mi primera factura y mandar WhatsApp al cliente.

  → @ar-agents/igj
    igj_search_entities({ query: "ACME-AI", tipos: ["sas"] })
      ← results: []
      ← coverageNote: "Dataset es muestreo, no real-time..."
    Entidad disponible. Procedo con la constitución.

  → @ar-agents/firma-digital
    firma_inspect_cert({ cert_pem: "<oficial-digital>" })
      ← cuit: "20417581015", isOntiIssued: true, commonName: "Naza Clemente"
    Oficial digital validado.

  → @ar-agents/identity
    validate_cuit({ cuit: "30-12345678-9" })
      ← valid: true, personType: "juridica"
    lookup_cuit_afip({ cuit: "30123456789" })
      ← name: "ACME-AI SAS", taxCondition: "monotributo_a"

  → @ar-agents/banking
    list_psps()
      ← Mercado Pago, Ualá, Naranja X...
    get_usd_oficial({ lookback_days: 7 })
      ← latest: { fecha: "2026-05-08", valor: 1250.50 }

  → @ar-agents/mercadopago
    create_customer({ email: "cliente@example.com" })
      ← id: "cust_abc123"
    create_subscription({ amount: 50000, frequency: "monthly", ... })
      ← id: "sub_xyz789"
      ← init_point: "https://mercadopago.com.ar/subscriptions/..."

  → @ar-agents/facturacion
    emitir_factura({ tipo: "C", monto: 50000, cuit_cliente: "20..." })
      ← cae: "67891234567890", numero: "0001-00000001"

  → @ar-agents/whatsapp
    send_template({ to: "+5491123456789", template: "factura_lista" })
      ← message_id: "wamid.xxx"

  → @ar-agents/boletin-oficial
    bo_subscribe({ owner_id: "acme-ai", cuit: "30123456789" })
      ← id: "sub_bo_1", match: { cuit: "30123456789" }
    Suscrito a notificaciones BO sobre el CUIT propio.

✓ assistant: Listo. Sociedad-IA operando: CUIT registrado, MP cobrando,
            factura electrónica emitida, cliente notificado por WhatsApp,
            BO monitoreado. Tu sociedad-IA está en producción.

  Tiempo total: ~12 segundos (12 llamadas a tools, 9 packages /arg de los 16 disponibles).`;

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
1. Constitución (datos abiertos) IGJ datos.jus.gob.ar     ✅ @ar-agents/igj
2. Constitución (acta inscripta) IGJ portal directo       🟡 parcial (TAD)
3. Obtención de CUIT          ARCA padrón                 ✅ @ar-agents/identity
4. Validación CUIT vs gob     AFIP WSCDC                  ✅ @ar-agents/identity
5. Apertura cuenta bancaria   CBU + Modo / MP             ✅ @ar-agents/banking
                                                            + @ar-agents/mercadopago
6. Inscripción monotributo    AFIP WSFE setup             ✅ @ar-agents/facturacion
7. Identidad firmante         OIDC gov                    ✅ @ar-agents/mi-argentina
8. Firma de actas societarios Cert ONTI / AC-Raíz         ✅ @ar-agents/firma-digital
9. Facturación electrónica    AFIP WSFE                   ✅ @ar-agents/facturacion
10. Cobro suscripciones       MP Subscriptions            ✅ @ar-agents/mercadopago
11. Atención al cliente       WhatsApp Business           ✅ @ar-agents/whatsapp
12. Verificación KYC contrap. RENAPER + bypass            ✅ @ar-agents/identity-attest
13. Riesgo crediticio terceros BCRA Central de Deudores   ✅ @ar-agents/banking
14. Logística                 Andreani / OCA / Correo     ✅ @ar-agents/shipping
15. Notificaciones legales    Boletín Oficial monitoring  ✅ @ar-agents/boletin-oficial
16. Variables macro (USD/CER) BCRA Principales Variables  ✅ @ar-agents/banking
17. Domicilio legal digital   GDE / TAD                   🟡 lectura @ar-agents/gde-tad
                                                            (DEC inbox + IGJ pre-flight;
                                                            escritura tras RFC-001 § 3.4)`}
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

      <DocH2>Demo: una sociedad-IA en producción</DocH2>
      <DocP>
        Transcripción de un agente Claude usando el toolkit{" "}
        <DocCode>/arg</DocCode> para incorporar y operar una sociedad-IA
        ficticia (&ldquo;ACME-AI SAS&rdquo;). Las llamadas son reales — los
        datos son mock para evitar pegarle a producción.
      </DocP>
      <DocBlock>{AGENT_FLOW}</DocBlock>

      <DocH2>Wizard de incorporación + demo deployable</DocH2>
      <DocP>
        El wizard live en{" "}
        <a href="/incorporar" style={{ color: "inherit", textDecoration: "underline" }}>
          /incorporar
        </a>{" "}
        genera la configuración de un repo Next.js con las 16 piezas
        cableadas, corre el pre-flight de IGJ en vivo (mismas reglas que el
        tool <DocCode>validate_igj_inscription</DocCode>), y emite el bundle
        listo para deployar a Vercel. Para los devs que prefieren ir
        directo al template, el código vive en{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          apps/sociedad-ia-starter
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
