import { describe, expect, it } from "vitest";
import { describeSituation, type BcraSituation } from "../src/types";

describe("describeSituation", () => {
  const cases: Array<[BcraSituation, RegExp]> = [
    [0, /sin deuda/i],
    [1, /normal/i],
    [2, /riesgo bajo|hasta 90/i],
    [3, /riesgo medio|90.*180/i],
    [4, /riesgo alto|180.*365/i],
    [5, /irrecuperable/i],
    [6, /disposición técnica/i],
  ];
  for (const [situation, expected] of cases) {
    it(`describes situation ${situation}`, () => {
      expect(describeSituation(situation)).toMatch(expected);
    });
  }
});
