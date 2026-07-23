import type { ApplyRequestDraftPayload, BodyType } from '@harborclient/sdk';

type FormDataPart = {
  key: string;
  value: string;
  enabled: boolean;
  type: 'text' | 'file';
  files: string[];
};

type KeyValue = {
  key: string;
  value: string;
  enabled: boolean;
};

/**
 * Error thrown when a curl command cannot be parsed into a request draft.
 */
export class CurlParseError extends Error {
  /**
   * Creates a parse failure with a user-facing message.
   *
   * @param message - Human-readable parse error.
   */
  constructor(message: string) {
    super(message);
    this.name = 'CurlParseError';
  }
}

/**
 * Joins backslash-continued lines into a single curl command string.
 *
 * @param input - Raw editor text that may include `\` line continuations.
 * @returns Flattened command text with continuations removed.
 */
function joinContinuations(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .reduce((acc, line, index, lines) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return acc;
      }
      const continues = line.endsWith('\\');
      const segment = continues ? line.slice(0, -1).trimEnd() : trimmed;
      const separator = acc && !acc.endsWith(' ') ? ' ' : '';
      const next = `${acc}${separator}${segment}`;
      if (continues && index < lines.length - 1) {
        return next;
      }
      return next;
    }, '')
    .trim();
}

/**
 * Tokenizes a shell-like curl command, respecting single and double quotes.
 *
 * @param command - Flattened curl command without line continuations.
 * @returns Argument tokens in order.
 * @throws {CurlParseError} When quotes are unbalanced.
 */
function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let i = 0;

  while (i < command.length) {
    const char = command[i];

    if (quote === "'") {
      if (char === "'") {
        // curl builder escapes embedded single quotes as: '\''
        if (command.slice(i, i + 4) === `'\\''`) {
          current += "'";
          i += 4;
          continue;
        }
        quote = null;
        i += 1;
        continue;
      }
      current += char;
      i += 1;
      continue;
    }

    if (quote === '"') {
      if (char === '\\' && i + 1 < command.length) {
        current += command[i + 1];
        i += 2;
        continue;
      }
      if (char === '"') {
        quote = null;
        i += 1;
        continue;
      }
      current += char;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      i += 1;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  if (quote) {
    throw new CurlParseError('Unbalanced quotes in curl command.');
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Returns the next argument after a flag token, or throws when missing.
 *
 * @param tokens - Full token list.
 * @param index - Index of the flag token.
 * @param flag - Flag name for error messages.
 * @returns The following argument value and the index to continue from.
 */
function takeArg(
  tokens: string[],
  index: number,
  flag: string
): { value: string; nextIndex: number } {
  const value = tokens[index + 1];
  if (value === undefined) {
    throw new CurlParseError(`Missing value for ${flag}.`);
  }
  return { value, nextIndex: index + 2 };
}

/**
 * Splits a `Name: value` header string into key and value.
 *
 * @param header - Raw header argument from `-H`.
 * @returns Header key and value.
 */
function splitHeader(header: string): { key: string; value: string } {
  const colon = header.indexOf(':');
  if (colon === -1) {
    return { key: header.trim(), value: '' };
  }
  return {
    key: header.slice(0, colon).trim(),
    value: header.slice(colon + 1).trim()
  };
}

/**
 * Splits a `key=value` form or urlencode argument.
 *
 * @param part - Raw part after `-F` or `--data-urlencode`.
 * @returns Key and value (value may be empty).
 */
function splitKeyValue(part: string): { key: string; value: string } {
  const eq = part.indexOf('=');
  if (eq === -1) {
    return { key: part, value: '' };
  }
  return {
    key: part.slice(0, eq),
    value: part.slice(eq + 1)
  };
}

/**
 * Encodes Basic credentials into an Authorization header value.
 *
 * @param userpass - `user:password` from `-u` / `--user`.
 * @returns `Basic …` header value.
 */
function basicAuthHeader(userpass: string): string {
  return `Basic ${globalThis.btoa(userpass)}`;
}

/**
 * Infers HarborClient body type from collected curl body flags and content.
 *
 * @param options - Body parse state.
 * @returns Body type for {@link ApplyRequestDraftPayload}.
 */
function inferBodyType(options: {
  hasMultipart: boolean;
  hasUrlEncoded: boolean;
  rawBody: string;
}): BodyType {
  if (options.hasMultipart) {
    return 'multipart';
  }
  if (options.hasUrlEncoded) {
    return 'urlencoded';
  }
  if (!options.rawBody.trim()) {
    return 'none';
  }
  try {
    JSON.parse(options.rawBody);
    return 'json';
  } catch {
    return 'text';
  }
}

/**
 * Serializes urlencoded rows into the draft body JSON format HarborClient stores.
 *
 * @param rows - Parsed urlencode pairs.
 */
function serializeUrlEncoded(rows: KeyValue[]): string {
  return JSON.stringify(rows);
}

/**
 * Serializes multipart parts into the draft body JSON format HarborClient stores.
 *
 * @param parts - Parsed form parts.
 */
function serializeMultipart(parts: FormDataPart[]): string {
  return JSON.stringify(parts);
}

/**
 * Parses a curl command into an {@link ApplyRequestDraftPayload} for the active request.
 *
 * Supports the flags emitted by {@link buildCurlCommand} plus common variants users paste
 * (`-d`, `--data`, `--request`, `--url`, `-u`).
 *
 * @param input - Curl command text from the editor.
 * @returns Draft fields to apply via `hc.host.applyRequestDraft`.
 * @throws {CurlParseError} When the command is empty, not curl, or malformed.
 */
export function parseCurl(input: string): ApplyRequestDraftPayload {
  const flattened = joinContinuations(input);
  if (!flattened) {
    throw new CurlParseError('Curl command is empty.');
  }

  const tokens = tokenize(flattened);
  if (tokens.length === 0) {
    throw new CurlParseError('Curl command is empty.');
  }

  const first = tokens[0]?.toLowerCase();
  if (first !== 'curl') {
    throw new CurlParseError('Command must start with curl.');
  }

  let method: string | undefined;
  let url: string | undefined;
  const headers: Record<string, string> = {};
  const urlEncodedRows: KeyValue[] = [];
  const formParts: FormDataPart[] = [];
  const rawBodies: string[] = [];
  let hasMultipart = false;
  let hasUrlEncoded = false;
  let dataImpliesPost = false;

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      const { value, nextIndex } = takeArg(tokens, i, token);
      method = value.toUpperCase();
      i = nextIndex;
      continue;
    }

    if (token === '-H' || token === '--header') {
      const { value, nextIndex } = takeArg(tokens, i, token);
      const { key, value: headerValue } = splitHeader(value);
      if (key) {
        headers[key] = headerValue;
      }
      i = nextIndex;
      continue;
    }

    if (token === '--url') {
      const { value, nextIndex } = takeArg(tokens, i, token);
      url = value;
      i = nextIndex;
      continue;
    }

    if (token === '-u' || token === '--user') {
      const { value, nextIndex } = takeArg(tokens, i, token);
      headers.Authorization = basicAuthHeader(value);
      i = nextIndex;
      continue;
    }

    if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii'
    ) {
      const { value, nextIndex } = takeArg(tokens, i, token);
      rawBodies.push(value);
      dataImpliesPost = true;
      i = nextIndex;
      continue;
    }

    if (token === '--data-urlencode') {
      const { value, nextIndex } = takeArg(tokens, i, token);
      const { key, value: rowValue } = splitKeyValue(value);
      if (key.trim()) {
        urlEncodedRows.push({ key: key.trim(), value: rowValue, enabled: true });
        hasUrlEncoded = true;
        dataImpliesPost = true;
      }
      i = nextIndex;
      continue;
    }

    if (token === '-F' || token === '--form' || token === '--form-string') {
      const { value, nextIndex } = takeArg(tokens, i, token);
      const { key, value: partValue } = splitKeyValue(value);
      if (key.trim()) {
        hasMultipart = true;
        dataImpliesPost = true;
        if (partValue.startsWith('@')) {
          formParts.push({
            key: key.trim(),
            value: '',
            enabled: true,
            type: 'file',
            files: [partValue.slice(1)]
          });
        } else {
          formParts.push({
            key: key.trim(),
            value: partValue,
            enabled: true,
            type: 'text',
            files: []
          });
        }
      }
      i = nextIndex;
      continue;
    }

    // Ignore common no-arg flags users paste from browser "Copy as cURL".
    if (
      token === '-s' ||
      token === '--silent' ||
      token === '-S' ||
      token === '--show-error' ||
      token === '-L' ||
      token === '--location' ||
      token === '-k' ||
      token === '--insecure' ||
      token === '-g' ||
      token === '--globoff' ||
      token === '-v' ||
      token === '--verbose' ||
      token === '-i' ||
      token === '--include' ||
      token === '-compressed' ||
      token === '--compressed'
    ) {
      i += 1;
      continue;
    }

    // Ignore flags with a single argument we do not map (e.g. --max-time 30).
    if (
      token === '-A' ||
      token === '--user-agent' ||
      token === '-b' ||
      token === '--cookie' ||
      token === '-c' ||
      token === '--cookie-jar' ||
      token === '-e' ||
      token === '--referer' ||
      token === '-m' ||
      token === '--max-time' ||
      token === '--connect-timeout' ||
      token === '-o' ||
      token === '--output' ||
      token === '-w' ||
      token === '--write-out' ||
      token === '--proxy'
    ) {
      i += 2;
      continue;
    }

    if (token.startsWith('-')) {
      // Unknown flag: skip flag only; if next looks like a value (no leading -), skip it too.
      const next = tokens[i + 1];
      if (next && !next.startsWith('-') && next !== url) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (!url) {
      url = token;
      i += 1;
      continue;
    }

    throw new CurlParseError(`Unexpected argument: ${token}`);
  }

  if (!url) {
    throw new CurlParseError('Curl command is missing a URL.');
  }

  let body = '';
  if (hasMultipart) {
    body = serializeMultipart(formParts);
  } else if (hasUrlEncoded) {
    body = serializeUrlEncoded(urlEncodedRows);
  } else if (rawBodies.length > 0) {
    body = rawBodies.join('&');
  }

  const bodyType = inferBodyType({
    hasMultipart,
    hasUrlEncoded,
    rawBody: hasMultipart || hasUrlEncoded ? body : rawBodies.join('&')
  });

  if (!method) {
    method = dataImpliesPost ? 'POST' : 'GET';
  }

  const payload: ApplyRequestDraftPayload = {
    method,
    url,
    headers,
    body,
    bodyType: bodyType === 'none' && !body ? 'none' : bodyType
  };

  return payload;
}
