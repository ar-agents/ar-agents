/**
 * Pure helpers for parsing IGJ dataset rows into typed records. The CKAN
 * datastore returns columns named in Spanish with mixed casing — this
 * module normalizes them.
 */

import type {
  IgjAsamblea,
  IgjAutoridad,
  IgjBalance,
  IgjDomicilio,
  IgjEntity,
  IgjEntityType,
} from "./types";

const TYPE_MAP: Record<string, IgjEntityType> = {
  "sociedad anonima": "sa",
  "sociedad anónima": "sa",
  "s.a.": "sa",
  sa: "sa",
  "sociedad de responsabilidad limitada": "srl",
  "s.r.l.": "srl",
  srl: "srl",
  "sociedad por acciones simplificada": "sas",
  sas: "sas",
  "asociacion civil": "asociacion_civil",
  "asociación civil": "asociacion_civil",
  fundacion: "fundacion",
  fundación: "fundacion",
  cooperativa: "cooperativa",
  mutual: "mutual",
  "sociedad extranjera": "sociedad_extranjera",
};

export function normalizeEntityType(raw: string | null | undefined): IgjEntityType {
  if (!raw) return "otro";
  const lower = String(raw).trim().toLowerCase();
  return TYPE_MAP[lower] ?? "otro";
}

/** Strip non-digits — convert "20-12345678-6" → "20123456786". */
export function normalizeCuit(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const digits = String(input).replace(/\D/g, "");
  return digits.length === 11 ? digits : undefined;
}

/**
 * Coerce a CKAN row value to a string. CKAN datastore returns dates as
 * ISO strings, numbers as numbers; we re-string everything to keep types
 * narrow.
 */
function s(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const str = String(v).trim();
  return str.length === 0 ? undefined : str;
}

function n(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const num = Number(v);
  return Number.isFinite(num) ? num : undefined;
}

/** Pick the first non-empty value across candidate keys (column-name drift tolerance). */
function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = s(row[k]);
    if (v) return v;
  }
  return undefined;
}

/** Normalize a CKAN-shaped IGJ entity row. */
export function parseEntity(row: Record<string, unknown>): IgjEntity {
  const id = pick(row, ["_id", "id", "correlativo", "matricula"]) ?? "";
  const nombre = pick(row, ["denominacion", "razon_social", "razonSocial", "nombre"]) ?? "";
  const cuit = normalizeCuit(pick(row, ["cuit", "CUIT"]));
  const tipo = normalizeEntityType(pick(row, ["tipoEntidad", "tipo_entidad", "tipo"]));
  const fechaInscripcion = pick(row, [
    "fechaInscripcion",
    "fecha_inscripcion",
    "fechaConstitucion",
    "fecha_constitucion",
  ]);
  const matricula = pick(row, ["matricula", "numeroMatricula", "numero_matricula"]);

  const e: IgjEntity = { id, nombre, tipoEntidad: tipo, raw: row };
  if (cuit !== undefined) e.cuit = cuit;
  if (fechaInscripcion !== undefined) e.fechaInscripcion = fechaInscripcion;
  if (matricula !== undefined) e.matricula = matricula;
  return e;
}

export function parseDomicilio(row: Record<string, unknown>): IgjDomicilio {
  const out: IgjDomicilio = {
    entityId: pick(row, ["entityId", "correlativo", "id", "_id"]) ?? "",
    raw: row,
  };
  const tipo = pick(row, ["tipo", "tipoDomicilio"]);
  if (tipo) out.tipo = tipo;
  const calle = pick(row, ["calle"]);
  if (calle) out.calle = calle;
  const numero = pick(row, ["numero", "altura"]);
  if (numero) out.numero = numero;
  const piso = pick(row, ["piso"]);
  if (piso) out.piso = piso;
  const departamento = pick(row, ["departamento", "depto"]);
  if (departamento) out.departamento = departamento;
  const localidad = pick(row, ["localidad", "ciudad"]);
  if (localidad) out.localidad = localidad;
  const provincia = pick(row, ["provincia"]);
  if (provincia) out.provincia = provincia;
  const codigoPostal = pick(row, ["codigoPostal", "codigo_postal", "cp"]);
  if (codigoPostal) out.codigoPostal = codigoPostal;
  return out;
}

export function parseAutoridad(row: Record<string, unknown>): IgjAutoridad {
  const out: IgjAutoridad = {
    entityId: pick(row, ["entityId", "correlativo", "idEntidad", "id_entidad"]) ?? "",
    nombre: pick(row, ["nombre", "nombreApellido", "nombreCompleto"]) ?? "",
    raw: row,
  };
  const cargo = pick(row, ["cargo"]);
  if (cargo) out.cargo = cargo;
  const fechaDesignacion = pick(row, ["fechaDesignacion", "fecha_designacion"]);
  if (fechaDesignacion) out.fechaDesignacion = fechaDesignacion;
  const generoRaw = pick(row, ["genero", "género", "sexo"]);
  if (generoRaw) {
    const g = generoRaw.toUpperCase().charAt(0);
    out.genero = g === "M" ? "M" : g === "F" ? "F" : "otro";
  }
  return out;
}

export function parseBalance(row: Record<string, unknown>): IgjBalance {
  const out: IgjBalance = {
    entityId: pick(row, ["entityId", "correlativo", "idEntidad"]) ?? "",
    raw: row,
  };
  const cierreEjercicio = pick(row, ["cierreEjercicio", "cierre_ejercicio", "fechaCierre"]);
  if (cierreEjercicio) out.cierreEjercicio = cierreEjercicio;
  const numeroEjercicio = n(row["numeroEjercicio"] ?? row["numero_ejercicio"]);
  if (numeroEjercicio !== undefined) out.numeroEjercicio = numeroEjercicio;
  const fechaPresentacion = pick(row, ["fechaPresentacion", "fecha_presentacion"]);
  if (fechaPresentacion) out.fechaPresentacion = fechaPresentacion;
  return out;
}

export function parseAsamblea(row: Record<string, unknown>): IgjAsamblea {
  const out: IgjAsamblea = {
    entityId: pick(row, ["entityId", "correlativo", "idEntidad"]) ?? "",
    raw: row,
  };
  const tipo = pick(row, ["tipo", "tipoAsamblea"]);
  if (tipo) out.tipo = tipo;
  const fecha = pick(row, ["fecha", "fechaAsamblea"]);
  if (fecha) out.fecha = fecha;
  return out;
}
