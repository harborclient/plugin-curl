import { describe, expect, it } from 'vitest';
import type { RequestTabContext } from '@harborclient/sdk';
import { buildCurlCommand } from './buildCurl';
import { CurlParseError, parseCurl } from './parseCurl';

/**
 * Returns a minimal request tab context for curl round-trip tests.
 *
 * @param overrides - Partial context overrides.
 */
function sampleContext(overrides: Partial<RequestTabContext> = {}): RequestTabContext {
  const base: RequestTabContext = {
    readOnly: true,
    response: null,
    requestKey: 'GET https://example.com',
    collectionAuth: {
      type: 'none',
      basic: { username: '', password: '' },
      bearer: { token: '' }
    },
    collectionHeaders: [],
    variables: {},
    draft: {
      method: 'GET',
      url: 'https://example.com',
      params: [],
      headers: [],
      body: '',
      body_type: 'none',
      auth: {
        type: 'none',
        basic: { username: '', password: '' },
        bearer: { token: '' }
      }
    }
  };

  return {
    ...base,
    ...overrides,
    draft: { ...base.draft, ...overrides.draft },
    collectionAuth: overrides.collectionAuth ?? base.collectionAuth,
    collectionHeaders: overrides.collectionHeaders ?? base.collectionHeaders,
    variables: overrides.variables ?? base.variables
  };
}

describe('parseCurl', () => {
  it('parses a simple GET with URL', () => {
    const parsed = parseCurl("curl 'https://example.com/search?q=hello'");
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('https://example.com/search?q=hello');
    expect(parsed.bodyType).toBe('none');
    expect(parsed.body).toBe('');
  });

  it('parses POST with method, headers, and JSON body', () => {
    const command = [
      'curl -X POST \\',
      "  'https://example.com/users' \\",
      "  -H 'Content-Type: application/json' \\",
      "  -H 'Authorization: Bearer token' \\",
      '  --data-raw \'{"ok":true}\''
    ].join('\n');

    const parsed = parseCurl(command);
    expect(parsed.method).toBe('POST');
    expect(parsed.url).toBe('https://example.com/users');
    expect(parsed.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token'
    });
    expect(parsed.body).toBe('{"ok":true}');
    expect(parsed.bodyType).toBe('json');
  });

  it('parses urlencoded and multipart bodies', () => {
    const urlencoded = parseCurl(
      "curl -X POST 'https://example.com' --data-urlencode 'name=Ada' --data-urlencode 'role=admin'"
    );
    expect(urlencoded.bodyType).toBe('urlencoded');
    expect(JSON.parse(urlencoded.body ?? '[]')).toEqual([
      { key: 'name', value: 'Ada', enabled: true },
      { key: 'role', value: 'admin', enabled: true }
    ]);

    const multipart = parseCurl(
      "curl -X POST 'https://example.com' -F 'note=hi' -F 'file=@/tmp/upload.bin'"
    );
    expect(multipart.bodyType).toBe('multipart');
    expect(JSON.parse(multipart.body ?? '[]')).toEqual([
      { key: 'note', value: 'hi', enabled: true, type: 'text', files: [] },
      { key: 'file', value: '', enabled: true, type: 'file', files: ['/tmp/upload.bin'] }
    ]);
  });

  it('maps -u credentials to a Basic Authorization header', () => {
    const parsed = parseCurl("curl -u 'alice:secret' 'https://example.com'");
    expect(parsed.headers?.Authorization).toBe(`Basic ${globalThis.btoa('alice:secret')}`);
  });

  it('defaults to POST when data flags are present without -X', () => {
    const parsed = parseCurl("curl 'https://example.com' --data-raw 'hello'");
    expect(parsed.method).toBe('POST');
    expect(parsed.body).toBe('hello');
    expect(parsed.bodyType).toBe('text');
  });

  it('unescapes embedded single quotes from shell quoting', () => {
    const parsed = parseCurl("curl 'https://example.com' --data-raw 'it'\\''s fine'");
    expect(parsed.body).toBe("it's fine");
  });

  it('rejects empty or non-curl input', () => {
    expect(() => parseCurl('')).toThrow(CurlParseError);
    expect(() => parseCurl('wget https://example.com')).toThrow(/must start with curl/);
    expect(() => parseCurl('curl')).toThrow(/missing a URL/);
  });

  it('round-trips buildCurlCommand output for GET with headers', () => {
    const command = buildCurlCommand(
      sampleContext({
        draft: {
          method: 'GET',
          url: 'https://example.com/search',
          params: [{ key: 'q', value: 'hello world', enabled: true }],
          headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          body_type: 'none',
          auth: {
            type: 'none',
            basic: { username: '', password: '' },
            bearer: { token: '' }
          }
        }
      })
    );

    const parsed = parseCurl(command);
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('https://example.com/search?q=hello+world');
    expect(parsed.headers?.Accept).toBe('application/json');
  });

  it('round-trips buildCurlCommand output for POST JSON', () => {
    const command = buildCurlCommand(
      sampleContext({
        draft: {
          method: 'POST',
          url: 'https://example.com',
          params: [],
          headers: [],
          body: '{"ok":true}',
          body_type: 'json',
          auth: {
            type: 'none',
            basic: { username: '', password: '' },
            bearer: { token: '' }
          }
        }
      })
    );

    const parsed = parseCurl(command);
    expect(parsed.method).toBe('POST');
    expect(parsed.url).toBe('https://example.com');
    expect(parsed.body).toBe('{"ok":true}');
    expect(parsed.bodyType).toBe('json');
    expect(parsed.headers?.['Content-Type']).toBe('application/json');
  });

  it('round-trips urlencoded and multipart bodies from buildCurlCommand', () => {
    const urlencodedCommand = buildCurlCommand(
      sampleContext({
        draft: {
          method: 'POST',
          url: 'https://example.com',
          params: [],
          headers: [],
          body: JSON.stringify([{ key: 'name', value: 'Ada', enabled: true }]),
          body_type: 'urlencoded',
          auth: {
            type: 'none',
            basic: { username: '', password: '' },
            bearer: { token: '' }
          }
        }
      })
    );

    const urlencoded = parseCurl(urlencodedCommand);
    expect(urlencoded.bodyType).toBe('urlencoded');
    expect(JSON.parse(urlencoded.body ?? '[]')).toEqual([
      { key: 'name', value: 'Ada', enabled: true }
    ]);

    const multipartCommand = buildCurlCommand(
      sampleContext({
        draft: {
          method: 'POST',
          url: 'https://example.com',
          params: [],
          headers: [],
          body: JSON.stringify([
            { key: 'note', value: 'hi', enabled: true, type: 'text', files: [] },
            { key: 'file', value: '', enabled: true, type: 'file', files: ['/tmp/upload.bin'] }
          ]),
          body_type: 'multipart',
          auth: {
            type: 'none',
            basic: { username: '', password: '' },
            bearer: { token: '' }
          }
        }
      })
    );

    const multipart = parseCurl(multipartCommand);
    expect(multipart.bodyType).toBe('multipart');
    expect(JSON.parse(multipart.body ?? '[]')).toEqual([
      { key: 'note', value: 'hi', enabled: true, type: 'text', files: [] },
      { key: 'file', value: '', enabled: true, type: 'file', files: ['/tmp/upload.bin'] }
    ]);
  });
});
