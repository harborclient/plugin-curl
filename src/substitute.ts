import type { AuthConfig } from "@harborclient/plugin-api";

const VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Replaces {{key}} placeholders using a runtime variable map.
 *
 * @param text - Text containing variable placeholders.
 * @param runtimeVars - Current runtime variable values.
 */
export function substituteWithMap(
  text: string,
  runtimeVars: Record<string, string>
): string {
  return text.replace(VARIABLE_PATTERN, (match, key: string) => {
    const value = runtimeVars[key];
    return value !== undefined ? value : match;
  });
}

/**
 * Resolves {{variable}} placeholders in auth credential fields.
 *
 * @param auth - Auth config with raw editor values.
 * @param substitute - Function that resolves placeholders in a string.
 */
export function resolveAuthVariables(
  auth: AuthConfig,
  substitute: (text: string) => string
): AuthConfig {
  return {
    ...auth,
    basic: {
      username: substitute(auth.basic.username),
      password: substitute(auth.basic.password),
    },
    bearer: {
      token: substitute(auth.bearer.token),
    },
  };
}

type KeyValue = { key: string; value: string; enabled: boolean };

/**
 * Substitutes variables in key-value row values.
 *
 * @param rows - Header or param rows from the draft.
 * @param runtimeVars - Merged collection and environment variable map.
 */
export function substituteKeyValueRows(
  rows: KeyValue[],
  runtimeVars: Record<string, string>
): KeyValue[] {
  return rows.map((row) => ({
    ...row,
    value: substituteWithMap(row.value, runtimeVars),
  }));
}
