import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { IncorporarWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Incorporar una sociedad-IA · 10 minutos",
  description:
    "Wizard que genera el repositorio + config + Vercel deploy para una sociedad-IA argentina. 16 piezas pre-cableadas. RFC-001 governance. MIT.",
  alternates: { canonical: "https://ar-agents.vercel.app/incorporar" },
};

export default function IncorporarPage() {
  return (
    <DocShell
      eyebrow="/arg · incorporar · alpha"
      title="Incorporar una sociedad-IA."
      subtitle="Pre-launch wizard. Te genera el repo, los env vars, el Vercel deploy y la lista de pasos legales para constituir una sociedad-IA en Argentina cuando la ley salga (H1 2027). Hoy podés operar como SAS estándar con todo el stack agentic ya cableado."
    >
      <DocBlock>
        <DocP>
          Esto no es ChatGPT-fills-a-form. Es la salida de la cadena{" "}
          <DocCode>plan → repo → deploy → cert → operación</DocCode> que
          la libreria <DocCode>@ar-agents/*</DocCode> implementa. El
          wizard te configura todo lo que es código. Lo que requiere
          presencia legal humana (representante, certificado AFIP,
          registro IGJ) lo dejamos como checklist al final.
        </DocP>
        <DocP>
          ¿Cuánto tarda? El código corre en 10 minutos. El AFIP cert + el
          alta IGJ tardan 5-10 días hábiles. La sociedad-IA propiamente
          dicha (RFC-001 § 3.4) tarda lo que tarde el Congreso. Mientras
          tanto: SAS con LLM-agent operator + RFC-001 liability framework.
        </DocP>
      </DocBlock>

      <DocH2>Configuración</DocH2>

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
        Filing trámites IGJ programáticamente — el surface escribir requiere
        per-organism integration que aún está rolling out (RFC-001 § 3.4).
        Retiramos plata de la cuenta de la sociedad — eso requiere
        autenticación humana per AR banking law actual. El wizard genera
        el código que pueda hacerlo cuando la ley lo permita.
      </DocP>

      <DocH2>¿Por qué pre-launch ahora?</DocH2>
      <DocP>
        Sturzenegger anunció el régimen el 28 abril 2026. Realista, la ley
        sale H1 2027. Empresas que estén pre-cableadas (repo + cert + flujos
        operativos probados) van a poder migrar el día 1. Empresas que recién
        empiecen ese día van a perder 3-6 meses. Esto te pone en el primer
        grupo.
      </DocP>
    </DocShell>
  );
}
