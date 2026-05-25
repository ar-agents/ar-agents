import { CnvUnconfiguredError } from "./errors";
import type {
  FinancialStatementRecord,
  HechoRelevante,
  HechoRelevanteCategory,
  IssuerRecord,
} from "./types";

export interface CnvAdapter {
  getIssuer(code: string): Promise<IssuerRecord | null>;
  listHechosRelevantes(args: {
    issuerCode: string;
    sinceIso?: string | undefined;
    category?: HechoRelevanteCategory | undefined;
    limit?: number | undefined;
  }): Promise<HechoRelevante[]>;
  listFinancialStatements(args: {
    issuerCode: string;
    limit?: number | undefined;
  }): Promise<FinancialStatementRecord[]>;
}

export class UnconfiguredCnvAdapter implements CnvAdapter {
  async getIssuer(): Promise<never> {
    throw new CnvUnconfiguredError("getIssuer");
  }
  async listHechosRelevantes(): Promise<never> {
    throw new CnvUnconfiguredError("listHechosRelevantes");
  }
  async listFinancialStatements(): Promise<never> {
    throw new CnvUnconfiguredError("listFinancialStatements");
  }
}

export interface InMemoryCnvSeed {
  issuers?: IssuerRecord[];
  hechos?: HechoRelevante[];
  statements?: FinancialStatementRecord[];
}

export class InMemoryCnvAdapter implements CnvAdapter {
  constructor(private readonly seed: InMemoryCnvSeed = {}) {}

  async getIssuer(code: string): Promise<IssuerRecord | null> {
    return (this.seed.issuers ?? []).find((i) => i.code === code) ?? null;
  }

  async listHechosRelevantes(args: {
    issuerCode: string;
    sinceIso?: string | undefined;
    category?: HechoRelevanteCategory | undefined;
    limit?: number | undefined;
  }): Promise<HechoRelevante[]> {
    const all = (this.seed.hechos ?? []).filter((h) => h.issuerCode === args.issuerCode);
    const filtered = all.filter((h) => {
      if (args.sinceIso && h.publishedAt < args.sinceIso) return false;
      if (args.category && h.category !== args.category) return false;
      return true;
    });
    return filtered.slice(0, args.limit ?? 25);
  }

  async listFinancialStatements(args: {
    issuerCode: string;
    limit?: number | undefined;
  }): Promise<FinancialStatementRecord[]> {
    const all = (this.seed.statements ?? []).filter(
      (s) => s.issuerCode === args.issuerCode,
    );
    return all.slice(0, args.limit ?? 25);
  }
}
