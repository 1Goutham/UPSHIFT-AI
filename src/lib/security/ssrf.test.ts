import { describe, expect, it } from "vitest";
import { isPrivateAddress, validateUrlShape } from "./ssrf";
import { sniffImage } from "./upload";

describe("ssrf guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
  it("rejects bad schemes, credentials, ports and local hosts", () => {
    expect(() => validateUrlShape("file:///etc/passwd")).toThrow();
    expect(() => validateUrlShape("http://user:pw@example.com")).toThrow();
    expect(() => validateUrlShape("http://example.com:22")).toThrow();
    expect(() => validateUrlShape("http://localhost/")).toThrow();
    expect(() => validateUrlShape("http://169.254.169.254/latest")).toThrow();
    expect(() => validateUrlShape("http://[::1]/")).toThrow();
    expect(validateUrlShape("https://example.com/a").hostname).toBe("example.com");
  });
});

describe("upload sniffing", () => {
  it("identifies images by bytes, not name", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
