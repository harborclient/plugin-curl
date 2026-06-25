import type { RequestDraft, RequestTabContext } from "@harborclient/plugin-api";
import { resolveRequest } from "@harborclient/plugin-api/http";

type KeyValue = { key: string; value: string; enabled: boolean };

type FormDataPart = {
  key: string;
  value: string;
  enabled: boolean;
  type: "text" | "file";
  files: string[];
};

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
 * @param draft - Active request draft with substituted body content.
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
  const resolved = resolveRequest(context);
  const draftForBody: RequestDraft = {
    ...context.draft,
    body: resolved.body,
    method: resolved.method,
  };
  const lines: string[] = [];

  if (resolved.method.toUpperCase() !== "GET") {
    appendSegment(lines, `-X ${resolved.method.toUpperCase()}`);
  }

  appendSegment(lines, shellQuote(resolved.url));

  for (const [key, value] of Object.entries(resolved.headers)) {
    appendSegment(lines, `-H ${shellQuote(`${key}: ${value}`)}`);
  }

  appendBodyFlags(draftForBody, lines);

  return lines.join("\n");
}
