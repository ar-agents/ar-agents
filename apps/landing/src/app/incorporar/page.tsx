import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { IncorporarWizard } from "./wizard";
import { IncorporarPrompt } from "./prompt-mode";
import { IncorporarJsonLd } from "../json-ld";

export const metadata: Metadata = {
  title: "Creá tu sociedad automatizada · 10 minutos",
  description:
    "Wizard que genera el repositorio + config + Vercel deploy para una sociedad automatizada argentina. 16 piezas pre-cableadas. RFC-001 governance. MIT.",
  alternates: { canonical: "https://ar-agents.ar/incorporar" },
};

export default function IncorporarPage() {
  return (
    <DocShell
      eyebrow="incorporar · alpha"
      title="Creá tu sociedad automatizada."
      subtitle="Wizard pre-lanzamiento. Te genera el repo, los env vars, el Vercel deploy y la lista de pasos legales para constituir una sociedad automatizada en Argentina cuando se sancione la ley. El anteproyecto de Ley General de Sociedades está en el Senado y todavía no es ley. Hoy podés operar como SAS estándar con todo el stack agentic ya cableado."
    >
      <DocBlock>
        <DocP>
          No es un formulario que completa un chatbot. Es la salida de la
          cadena{" "}
          <DocCode>plan → repo → deploy → cert → operación</DocCode> que
          la librería <DocCode>@ar-agents/*</DocCode> implementa. El
          wizard te configura todo lo que es código. Lo que requiere
          presencia legal humana (representante, certificado AFIP,
          registro IGJ) lo dejamos como checklist al final.
        </DocP>
        <DocP>
          ¿Cuánto tarda? El código corre en 10 minutos. El AFIP cert + el
          alta IGJ tardan 5-10 días hábiles. La sociedad automatizada
          propiamente dicha (RFC-001 § 3.4) tarda lo que tarde el
          Congreso. Mientras tanto: SAS con LLM-agent operator + RFC-001
          liability framework.
        </DocP>
      </DocBlock>

      <DocH2>Describilo en una frase</DocH2>
      <DocP>
        Contá qué hace tu sociedad y el agente la estructura: denominación,
        objeto, capital y las piezas que necesita. Es un preview en vivo, no
        constituye nada. El acto legal lo aprueba una persona (art. 102).
      </DocP>
      <IncorporarPrompt />

      <DocH2>O configurá paso a paso</DocH2>

      <IncorporarWizard />

      <DocH2>Lo que incluye</DocH2>
      <DocP>
        <strong>Existir como entidad</strong> · IGJ pre-flight validator,
        CUIT lookup, domicilio legal digital (DEC inbox monitoring).{" "}
        <strong>Probar quién sos</strong> · CUIT validate (algorithm),
        AFIP padron lookup, Mi Argentina OIDC, firma digital ONTI/AC-Raíz.{" "}
        <strong>Manejar plata</strong> · CBU/CVU validate, BCRA Central
        de Deudores, Mercado Pago Subscriptions/Payments/Marketplace,
        AFIP factura electrónica (A/B/C/E + FCE MiPyMEs).{" "}
        <strong>Operar con clientes</strong> · WhatsApp Business
        webhook, identity attestation OTP, Andreani/OCA/Correo shipping.{" "}
        <strong>Inteligencia operacional</strong> · BCRA Variables (USD,
        CER, UVA, reservas), Boletín Oficial monitoring, IGJ public
        registry.
      </DocP>

      <DocH2>Lo que NO hace (todavía)</DocH2>
      <DocP>
        Presentar trámites de IGJ de forma programática: escribir contra
        cada organismo requiere una integración por organismo que todavía
        está en curso (RFC-001 § 3.4). Tampoco retira plata de la cuenta
        de la sociedad: eso requiere autenticación humana según la ley
        bancaria argentina actual. El wizard genera el código que va a
        poder hacerlo cuando la ley lo permita.
      </DocP>

      <DocH2>¿Por qué prepararse ahora?</DocH2>
      <DocP>
        El régimen se anunció el 28 de abril de 2026. El anteproyecto de
        Ley General de Sociedades se envió al Senado el 1 de junio de 2026
        y todavía no es ley. Las empresas que lleguen pre-cableadas (repo +
        cert + flujos operativos probados) van a poder migrar el día 1.
        Las que recién empiecen ese día van a perder meses. Esto te pone
        en el primer grupo.
      </DocP>
      <IncorporarJsonLd />
    </DocShell>
  );
}
