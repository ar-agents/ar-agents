import { describe, it, expect, vi } from "vitest";
import {
  bindTools,
  ALL_TOOL_NAMES,
  bindOk,
  type BindAdapter,
  type BindResult,
} from "../src/index";

function mockAdapter(overrides: Partial<BindAdapter> = {}): BindAdapter {
  const ok = <T>(data: T): Promise<BindResult<T>> => Promise.resolve(bindOk(data));
  return {
    listAccounts: () => ok([{ id: "21-1-99999-4-6" }]),
    getMovements: () => ok([{ id: "mov-1" }]),
    getCbuOwner: () =>
      ok({
        owners: [{ id: "20203385072", display_name: "Parker, Peter" }],
      }),
    createTransfer: () => ok({ id: "tr-1", status: "COMPLETED" }),
    createDebin: () => ok({ id: "deb-1", status: "PENDING" }),
    getEcheqs: () => ok([{ id: "RZP90K0JY469EGJ" }]),
    ...overrides,
  };
}

type AnyExecute = (input: unknown, ctx?: unknown) => Promise<unknown>;
function exec(tools: Record<string, unknown>, name: string, input: unknown) {
  const t = tools[name] as { execute: AnyExecute };
  return t.execute(input, {});
}

describe("bindTools shape", () => {
  it("exposes all six tools by default", () => {
    const tools = bindTools();
    expect(Object.keys(tools).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("supports include for read-only agents", () => {
    const tools = bindTools({
      include: ["bind_list_accounts", "bind_get_movements", "bind_get_cbu_owner"],
    });
    expect(Object.keys(tools)).toHaveLength(3);
    expect(tools).not.toHaveProperty("bind_create_transfer");
    expect(tools).not.toHaveProperty("bind_create_debin");
  });
});

describe("tools against a mock adapter", () => {
  const adapter = mockAdapter();
  const tools = bindTools({ adapter }) as unknown as Record<string, unknown>;

  it("bind_list_accounts returns the adapter result", async () => {
    const r = (await exec(tools, "bind_list_accounts", {})) as BindResult<unknown>;
    expect(r).toEqual({ ok: true, data: [{ id: "21-1-99999-4-6" }] });
  });

  it("bind_get_movements forwards args to the adapter", async () => {
    const spy = vi.fn(() => Promise.resolve(bindOk([])));
    const t = bindTools({ adapter: mockAdapter({ getMovements: spy }) }) as unknown as Record<string, unknown>;
    await exec(t, "bind_get_movements", { accountId: "21-1-99999-4-6", limit: 10 });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "21-1-99999-4-6", limit: 10 }),
    );
  });

  it("bind_get_cbu_owner returns owner data for pre-payment verification", async () => {
    const r = (await exec(tools, "bind_get_cbu_owner", {
      cbuCvu: "3220001823001077580012",
    })) as BindResult<{ owners: { display_name: string }[] }>;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.owners[0]!.display_name).toBe("Parker, Peter");
  });

  it("bind_create_transfer executes when no gate is configured", async () => {
    const r = (await exec(tools, "bind_create_transfer", {
      accountId: "21-1-99999-4-6",
      request: {
        origin_id: "55789",
        to: { cbu: "0".repeat(22) },
        value: { currency: "ARS", amount: 10 },
        concept: "VAR",
      },
    })) as BindResult<{ status: string }>;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("COMPLETED");
  });

  it("bind_create_debin returns the pending DEBIN", async () => {
    const r = (await exec(tools, "bind_create_debin", {
      accountId: "21-1-99999-4-6",
      request: {
        origin_id: "556677",
        to: { label: "alias" },
        value: { currency: "ARS", amount: 10 },
        concept: "EXP",
        expiration: 36,
      },
    })) as BindResult<{ status: string }>;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("PENDING");
  });

  it("bind_get_echeqs forwards status filter", async () => {
    const spy = vi.fn(() => Promise.resolve(bindOk([])));
    const t = bindTools({ adapter: mockAdapter({ getEcheqs: spy }) }) as unknown as Record<string, unknown>;
    await exec(t, "bind_get_echeqs", { accountId: "20-1-4636-2-5", status: "ACTIVE" });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "20-1-4636-2-5", status: "ACTIVE" }),
    );
  });
});

describe("HITL confirmation gate on bind_create_transfer", () => {
  const transferInput = {
    accountId: "21-1-99999-4-6",
    request: {
      origin_id: "55789",
      to: { cbu: "0".repeat(22) },
      value: { currency: "ARS", amount: 100 },
      concept: "VAR",
    },
  };

  it("declined confirmation blocks the transfer and the adapter is never called", async () => {
    const createTransfer = vi.fn();
    const tools = bindTools({
      adapter: mockAdapter({ createTransfer }),
      requireConfirmation: async () => false,
    }) as unknown as Record<string, unknown>;
    const r = (await exec(tools, "bind_create_transfer", transferInput)) as {
      ok: boolean;
      reason: string;
      operation: string;
    };
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Confirmation declined");
    expect(r.operation).toBe("bind_create_transfer");
    expect(createTransfer).not.toHaveBeenCalled();
  });

  it("approved confirmation lets the transfer through", async () => {
    const tools = bindTools({
      adapter: mockAdapter(),
      requireConfirmation: async () => true,
    }) as unknown as Record<string, unknown>;
    const r = (await exec(tools, "bind_create_transfer", transferInput)) as BindResult<unknown>;
    expect(r.ok).toBe(true);
  });

  it("passes the operation name and args to the confirmation callback", async () => {
    const gate = vi.fn(async () => true);
    const tools = bindTools({
      adapter: mockAdapter(),
      requireConfirmation: gate,
    }) as unknown as Record<string, unknown>;
    await exec(tools, "bind_create_transfer", transferInput);
    expect(gate).toHaveBeenCalledWith(
      "bind_create_transfer",
      expect.objectContaining({ accountId: "21-1-99999-4-6" }),
    );
  });

  it("does not gate read-only tools", async () => {
    const gate = vi.fn(async () => false);
    const tools = bindTools({
      adapter: mockAdapter(),
      requireConfirmation: gate,
    }) as unknown as Record<string, unknown>;
    const r = (await exec(tools, "bind_list_accounts", {})) as BindResult<unknown>;
    expect(r.ok).toBe(true);
    const owner = (await exec(tools, "bind_get_cbu_owner", {
      alias: "x",
    })) as BindResult<unknown>;
    expect(owner.ok).toBe(true);
    expect(gate).not.toHaveBeenCalled();
  });

  it("does not gate bind_create_debin (buyer approves it on their side)", async () => {
    const gate = vi.fn(async () => false);
    const tools = bindTools({
      adapter: mockAdapter(),
      requireConfirmation: gate,
    }) as unknown as Record<string, unknown>;
    const r = (await exec(tools, "bind_create_debin", {
      accountId: "21-1-99999-4-6",
      request: {
        origin_id: "1",
        to: { label: "alias" },
        value: { currency: "ARS", amount: 10 },
        concept: "VAR",
        expiration: 60,
      },
    })) as BindResult<unknown>;
    expect(r.ok).toBe(true);
    expect(gate).not.toHaveBeenCalled();
  });
});

describe("unconfigured default behavior at the tool layer", () => {
  it("every tool resolves a structured unconfigured result instead of throwing", async () => {
    const tools = bindTools() as unknown as Record<string, unknown>;
    const inputs: Record<string, unknown> = {
      bind_list_accounts: {},
      bind_get_movements: { accountId: "21-1-99999-4-6" },
      bind_get_cbu_owner: { alias: "x" },
      bind_create_transfer: {
        accountId: "21-1-99999-4-6",
        request: {
          origin_id: "1",
          to: { cbu: "0".repeat(22) },
          value: { currency: "ARS", amount: 10 },
          concept: "VAR",
        },
      },
      bind_create_debin: {
        accountId: "21-1-99999-4-6",
        request: {
          origin_id: "1",
          to: { label: "a" },
          value: { currency: "ARS", amount: 10 },
          concept: "VAR",
          expiration: 60,
        },
      },
      bind_get_echeqs: { accountId: "21-1-99999-4-6", status: "ACTIVE" },
    };
    for (const name of ALL_TOOL_NAMES) {
      const r = (await exec(tools, name, inputs[name])) as BindResult<unknown>;
      expect(r, name).toMatchObject({ ok: false, code: "unconfigured" });
    }
  });
});
