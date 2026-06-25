import { describe, expect, it } from "vitest";
import type { RequestTabContext } from "@harborclient/plugin-api";
import { buildCurlCommand } from "./buildCurl";

/**
 * Returns a minimal request tab context for curl builder tests.
 *
 * @param overrides - Partial context overrides.
 */
function sampleContext(
  overrides: Partial<RequestTabContext> = {}
): RequestTabContext {
  const base: RequestTabContext = {
    readOnly: true,
    response: null,
    collectionAuth: {
      type: "none",
      basic: { username: "", password: "" },
      bearer: { token: "" },
    },
    collectionHeaders: [],
    draft: {
      method: "GET",
      url: "https://example.com",
      params: [],
      headers: [],
      body: "",
      body_type: "none",
      auth: {
        type: "none",
        basic: { username: "", password: "" },
        bearer: { token: "" },
      },
    },
  };

  return {
    ...base,
    ...overrides,
    draft: { ...base.draft, ...overrides.draft },
    collectionAuth: overrides.collectionAuth ?? base.collectionAuth,
    collectionHeaders: overrides.collectionHeaders ?? base.collectionHeaders,
  };
}

describe("buildCurlCommand", () => {
  it("builds GET with merged query params", () => {
    const command = buildCurlCommand(
      sampleContext({
        draft: {
          method: "GET",
          url: "https://example.com/search",
          params: [{ key: "q", value: "hello world", enabled: true }],
          headers: [],
          body: "",
          body_type: "none",
          auth: {
            type: "none",
            basic: { username: "", password: "" },
            bearer: { token: "" },
          },
        },
      })
    );

    expect(command).toContain("'https://example.com/search?q=hello+world'");
    expect(command).not.toContain("-X");
  });

  it("builds POST with JSON body and auto Content-Type", () => {
    const command = buildCurlCommand(
      sampleContext({
        draft: {
          method: "POST",
          url: "https://example.com",
          params: [],
          headers: [],
          body: '{"ok":true}',
          body_type: "json",
          auth: {
            type: "none",
            basic: { username: "", password: "" },
            bearer: { token: "" },
          },
        },
      })
    );

    expect(command).toContain("-X POST");
    expect(command).toContain("'Content-Type: application/json'");
    expect(command).toContain("--data-raw '{\"ok\":true}'");
  });

  it("adds Bearer auth from the request Auth tab", () => {
    const command = buildCurlCommand(
      sampleContext({
        draft: {
          method: "GET",
          url: "https://example.com",
          params: [],
          headers: [],
          body: "",
          body_type: "none",
          auth: {
            type: "bearer",
            basic: { username: "", password: "" },
            bearer: { token: "abc123" },
          },
        },
      })
    );

    expect(command).toContain("'Authorization: Bearer abc123'");
  });

  it("inherits Basic auth from collection when request auth is none", () => {
    const command = buildCurlCommand(
      sampleContext({
        collectionAuth: {
          type: "basic",
          basic: { username: "alice", password: "secret" },
          bearer: { token: "" },
        },
        draft: {
          method: "GET",
          url: "https://example.com",
          params: [],
          headers: [],
          body: "",
          body_type: "none",
          auth: {
            type: "none",
            basic: { username: "", password: "" },
            bearer: { token: "" },
          },
        },
      })
    );

    expect(command).toContain("'Authorization: Basic ");
    expect(command).toContain(globalThis.btoa("alice:secret"));
  });

  it("prefers a manual Authorization header over Auth tab credentials", () => {
    const command = buildCurlCommand(
      sampleContext({
        draft: {
          method: "GET",
          url: "https://example.com",
          params: [],
          headers: [
            { key: "Authorization", value: "Bearer manual", enabled: true },
          ],
          body: "",
          body_type: "none",
          auth: {
            type: "bearer",
            basic: { username: "", password: "" },
            bearer: { token: "ignored" },
          },
        },
      })
    );

    expect(command).toContain("'Authorization: Bearer manual'");
    expect(command).not.toContain("ignored");
  });

  it("emits urlencoded and multipart body flags", () => {
    const urlencoded = buildCurlCommand(
      sampleContext({
        draft: {
          method: "POST",
          url: "https://example.com",
          params: [],
          headers: [],
          body: JSON.stringify([{ key: "name", value: "Ada", enabled: true }]),
          body_type: "urlencoded",
          auth: {
            type: "none",
            basic: { username: "", password: "" },
            bearer: { token: "" },
          },
        },
      })
    );

    expect(urlencoded).toContain("--data-urlencode 'name=Ada'");

    const multipart = buildCurlCommand(
      sampleContext({
        draft: {
          method: "POST",
          url: "https://example.com",
          params: [],
          headers: [],
          body: JSON.stringify([
            {
              key: "note",
              value: "hi",
              enabled: true,
              type: "text",
              files: [],
            },
            {
              key: "file",
              value: "",
              enabled: true,
              type: "file",
              files: ["/tmp/upload.bin"],
            },
          ]),
          body_type: "multipart",
          auth: {
            type: "none",
            basic: { username: "", password: "" },
            bearer: { token: "" },
          },
        },
      })
    );

    expect(multipart).toContain("-F 'note=hi'");
    expect(multipart).toContain("-F 'file=@/tmp/upload.bin'");
    expect(multipart).not.toContain("Content-Type");
  });
});
