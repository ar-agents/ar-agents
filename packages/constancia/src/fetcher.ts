/**
 * Fetcher contract for `@ar-agents/constancia`.
 *
 * ARCA's Constancia de Inscripción is produced by a PUBLIC web form with
 * no documented API and no machine endpoint for the PDF. The realistic
 * options are:
 *
 *   - **Browser runtime** — drive the public form with the companion
 *     `afip-constancia` skill (browserbase/skills) and capture the
 *     rendered constancia + PDF. `BrowseSkillConstanciaFetcher` adapts
 *     that runtime behind the typed contract.
 *   - **Private mirror** — your team already archives constancias; pass a
 *     custom adapter that reads from there.
 *   - **Mock** for tests / demos.
 *
 * All adapters share one contract so the public surface stays stable even
 * though the backend is a browser. This is a deliberately QUARANTINED
 * browser-backed tier: the package bundles no browser and no Browserbase
 * dependency — the runtime is injected.
 */

import { ConstanciaError, FetcherNotConfiguredError } from "./errors";
import type {
  Constancia,
  ConstanciaActividad,
  ConstanciaImpuesto,
  ConstanciaPdf,
  ConstanciaResult,
  RawSkillOutput,
} from "./types";

export interface ConstanciaFetcher {
  getConstancia(cuit: string): Promise<ConstanciaResult>;
}

/**
 * Normalize any CUIT-ish input to a bare 11-digit string. Returns `null`
 * when the input cannot be a CUIT (wrong length / non-digits). Pure.
 *
 * This is a *shape* check only — it does NOT verify the check digit.
 * Validate with `@ar-agents/identity`'s `validate_cuit` before trusting
 * a CUIT the user supplied.
 */
export function normalizeCuit(input: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/**
 * Default fetcher that returns "not configured". Safe to call without a
 * browser runtime — typical for tests, demos, and CI.
 */
export class UnconfiguredConstanciaFetcher implements ConstanciaFetcher {
  async getConstancia(cuit: string): Promise<ConstanciaResult> {
    const normalized = normalizeCuit(cuit) ?? cuit;
    return {
      cuit: normalized,
      available: false,
      error: new FetcherNotConfiguredError().message,
      data: null,
      pdf: null,
      source: "unconfigured",
    };
  }
}

/**
 * In-memory fetcher backed by a fixed map of constancias keyed by bare
 * CUIT. Useful for tests, demos, and seeding an agent with curated
 * examples. Unknown CUITs return `available: false` with a
 * `cuit_not_found`-style message (mirrors ARCA's "no figura inscripto").
 */
export class MockConstanciaFetcher implements ConstanciaFetcher {
  private readonly data: Map<string, Constancia>;
  private readonly pdfs: Map<string, ConstanciaPdf>;

  constructor(
    fixtures: Record<string, Constancia>,
    pdfs: Record<string, ConstanciaPdf> = {},
  ) {
    this.data = new Map(
      Object.entries(fixtures).map(([k, v]) => [k.replace(/\D/g, ""), v]),
    );
    this.pdfs = new Map(
      Object.entries(pdfs).map(([k, v]) => [k.replace(/\D/g, ""), v]),
    );
  }

  async getConstancia(cuit: string): Promise<ConstanciaResult> {
    const key = normalizeCuit(cuit);
    if (!key) {
      return {
        cuit,
        available: false,
        error: `invalid_cuit: "${cuit}" no tiene 11 dígitos.`,
        data: null,
        pdf: null,
        source: "mock",
      };
    }
    const data = this.data.get(key);
    if (!data) {
      return {
        cuit: key,
        available: false,
        error: `cuit_not_found: el CUIT ${key} no figura inscripto en ARCA.`,
        data: null,
        pdf: null,
        source: "mock",
      };
    }
    return {
      cuit: key,
      available: true,
      error: null,
      data,
      pdf: this.pdfs.get(key) ?? null,
      source: "mock",
    };
  }
}

/**
 * The browser bridge. Adapts a `browse`-runtime invocation of the
 * companion `afip-constancia` skill (browserbase/skills) into the typed
 * `ConstanciaFetcher` contract.
 *
 * The runtime call is INJECTED (`runSkill`) — the package never spawns a
 * browser itself, never depends on Browserbase, and stays a few KB. Wire
 * `runSkill` to however you run the skill (the `browse` CLI, a
 * Browserbase Function, a queue worker). It must resolve with the JSON
 * the skill prints on stdout (see the skill's "Output contract"); the
 * conservative `parseSkillOutput` normalizes it.
 *
 * # Resilience
 *
 * The ARCA form changes without notice. `parseSkillOutput` is
 * conservative: on a structural mismatch it throws
 * `ConstanciaError("fetcher_unexpected_response")` rather than return
 * wrong data. A thrown/rejected `runSkill` is mapped to a safe
 * `available: false` result with the error surfaced — tools never throw
 * at the agent.
 */
export interface BrowseSkillConstanciaFetcherOptions {
  /**
   * Runs the `afip-constancia` skill for one CUIT and resolves with the
   * JSON it emitted. Throwing/rejecting is fine — it is caught and
   * surfaced as a safe error result.
   */
  runSkill: (cuit: string) => Promise<RawSkillOutput | string>;
  /** Skill identifier, for diagnostics. Default `"afip-constancia"`. */
  skillId?: string;
}

export class BrowseSkillConstanciaFetcher implements ConstanciaFetcher {
  private readonly runSkill: (
    cuit: string,
  ) => Promise<RawSkillOutput | string>;
  private readonly skillId: string;

  constructor(opts: BrowseSkillConstanciaFetcherOptions) {
    this.runSkill = opts.runSkill;
    this.skillId = opts.skillId ?? "afip-constancia";
  }

  async getConstancia(cuit: string): Promise<ConstanciaResult> {
    const key = normalizeCuit(cuit);
    if (!key) {
      return {
        cuit,
        available: false,
        error: `invalid_cuit: "${cuit}" no tiene 11 dígitos. Validá con @ar-agents/identity validate_cuit antes de consultar.`,
        data: null,
        pdf: null,
        source: "browse-skill",
      };
    }

    let raw: RawSkillOutput | string;
    try {
      raw = await this.runSkill(key);
    } catch (err) {
      return {
        cuit: key,
        available: false,
        error: `fetcher_unreachable: el skill "${this.skillId}" falló — ${err instanceof Error ? err.message : String(err)}`,
        data: null,
        pdf: null,
        source: "browse-skill",
      };
    }

    try {
      return parseSkillOutput(key, raw);
    } catch (err) {
      if (err instanceof ConstanciaError && err.code === "cuit_not_found") {
        return {
          cuit: key,
          available: false,
          error: `cuit_not_found: el CUIT ${key} no figura inscripto en ARCA.`,
          data: null,
          pdf: null,
          source: "browse-skill",
        };
      }
      return {
        cuit: key,
        available: false,
        error:
          err instanceof ConstanciaError
            ? `${err.code}: ${err.message}`
            : `fetcher_unexpected_response: ${err instanceof Error ? err.message : String(err)}`,
        data: null,
        pdf: null,
        source: "browse-skill",
      };
    }
  }
}

/**
 * Normalize the companion skill's stdout JSON into a `ConstanciaResult`.
 *
 * Conservative by design. Accepts the raw object or a JSON string. When
 * the skill reports the CUIT is not registered, throws
 * `ConstanciaError("cuit_not_found")`. When required fields are missing
 * on a "found" payload, throws `ConstanciaError("fetcher_unexpected_response")`
 * rather than fabricate a constancia.
 *
 * Exported for unit testing and for callers wiring a custom runtime;
 * not coupled to any browser library.
 */
export function parseSkillOutput(
  cuit: string,
  raw: RawSkillOutput | string,
): ConstanciaResult {
  let obj: RawSkillOutput;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as RawSkillOutput;
    } catch {
      throw new ConstanciaError(
        "fetcher_unexpected_response",
        "skill output was not valid JSON",
      );
    }
  } else if (raw && typeof raw === "object") {
    obj = raw;
  } else {
    throw new ConstanciaError(
      "fetcher_unexpected_response",
      "skill output was empty or not an object",
    );
  }

  if (typeof obj.error === "string" && obj.error.length > 0) {
    if (/no_?t?_?found|no figura|inexistente|not_found/i.test(obj.error)) {
      throw new ConstanciaError("cuit_not_found", obj.error);
    }
    throw new ConstanciaError("fetcher_unexpected_response", obj.error);
  }

  if (obj.found === false) {
    throw new ConstanciaError(
      "cuit_not_found",
      `el CUIT ${cuit} no figura inscripto`,
    );
  }

  const denominacion = str(obj.denominacion);
  if (!denominacion) {
    throw new ConstanciaError(
      "fetcher_unexpected_response",
      "skill output missing required field `denominacion`",
    );
  }

  const tipoPersona: Constancia["tipoPersona"] =
    obj.tipoPersona === "juridica" ? "juridica" : "fisica";

  const condicion = normalizeCondicion(obj.condicion);

  const data: Constancia = {
    cuit,
    denominacion,
    tipoPersona,
    condicion,
  };

  const cat = str(obj.monotributoCategoria);
  if (cat) data.monotributoCategoria = cat.toUpperCase();

  const dom = normalizeDomicilio(obj.domicilioFiscal);
  if (dom) data.domicilioFiscal = dom;

  const acts = normalizeActividades(obj.actividades);
  if (acts.length > 0) data.actividades = acts;

  const imps = normalizeImpuestos(obj.impuestos);
  if (imps.length > 0) data.impuestos = imps;

  const fecha = isoDate(obj.fechaInscripcion);
  if (fecha) data.fechaInscripcion = fecha;

  const estado = str(obj.estado);
  if (estado) data.estado = estado;

  const pdf = normalizePdf(obj.pdf);

  return {
    cuit,
    available: true,
    error: null,
    data,
    pdf,
    source: "browse-skill",
  };
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function normalizeCondicion(v: unknown): Constancia["condicion"] {
  const s = (typeof v === "string" ? v : "").toLowerCase();
  if (/monotrib/.test(s)) return "monotributo";
  if (/responsable\s*inscript|resp.*insc|general/.test(s))
    return "responsable_inscripto";
  if (/exent/.test(s)) return "exento";
  if (/no\s*alcanzad/.test(s)) return "no_alcanzado";
  if (/no\s*inscript|sin\s*inscrip/.test(s)) return "no_inscripto";
  return "desconocida";
}

function normalizeDomicilio(v: unknown): Constancia["domicilioFiscal"] {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const d: NonNullable<Constancia["domicilioFiscal"]> = {};
  const dir = str(o.direccion);
  if (dir) d.direccion = dir;
  const loc = str(o.localidad);
  if (loc) d.localidad = loc;
  const prov = str(o.provincia);
  if (prov) d.provincia = prov;
  const cp = str(o.codigoPostal);
  if (cp) d.codigoPostal = cp;
  return Object.keys(d).length > 0 ? d : undefined;
}

function normalizeActividades(v: unknown): ConstanciaActividad[] {
  if (!Array.isArray(v)) return [];
  const out: ConstanciaActividad[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const codigo = str(o.codigo);
    const descripcion = str(o.descripcion);
    if (!codigo && !descripcion) continue;
    out.push({
      codigo: codigo ?? "",
      descripcion: descripcion ?? "",
      principal: o.principal === true,
    });
  }
  return out;
}

function normalizeImpuestos(v: unknown): ConstanciaImpuesto[] {
  if (!Array.isArray(v)) return [];
  const out: ConstanciaImpuesto[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const d = item.trim();
      if (d) out.push({ descripcion: d });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const descripcion = str(o.descripcion);
    if (!descripcion) continue;
    const imp: ConstanciaImpuesto = { descripcion };
    const desde = isoDate(o.desde);
    if (desde) imp.desde = desde;
    out.push(imp);
  }
  return out;
}

function normalizePdf(v: unknown): ConstanciaPdf | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const pdf: ConstanciaPdf = {};
  const b64 = str(o.base64);
  if (b64) pdf.base64 = b64;
  const url = str(o.url);
  if (url) pdf.url = url;
  const code = str(o.codigoVerificador);
  if (code) pdf.codigoVerificador = code;
  return Object.keys(pdf).length > 0 ? pdf : null;
}

/** Best-effort ISO `YYYY-MM-DD`. Accepts ISO or `DD/MM/YYYY`. */
function isoDate(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return undefined;
}
