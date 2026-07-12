import { describe, expect, it, vi } from "vitest";
import {
  buildConstituteRequest,
  constituteSociety,
  ConstituteClientError,
} from "../src/constitute-client";

function fakeResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return { ok, status, json: async () => body } as unknown as Response;
}

const DRAFT = {
  denominacion: "Sociedad Ejemplo",
  tipo: "SAS",
  capitalSocial: 100000,
  objeto: "Desarrollo de software y servicios informaticos en general.",
};

const ADMINISTRADOR = { nombre: "Juan Perez", cuit: "20-12345678-6" };

describe("buildConstituteRequest", () => {
  it("builds the URL, method, header, and body", () => {
    const { url, init } = buildConstituteRequest({
      baseUrl: "https://studio.example",
      token: "stu_abc",
      draft: DRAFT,
      administrador: ADMINISTRADOR,
    });

    expect(url).toBe("https://studio.example/api/society/constitute");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-studio-token"]).toBe("stu_abc");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      draft: DRAFT,
      administrador: ADMINISTRADOR,
      acepta102: true,
    });
  });

  it("trims a trailing slash from baseUrl", () => {
    const { url } = buildConstituteRequest({
      baseUrl: "https://studio.example/",
      token: "stu_abc",
      draft: DRAFT,
      administrador: ADMINISTRADOR,
    });
    expect(url).toBe("https://studio.example/api/society/constitute");
  });
});

describe("constituteSociety", () => {
  it("returns credentials on a successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        ok: true,
        society: { denominacion: "Sociedad Ejemplo", tipo: "SAS", registryId: "reg_1" },
        credentials: { adminToken: "admin_tok_1", gateToken: "gate_tok_1" },
      }),
    );

    const result = await constituteSociety({
      baseUrl: "https://studio.example",
      token: "stu_abc",
      draft: DRAFT,
      administrador: ADMINISTRADOR,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      society: { denominacion: "Sociedad Ejemplo", tipo: "SAS", registryId: "reg_1" },
      credentials: { adminToken: "admin_tok_1", gateToken: "gate_tok_1" },
    });
  });

  it("throws ConstituteClientError with code ya_tiene_sociedad on a 409", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(409, {
        ok: false,
        error: "ya_tiene_sociedad",
        message: "Esta cuenta ya tiene una sociedad constituida.",
      }),
    );

    await expect(
      constituteSociety({
        baseUrl: "https://studio.example",
        token: "stu_abc",
        draft: DRAFT,
        administrador: ADMINISTRADOR,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ status: 409, code: "ya_tiene_sociedad" });
  });

  it("throws ConstituteClientError with the status on another error (422)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(422, { ok: false, error: "cuit_invalido", message: "El CUIT del administrador no es valido." }),
    );

    await expect(
      constituteSociety({
        baseUrl: "https://studio.example",
        token: "stu_abc",
        draft: DRAFT,
        administrador: ADMINISTRADOR,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("throws constitute_invalid_response when credentials are missing from an ok body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, society: {} }));

    await expect(
      constituteSociety({
        baseUrl: "https://studio.example",
        token: "stu_abc",
        draft: DRAFT,
        administrador: ADMINISTRADOR,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ConstituteClientError);

    const fetchImpl2 = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, society: {} }));
    await expect(
      constituteSociety({
        baseUrl: "https://studio.example",
        token: "stu_abc",
        draft: DRAFT,
        administrador: ADMINISTRADOR,
        fetchImpl: fetchImpl2 as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ message: "constitute_invalid_response" });
  });
});
