import { AnsesUnconfiguredError } from "./errors";
import type {
  CuilStatusResult,
  FamilyAllowanceEntitlement,
  MinimoJubilatorioRecord,
} from "./types";

export interface AnsesAdapter {
  getCuilStatus(cuil: string): Promise<CuilStatusResult>;
  getFamilyAllowances(cuil: string): Promise<FamilyAllowanceEntitlement[]>;
  getMinimoJubilatorio(period: string): Promise<MinimoJubilatorioRecord | null>;
}

export class UnconfiguredAnsesAdapter implements AnsesAdapter {
  async getCuilStatus(): Promise<never> {
    throw new AnsesUnconfiguredError("getCuilStatus");
  }
  async getFamilyAllowances(): Promise<never> {
    throw new AnsesUnconfiguredError("getFamilyAllowances");
  }
  async getMinimoJubilatorio(): Promise<never> {
    throw new AnsesUnconfiguredError("getMinimoJubilatorio");
  }
}

export interface InMemoryAnsesSeed {
  cuils?: CuilStatusResult[];
  /** cuil → entitlements. */
  allowances?: Record<string, FamilyAllowanceEntitlement[]>;
  minimoByPeriod?: MinimoJubilatorioRecord[];
}

export class InMemoryAnsesAdapter implements AnsesAdapter {
  constructor(private readonly seed: InMemoryAnsesSeed = {}) {}

  async getCuilStatus(cuil: string): Promise<CuilStatusResult> {
    const clean = cuil.replace(/-/g, "");
    const match = (this.seed.cuils ?? []).find(
      (r) => r.cuil.replace(/-/g, "") === clean,
    );
    return match ?? { cuil: clean, found: false };
  }

  async getFamilyAllowances(cuil: string): Promise<FamilyAllowanceEntitlement[]> {
    const clean = cuil.replace(/-/g, "");
    return this.seed.allowances?.[clean] ?? [];
  }

  async getMinimoJubilatorio(period: string): Promise<MinimoJubilatorioRecord | null> {
    return (this.seed.minimoByPeriod ?? []).find((r) => r.period === period) ?? null;
  }
}
