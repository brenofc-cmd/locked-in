import { describe, expect, it } from "vitest";
import { authErrorMessage, validatePassword } from "@/lib/auth-errors";
import { isGuestOnlyPath, isPublicPath, safeNext } from "@/lib/auth-routes";
import {
  duoErrorMessage,
  isValidInviteCode,
  normalizeInviteCode,
} from "@/lib/invite-code";

describe("invite codes", () => {
  it("normalises the ways people type a code", () => {
    for (const typed of [
      "LKD-8X29AB",
      "lkd 8x29ab",
      "8x29ab",
      " lkd-8X2-9AB ",
      "LKD8X29AB",
    ]) {
      expect(normalizeInviteCode(typed)).toBe("LKD-8X29AB");
    }
  });

  it("accepts only the database format", () => {
    expect(isValidInviteCode("LKD-8X29AB")).toBe(true);
    expect(isValidInviteCode("LKD-8X29A")).toBe(false); // too short
    expect(isValidInviteCode("LKD-8X29ABC")).toBe(false); // too long
    expect(isValidInviteCode("LKD-0O1IL2")).toBe(false); // ambiguous symbols are not in the alphabet
    expect(isValidInviteCode(normalizeInviteCode(""))).toBe(false);
  });

  it("maps RPC errors to friendly copy and never leaks raw errors", () => {
    expect(duoErrorMessage("LI_DUO_FULL")).toMatch(/já está completa/);
    expect(duoErrorMessage("LI_INVALID_CODE")).toMatch(/não corresponde/);
    expect(duoErrorMessage("LI_ALREADY_IN_DUO")).toMatch(
      /já está em uma dupla/,
    );
    expect(duoErrorMessage("TypeError: fetch failed")).toMatch(
      /Erro de conexão/,
    );
    const raw =
      'duplicate key value violates unique constraint "duo_members_two_seats"';
    expect(duoErrorMessage(raw)).toBe("Algo deu errado. Tente de novo.");
  });
});

describe("auth errors", () => {
  it("maps Supabase codes to friendly copy", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 })).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(
      /Confirme seu e-mail/,
    );
    expect(authErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(authErrorMessage({ code: "something_new", status: 500 })).toBe(
      "Algo deu errado. Tente de novo.",
    );
  });

  it("validates passwords before any request", () => {
    expect(validatePassword("short", "short")).toMatch(/pelo menos 8/);
    expect(validatePassword("longenough", "different")).toMatch(
      /não coincidem/,
    );
    expect(validatePassword("longenough", "longenough")).toBeNull();
  });
});

describe("auth routes", () => {
  it("keeps every app screen private", () => {
    for (const p of [
      "/today",
      "/partner",
      "/focus",
      "/progress",
      "/more",
      "/routine",
      "/challenges",
      "/duo",
      "/settings",
      "/onboarding",
      "/reset-password",
      "/",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("opens only the auth screens and callbacks", () => {
    for (const p of [
      "/login",
      "/signup",
      "/forgot-password",
      "/auth/confirm",
      "/auth/signout",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/auth/confirm")).toBe(false);
  });

  it("only redirects to same-site paths after sign-in", () => {
    expect(safeNext("/duo?x=1")).toBe("/duo?x=1");
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(safeNext(bad)).toBe("/today");
    }
  });
});
