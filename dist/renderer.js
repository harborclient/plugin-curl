// node_modules/.pnpm/@harborclient+plugin-api@0.3.2_react@19.2.7/node_modules/@harborclient/plugin-api/dist/runtime/reactHost.js
var hostReact = null;
function setHostReact(react) {
  hostReact = react;
}
function requireHostReact() {
  if (hostReact == null) {
    throw new Error(
      "Plugin React host is not installed. Call installReact(hc.react) at the start of activate()."
    );
  }
  return hostReact;
}

// node_modules/.pnpm/@harborclient+plugin-api@0.3.2_react@19.2.7/node_modules/@harborclient/plugin-api/dist/runtime/index.js
function installReact(react) {
  setHostReact(react);
}

// node_modules/.pnpm/@harborclient+plugin-api@0.3.2_react@19.2.7/node_modules/@harborclient/plugin-api/dist/runtime/react.js
function hook(name) {
  const react = requireHostReact();
  const fn = react[name];
  if (typeof fn !== "function") {
    throw new Error(`React hook "${String(name)}" is not available on hc.react.`);
  }
  return fn;
}
function useState(initialState) {
  return hook("useState")(initialState);
}
function useMemo(factory, deps) {
  return hook("useMemo")(factory, deps);
}

// node_modules/.pnpm/@harborclient+plugin-api@0.3.2_react@19.2.7/node_modules/@harborclient/plugin-api/dist/clipboard.js
async function copyToClipboard(hc, text, options) {
  await navigator.clipboard.writeText(text);
  if (options?.toast) {
    hc.ui.showToast(options.toast, { duration: options.duration });
  }
}

// node_modules/.pnpm/@harborclient+plugin-api@0.3.2_react@19.2.7/node_modules/@harborclient/plugin-api/dist/http/substitute.js
var VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;
function substituteVariables(text, runtimeVars) {
  return text.replace(VARIABLE_PATTERN, (match, key) => {
    const value = runtimeVars[key];
    return value !== void 0 ? value : match;
  });
}
function resolveAuthVariables(auth, substitute) {
  return {
    ...auth,
    basic: {
      username: substitute(auth.basic.username),
      password: substitute(auth.basic.password)
    },
    bearer: {
      token: substitute(auth.bearer.token)
    }
  };
}
function substituteKeyValueRows(rows, runtimeVars) {
  return rows.map((row) => ({
    ...row,
    value: substituteVariables(row.value, runtimeVars)
  }));
}

// node_modules/.pnpm/@harborclient+plugin-api@0.3.2_react@19.2.7/node_modules/@harborclient/plugin-api/dist/http/resolveRequest.js
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
  if (typeof TextEncoder !== "undefined" && typeof globalThis.btoa === "function") {
    const bytes = new TextEncoder().encode(credential);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return globalThis.btoa(binary);
  }
  return globalThis.btoa?.(credential) ?? credential;
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
  const query = enabledParams.map((param) => `${encodeURIComponent(param.key.trim())}=${encodeURIComponent(param.value)}`).join("&");
  return `${trimmed}${separator}${query}`;
}
function buildUrl(baseUrl, params) {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return trimmed;
  }
  const enabledParams = params.filter((param) => param.enabled && param.key.trim());
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
  return enabledRows(rows).some((row) => row.key.trim().toLowerCase() === "authorization" && row.value.trim() !== "");
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
  const hasContentType = Object.keys(result).some((key) => key.toLowerCase() === "content-type");
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
function resolveRequest(context) {
  const { draft, collectionAuth, collectionHeaders, variables } = context;
  const substitute = (text) => substituteVariables(text, variables);
  const resolvedDraft = {
    ...draft,
    url: substitute(draft.url),
    body: substitute(draft.body),
    params: substituteKeyValueRows(draft.params, variables),
    headers: substituteKeyValueRows(draft.headers, variables),
    auth: resolveAuthVariables(draft.auth, substitute)
  };
  const resolvedCollectionHeaders = substituteKeyValueRows(collectionHeaders, variables);
  const resolvedCollectionAuth = resolveAuthVariables(collectionAuth, substitute);
  const effectiveAuth = resolvedDraft.auth.type !== "none" ? resolvedDraft.auth : resolvedCollectionAuth;
  const authValue = buildAuthHeaderValue(effectiveAuth);
  const url = buildUrl(resolvedDraft.url, resolvedDraft.params);
  const headers = buildHeaders(resolvedDraft, resolvedCollectionHeaders, authValue);
  return {
    method: resolvedDraft.method,
    url,
    headers,
    body: resolvedDraft.body
  };
}

// src/buildCurl.ts
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
  const resolved = resolveRequest(context);
  const draftForBody = {
    ...context.draft,
    body: resolved.body,
    method: resolved.method
  };
  const lines = [];
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

// node_modules/.pnpm/@harborclient+plugin-api@0.3.2_react@19.2.7/node_modules/@harborclient/plugin-api/dist/runtime/jsx-runtime.js
var Fragment = Symbol.for("@harborclient/plugin-api.Fragment");
function build(type, props, key) {
  const react = requireHostReact();
  const elementType = type === Fragment ? react.Fragment : type;
  const { children, ...rest } = props ?? {};
  if (key !== void 0) {
    rest.key = key;
  }
  return react.createElement(elementType, rest, children);
}
var jsx = build;
var jsxs = build;

// src/CurlTab.tsx
function CurlTab({ context, hc }) {
  const command = useMemo(() => buildCurlCommand(context), [context]);
  const [copyError, setCopyError] = useState(null);
  const handleCopy = async () => {
    setCopyError(null);
    try {
      await copyToClipboard(hc, command, { toast: "Copied to clipboard" });
    } catch {
      setCopyError("Failed to copy");
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2", style: { minHeight: "320px" }, children: [
    /* @__PURE__ */ jsx("div", { className: "flex shrink-0 items-center justify-end", children: /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: "rounded-md bg-control px-3 py-1.5 text-[14px] text-text hover:bg-control-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "aria-label": "Copy cURL command",
        onClick: () => {
          void handleCopy();
        },
        children: "Copy"
      }
    ) }),
    /* @__PURE__ */ jsx(
      "textarea",
      {
        readOnly: true,
        rows: 14,
        "aria-label": "cURL command",
        "aria-invalid": copyError != null,
        "aria-describedby": copyError != null ? "curl-copy-error" : void 0,
        className: "w-full flex-1 resize-y rounded-md border border-separator bg-control p-3 font-mono text-[14px] text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        style: { minHeight: "280px", width: "100%" },
        value: command
      }
    ),
    copyError != null ? /* @__PURE__ */ jsx(
      "p",
      {
        id: "curl-copy-error",
        className: "text-[14px] text-danger",
        role: "status",
        children: copyError
      }
    ) : null
  ] });
}

// src/renderer.tsx
function activate(hc) {
  installReact(hc.react);
  hc.subscriptions.push(
    hc.ui.registerRequestTab({
      id: "curl",
      title: "cURL",
      order: 45,
      Component: ({ context }) => /* @__PURE__ */ jsx(CurlTab, { context, hc })
    })
  );
}
export {
  activate
};
