import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

describe("Security headers — next.config.ts", () => {
  let headers: { key: string; value: string }[];

  it("headers() returns a single rule matching all routes", async () => {
    const result = await nextConfig.headers!();
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("/(.*)");
    headers = result[0].headers;
  });

  it("sets Content-Security-Policy", async () => {
    const result = await nextConfig.headers!();
    const csp = result[0].headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp!.value).toContain("default-src 'self'");
    expect(csp!.value).toContain("script-src 'self'");
    expect(csp!.value).toContain("frame-ancestors 'none'");
  });

  it("script-src does NOT allow unsafe-inline or unsafe-eval", async () => {
    const result = await nextConfig.headers!();
    const csp = result[0].headers.find((h) => h.key === "Content-Security-Policy")!;
    // Extract the script-src directive specifically
    const scriptSrc = csp.value.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const result = await nextConfig.headers!();
    const xfo = result[0].headers.find((h) => h.key === "X-Frame-Options");
    expect(xfo).toBeDefined();
    expect(xfo!.value).toBe("DENY");
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const result = await nextConfig.headers!();
    const xcto = result[0].headers.find((h) => h.key === "X-Content-Type-Options");
    expect(xcto).toBeDefined();
    expect(xcto!.value).toBe("nosniff");
  });

  it("sets Strict-Transport-Security with long max-age", async () => {
    const result = await nextConfig.headers!();
    const hsts = result[0].headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts).toBeDefined();
    expect(hsts!.value).toContain("max-age=63072000");
    expect(hsts!.value).toContain("includeSubDomains");
  });

  it("sets Permissions-Policy restricting sensitive APIs", async () => {
    const result = await nextConfig.headers!();
    const pp = result[0].headers.find((h) => h.key === "Permissions-Policy");
    expect(pp).toBeDefined();
    expect(pp!.value).toContain("camera=()");
    expect(pp!.value).toContain("microphone=()");
  });
});
