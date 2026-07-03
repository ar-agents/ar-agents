import type { Metadata } from "next";
import { ConstanciaLanding } from "./constancia-landing";
import { ConstanciaFaq } from "./constancia-faq";
import { ConstanciaHubJsonLd } from "@/app/json-ld";

const SITE_URL = "https://ar-agents.ar";

/**
 * FAQ copy, single source of truth for both the visible section and the
 * FAQPage JSON-LD. AR Spanish (vos), honest tiering (free check digit vs
 * premium ARCA verdict), no em dashes.
 */
const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "¿Cómo verifico si un CUIT es válido antes de darlo de alta como proveedor?",
    a: "Pegá el CUIT en ar-agents.ar/constancia y te valida el dígito verificador al instante, gratis y sin clave fiscal. Eso te dice si el número es coherente o inventado. La constancia real de ARCA (régimen y situación fiscal) es la capa premium, que se activa cuando el certificado AFIP está cargado.",
  },
  {
    q: "¿Qué diferencia hay entre validar el CUIT y ver la constancia de ARCA?",
    a: "Son dos cosas distintas. Validar el CUIT es correr el cálculo mod-11 del dígito verificador: gratis, instantáneo y sin secreto, te dice si el número cierra. La constancia real de ARCA (régimen, monotributo, IVA, situación fiscal) es el verdicto premium que se activa con el certificado AFIP. Hasta entonces se muestra como premium todavía no configurado, nunca como un verdicto inventado.",
  },
  {
    q: "¿Cómo verifico el CUIT sin clave fiscal ni entrar a AFIP?",
    a: "En ar-agents.ar/constancia validás el dígito verificador directo desde el número, gratis y sin clave fiscal ni login. Eso te confirma al instante si el CUIT es coherente. La consulta a ARCA (constancia de inscripción real) es la capa premium que necesita el certificado AFIP activo.",
  },
  {
    q: "¿Cómo sé si un proveedor es monotributista o está inscripto en ARCA?",
    a: "En ar-agents.ar/constancia validás el CUIT gratis al toque. El régimen real (monotributo, IVA) y la inscripción en ARCA salen como verdicto premium cuando el certificado AFIP está cargado, no cuando el número simplemente cierra. Mientras el premium no está configurado, la página no afirma el régimen.",
  },
  {
    q: "¿Cómo distingo si un CUIT es de persona física o de una empresa (persona jurídica)?",
    a: "El prefijo del CUIT te indica si es persona física (por ejemplo 20 o 27) o jurídica (por ejemplo 30 o 33), y esa validación del dígito es gratis e instantánea para cualquiera de los dos. La constancia de ARCA con la denominación real de la empresa es la capa premium que se activa con el certificado AFIP.",
  },
  {
    q: "¿Cómo genero un comprobante de que verifiqué un CUIT para adjuntar al alta?",
    a: "Cada CUIT tiene una página de prueba en ar-agents.ar/constancia/<CUIT> y un badge compartible en ar-agents.ar/api/constancia/badge/<CUIT>. Copiás el snippet en markdown o HTML y lo pegás en el legajo del proveedor, un README o un perfil, o mandás el link de la página como comprobante. Se actualiza solo.",
  },
  {
    q: "¿Cómo verifico un CUIT desde mi sistema o agente, con una llamada?",
    a: "Pegále un GET a https://ar-agents.ar/api/constancia/lookup?cuit=20-12345678-6 y te devuelve un JSON con valid (el dígito verificador mod-11), personType (física o jurídica) y los links al badge y a la página de prueba. Tiene CORS y acepta GET o POST, así que lo llamás desde el browser, tu backend o tu agente. El campo de situación fiscal de ARCA viene como verdicto premium, y se activa cuando el certificado AFIP está cargado en el deployment.",
  },
  {
    q: "¿Hay límites de uso o necesito una key?",
    a: "No necesitás key para la validación gratis del dígito verificador: llamás al endpoint directo. Hay un rate limit de 30 consultas por minuto por IP. Si lo pasás, la API responde 429 con un Retry-After, así que armá tu cliente para reintentar con backoff.",
  },
];

export const metadata: Metadata = {
  title: "Constancia Oracle · verificá la constancia de cualquier CUIT",
  description:
    "Verificá la constancia de cualquier CUIT argentino y obtené un badge firmado para embeber. Validación instantánea del dígito verificador, gratis. Buena situación fiscal de ARCA, premium.",
  alternates: { canonical: `${SITE_URL}/constancia` },
  openGraph: {
    title: "Constancia Oracle · verificá cualquier CUIT. Firmada.",
    description:
      "Validación instantánea del CUIT y un badge 'Verificado por ar-agents' para embeber donde quieras.",
    url: `${SITE_URL}/constancia`,
    type: "website",
  },
};

export default function ConstanciaLandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily:
          "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
      }}
    >
      <ConstanciaHubJsonLd faq={FAQ} />
      <ConstanciaLanding />
      <ConstanciaFaq items={FAQ} />
      <p
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "0 24px 72px",
          fontSize: 13,
          color: "var(--text-muted)",
          lineHeight: 1.6,
        }}
      >
        Este producto es un experimento público de adquisición autónoma (cero
        ventas humanas). Las métricas son abiertas, incluso si dan cero:{" "}
        <a
          href="/api/constancia/metrics"
          style={{ color: "var(--accent)" }}
        >
          /api/constancia/metrics
        </a>
        .
      </p>
    </main>
  );
}
