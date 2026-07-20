import { describe, expect, it } from "vitest";
import { PLAN_NAME_MAX, validatePlanName } from "@/lib/plan-name";

describe("validatePlanName", () => {
  it("accepts a normal name", () => {
    expect(validatePlanName("Weeknight dinners")).toBeNull();
  });

  it("trims whitespace before validating", () => {
    expect(validatePlanName("  hello  ")).toBeNull();
  });

  it("rejects empty / whitespace-only names", () => {
    expect(validatePlanName("")).toMatch(/empty/i);
    expect(validatePlanName("   ")).toMatch(/empty/i);
  });

  it("rejects names longer than the max", () => {
    expect(validatePlanName("x".repeat(PLAN_NAME_MAX + 1))).toMatch(
      new RegExp(String(PLAN_NAME_MAX)),
    );
  });

  it("rejects line breaks and tabs", () => {
    expect(validatePlanName("bad\nname")).toMatch(/line breaks|tabs/i);
    expect(validatePlanName("bad\tname")).toMatch(/line breaks|tabs/i);
  });

  it("detects case-insensitive duplicates", () => {
    expect(
      validatePlanName("Family Week", { existing: ["family week", "Other"] }),
    ).toMatch(/already have a plan/i);
  });

  it("allows saving the same name as the current row", () => {
    expect(
      validatePlanName("Family Week", {
        existing: ["Family Week", "Other"],
        current: "Family Week",
      }),
    ).toBeNull();
  });
});
