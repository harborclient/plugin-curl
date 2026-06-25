import type {
  AuthConfig,
  RequestDraft,
  RequestTabContext,
} from "@harborclient/plugin-api";
import {
  resolveAuthVariables,
  substituteKeyValueRows,
  substituteWithMap,
} from "./substitute";

type KeyValue = { key: string; value: string; enabled: boolean };

type FormDataPart = {
  key: string;
  value: string;
  enabled: boolean;
  type: "text" | "file";
  files: string[];
};

/**
 * Returns whether a header field contains control characters unsafe for HTTP.
 *
 * @param value - Header name or value to inspect.
 */
function hasUnsafeHeaderFieldChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Encodes username and password as a UTF-8-safe Basic Auth credential string.
 *
 * @param username - Basic Auth username.
 * @param password - Basic Auth password.
 */
function encodeBasicAuth(username: string, password: string): string {
  const credential = `${username}:${password}`;
  const bytes = new TextEncoder().encode(credential);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}

/**
 * Builds the Authorization header value from an auth config.
 *
 * @param auth - Auth configuration from the request or collection.
 */
function buildAuthHeaderValue(auth: AuthConfig): string | null {
  if (auth.type === "none") {
    return null;
  }

  if (auth.type === "basic") {
    const username = auth.basic.username.trim();
    const password = auth.basic.password;
    if (!username && !password.trim()) {
      return null;
    }
    return `Basic ${encodeBasicAuth(username, password)}`;
  }

  const token = auth.bearer.token.trim();
  if (!token || hasUnsafeHeaderFieldChars(token)) {
    return null;
  }
  return `Bearer ${token}`;
}

/**
 * Returns whether a URL string is a root-relative path.
 *
 * @param url - Trimmed URL string.
 */
function isRootRelativePath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/**
 * Appends query parameters via string concatenation for root-relative paths.
 *
 * @param trimmed - Trimmed base URL that failed absolute URL parsing.
 * @param enabledParams - Enabled key-value pairs to append.
 */
function appendQueryFallback(
  trimmed: string,
  enabledParams: KeyValue[]
): string {
  const separator = trimmed.includes("?") ? "&" : "?";
  const query = enabledParams
    .map(
      (param) =>
        `${encodeURIComponent(param.key.trim())}=${encodeURIComponent(
          param.value
        )}`
    )
    .join("&");
  return `${trimmed}${separator}${query}`;
}

/**
 * Merges enabled query parameters into a base URL.
 *
 * @param baseUrl - Request URL before query string merging.
 * @param params - Key-value pairs to append as search params.
 */
function buildUrl(baseUrl: string, params: KeyValue[]): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  const enabledParams = params.filter(
    (param) => param.enabled && param.key.trim()
  );
  if (enabledParams.length === 0) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return trimmed;
    }
    for (const param of enabledParams) {
      url.searchParams.set(param.key.trim(), param.value);
    }
    return url.toString();
  } catch {
    if (!isRootRelativePath(trimmed)) {
      return trimmed;
    }
    return appendQueryFallback(trimmed, enabledParams);
  }
}

/**
 * Returns enabled key-value rows with non-empty keys.
 *
 * @param rows - Header or param rows from the draft.
 */
function enabledRows(rows: KeyValue[]): KeyValue[] {
  return rows.filter((row) => row.enabled && row.key.trim());
}

/**
 * Returns true when any enabled row is a non-empty Authorization header.
 *
 * @param rows - Header rows to inspect.
 */
function hasManualAuthorization(rows: KeyValue[]): boolean {
  return enabledRows(rows).some(
    (row) =>
      row.key.trim().toLowerCase() === "authorization" &&
      row.value.trim() !== ""
  );
}

/**
 * Builds outgoing request headers mirroring HarborClient send-time defaults.
 *
 * @param draft - Active request draft.
 * @param collectionHeaders - Collection-level headers.
 * @param authValue - Computed Authorization header value, if any.
 */
function buildHeaders(
  draft: RequestDraft,
  collectionHeaders: KeyValue[],
  authValue: string | null
): Record<string, string> {
  const mergedRows = [
    ...(authValue &&
      !hasManualAuthorization([...collectionHeaders, ...draft.headers])
      ? [{ key: "Authorization", value: authValue, enabled: true }]
      : []),
    ...collectionHeaders,
    ...draft.headers,
  ];

  const result: Record<string, string> = {};
  for (const header of enabledRows(mergedRows)) {
    const key = header.key.trim();
    if (
      draft.body_type === "multipart" &&
      key.toLowerCase() === "content-type"
    ) {
      continue;
    }
    result[key] = header.value;
  }

  const hasContentType = Object.keys(result).some(
    (key) => key.toLowerCase() === "content-type"
  );
  if (!hasContentType) {
    if (draft.body_type === "json") {
      result["Content-Type"] = "application/json";
    } else if (draft.body_type === "text") {
      result["Content-Type"] = "text/plain";
    } else if (draft.body_type === "urlencoded") {
      result["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }

  return result;
}

/**
 * Parses a serialized urlencoded body string into key-value rows.
 *
 * @param body - JSON array stored in the request body field.
 */
function parseUrlEncodedParts(body: string): KeyValue[] {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((row) => {
      const record = row as Partial<KeyValue>;
      return {
        key: typeof record.key === "string" ? record.key : "",
        value: typeof record.value === "string" ? record.value : "",
        enabled: record.enabled !== false,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Parses a serialized multipart body string into form parts.
 *
 * @param body - JSON array stored in the request body field.
 */
function parseFormParts(body: string): FormDataPart[] {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((part) => {
      const record = part as Partial<FormDataPart>;
      return {
        key: typeof record.key === "string" ? record.key : "",
        value: typeof record.value === "string" ? record.value : "",
        enabled: record.enabled !== false,
        type: record.type === "file" ? "file" : "text",
        files: Array.isArray(record.files)
          ? record.files.filter(
            (file): file is string => typeof file === "string"
          )
          : [],
      };
    });
  } catch {
    return [];
  }
}

/**
 * Wraps a shell argument in single quotes with embedded quote escaping.
 *
 * @param value - Raw argument value.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Appends a line to the curl command with optional line continuation.
 *
 * @param lines - Accumulated command lines.
 * @param segment - Argument segment to append.
 */
function appendSegment(lines: string[], segment: string): void {
  if (lines.length === 0) {
    lines.push(`curl ${segment}`);
    return;
  }
  const lastIndex = lines.length - 1;
  lines[lastIndex] = `${lines[lastIndex]} \\`;
  lines.push(`  ${segment}`);
}

/**
 * Builds urlencoded body flags for curl.
 *
 * @param body - Serialized urlencoded rows JSON.
 * @param lines - Accumulated command lines.
 */
function appendUrlEncodedBody(body: string, lines: string[]): void {
  const rows = parseUrlEncodedParts(body).filter(
    (row) => row.enabled && row.key.trim()
  );
  for (const row of rows) {
    appendSegment(
      lines,
      `--data-urlencode ${shellQuote(`${row.key.trim()}=${row.value}`)}`
    );
  }
}

/**
 * Builds multipart form flags for curl.
 *
 * @param body - Serialized multipart parts JSON.
 * @param lines - Accumulated command lines.
 */
function appendMultipartBody(body: string, lines: string[]): void {
  const parts = parseFormParts(body).filter(
    (part) => part.enabled && part.key.trim()
  );
  for (const part of parts) {
    const key = part.key.trim();
    if (part.type === "file") {
      for (const filePath of part.files) {
        appendSegment(lines, `-F ${shellQuote(`${key}=@${filePath}`)}`);
      }
      continue;
    }
    appendSegment(lines, `-F ${shellQuote(`${key}=${part.value}`)}`);
  }
}

/**
 * Appends body-related curl flags based on body type.
 *
 * @param draft - Active request draft.
 * @param lines - Accumulated command lines.
 */
function appendBodyFlags(draft: RequestDraft, lines: string[]): void {
  if (draft.method === "GET" || draft.method === "HEAD") {
    return;
  }

  if (draft.body_type === "none" || !draft.body.trim()) {
    return;
  }

  if (draft.body_type === "urlencoded") {
    appendUrlEncodedBody(draft.body, lines);
    return;
  }

  if (draft.body_type === "multipart") {
    appendMultipartBody(draft.body, lines);
    return;
  }

  appendSegment(lines, `--data-raw ${shellQuote(draft.body)}`);
}

/**
 * Builds an equivalent curl command for the active request tab context.
 *
 * @param context - Read-only request tab context from HarborClient.
 */
export function buildCurlCommand(context: RequestTabContext): string {
  const { draft, collectionAuth, collectionHeaders, variables } = context;
  const substitute = (text: string): string =>
    substituteWithMap(text, variables);

  const resolvedDraft: RequestDraft = {
    ...draft,
    url: substitute(draft.url),
    body: substitute(draft.body),
    params: substituteKeyValueRows(draft.params, variables),
    headers: substituteKeyValueRows(draft.headers, variables),
    auth: resolveAuthVariables(draft.auth, substitute),
  };
  const resolvedCollectionHeaders = substituteKeyValueRows(
    collectionHeaders,
    variables
  );
  const resolvedCollectionAuth = resolveAuthVariables(
    collectionAuth,
    substitute
  );

  const effectiveAuth =
    resolvedDraft.auth.type !== "none"
      ? resolvedDraft.auth
      : resolvedCollectionAuth;
  const authValue = buildAuthHeaderValue(effectiveAuth);
  const url = buildUrl(resolvedDraft.url, resolvedDraft.params);
  const headers = buildHeaders(
    resolvedDraft,
    resolvedCollectionHeaders,
    authValue
  );
  const lines: string[] = [];

  if (resolvedDraft.method.toUpperCase() !== "GET") {
    appendSegment(lines, `-X ${resolvedDraft.method.toUpperCase()}`);
  }

  appendSegment(lines, shellQuote(url));

  for (const [key, value] of Object.entries(headers)) {
    appendSegment(lines, `-H ${shellQuote(`${key}: ${value}`)}`);
  }

  appendBodyFlags(resolvedDraft, lines);

  return lines.join("\n");
}
