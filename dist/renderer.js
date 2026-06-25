// src/buildCurl.ts
function hasUnsafeHeaderFieldChars(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}
function encodeBasicAuth(username, password) {
  const credential = `${username}:${password}`;
  const bytes = new TextEncoder().encode(credential);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}
function buildAuthHeaderValue(auth) {
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
function isRootRelativePath(url) {
  return url.startsWith("/") && !url.startsWith("//");
}
function appendQueryFallback(trimmed, enabledParams) {
  const separator = trimmed.includes("?") ? "&" : "?";
  const query = enabledParams.map(
    (param) => `${encodeURIComponent(param.key.trim())}=${encodeURIComponent(
      param.value
    )}`
  ).join("&");
  return `${trimmed}${separator}${query}`;
}
function buildUrl(baseUrl, params) {
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
function enabledRows(rows) {
  return rows.filter((row) => row.enabled && row.key.trim());
}
function hasManualAuthorization(rows) {
  return enabledRows(rows).some(
    (row) => row.key.trim().toLowerCase() === "authorization" && row.value.trim() !== ""
  );
}
function buildHeaders(draft, collectionHeaders, authValue) {
  const mergedRows = [
    ...authValue && !hasManualAuthorization([...collectionHeaders, ...draft.headers]) ? [{ key: "Authorization", value: authValue, enabled: true }] : [],
    ...collectionHeaders,
    ...draft.headers
  ];
  const result = {};
  for (const header of enabledRows(mergedRows)) {
    const key = header.key.trim();
    if (draft.body_type === "multipart" && key.toLowerCase() === "content-type") {
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
function parseUrlEncodedParts(body) {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((row) => {
      const record = row;
      return {
        key: typeof record.key === "string" ? record.key : "",
        value: typeof record.value === "string" ? record.value : "",
        enabled: record.enabled !== false
      };
    });
  } catch {
    return [];
  }
}
function parseFormParts(body) {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((part) => {
      const record = part;
      return {
        key: typeof record.key === "string" ? record.key : "",
        value: typeof record.value === "string" ? record.value : "",
        enabled: record.enabled !== false,
        type: record.type === "file" ? "file" : "text",
        files: Array.isArray(record.files) ? record.files.filter(
          (file) => typeof file === "string"
        ) : []
      };
    });
  } catch {
    return [];
  }
}
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function appendSegment(lines, segment) {
  if (lines.length === 0) {
    lines.push(`curl ${segment}`);
    return;
  }
  const lastIndex = lines.length - 1;
  lines[lastIndex] = `${lines[lastIndex]} \\`;
  lines.push(`  ${segment}`);
}
function appendUrlEncodedBody(body, lines) {
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
function appendMultipartBody(body, lines) {
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
function appendBodyFlags(draft, lines) {
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
function buildCurlCommand(context) {
  const { draft, collectionAuth, collectionHeaders } = context;
  const effectiveAuth = draft.auth.type !== "none" ? draft.auth : collectionAuth;
  const authValue = buildAuthHeaderValue(effectiveAuth);
  const url = buildUrl(draft.url, draft.params);
  const headers = buildHeaders(draft, collectionHeaders, authValue);
  const lines = [];
  if (draft.method.toUpperCase() !== "GET") {
    appendSegment(lines, `-X ${draft.method.toUpperCase()}`);
  }
  appendSegment(lines, shellQuote(url));
  for (const [key, value] of Object.entries(headers)) {
    appendSegment(lines, `-H ${shellQuote(`${key}: ${value}`)}`);
  }
  appendBodyFlags(draft, lines);
  return lines.join("\n");
}

// src/CurlTab.ts
function createCurlTab(React) {
  const { createElement: h, useMemo, useState } = React;
  function CurlTab({
    context,
    showToast
  }) {
    const command = useMemo(() => buildCurlCommand(context), [context]);
    const [copyError, setCopyError] = useState(null);
    const handleCopy = async () => {
      setCopyError(null);
      try {
        await navigator.clipboard.writeText(command);
        showToast("Copied to clipboard");
      } catch {
        setCopyError("Failed to copy");
      }
    };
    return h(
      "div",
      { className: "flex flex-col gap-2", style: { minHeight: "320px" } },
      h(
        "div",
        { className: "flex shrink-0 items-center justify-end" },
        h(
          "button",
          {
            type: "button",
            className: "rounded-md bg-control px-3 py-1.5 text-[14px] text-text hover:bg-control-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            "aria-label": "Copy cURL command",
            onClick: () => {
              void handleCopy();
            }
          },
          "Copy"
        )
      ),
      h("textarea", {
        readOnly: true,
        rows: 14,
        "aria-label": "cURL command",
        "aria-invalid": copyError != null,
        "aria-describedby": copyError != null ? "curl-copy-error" : void 0,
        className: "w-full flex-1 resize-y rounded-md border border-separator bg-control p-3 font-mono text-[14px] text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        style: { minHeight: "280px", width: "100%" },
        value: command
      }),
      copyError != null ? h(
        "p",
        {
          id: "curl-copy-error",
          className: "text-[14px] text-danger",
          role: "status"
        },
        copyError
      ) : null
    );
  }
  return CurlTab;
}

// src/renderer.ts
function activate(hc) {
  const showToast = hc.ui.showToast.bind(hc.ui);
  const CurlTab = createCurlTab(hc.react);
  const { createElement: h } = hc.react;
  hc.subscriptions.push(
    hc.ui.registerRequestTab({
      id: "curl",
      title: "cURL",
      order: 45,
      Component: ({ context }) => h(CurlTab, { context, showToast })
    })
  );
}
export {
  activate
};
