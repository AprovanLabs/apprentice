export interface ParsedUri {
  scheme: string;
  path: string;
  query?: Record<string, string>;
  fragment?: string;
}

export function parseUri(uri: string): ParsedUri {
  const schemeMatch = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/);
  if (!schemeMatch) {
    throw new Error(`Invalid URI: ${uri}`);
  }

  const scheme = schemeMatch[1]!;
  let rest = schemeMatch[2]!;

  let fragment: string | undefined;
  const fragmentIdx = rest.indexOf('#');
  if (fragmentIdx !== -1) {
    fragment = rest.slice(fragmentIdx + 1);
    rest = rest.slice(0, fragmentIdx);
  }

  let query: Record<string, string> | undefined;
  const queryIdx = rest.indexOf('?');
  if (queryIdx !== -1) {
    const queryStr = rest.slice(queryIdx + 1);
    rest = rest.slice(0, queryIdx);
    query = {};
    for (const pair of queryStr.split('&')) {
      const [key, value] = pair.split('=');
      if (key) {
        query[decodeURIComponent(key)] = value
          ? decodeURIComponent(value)
          : '';
      }
    }
  }

  const path = rest.replace(/^\/\//, '');

  return { scheme, path, query, fragment };
}

export function formatUri(parsed: ParsedUri): string {
  let uri = `${parsed.scheme}:${parsed.path}`;

  if (parsed.query && Object.keys(parsed.query).length > 0) {
    const queryStr = Object.entries(parsed.query)
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
      )
      .join('&');
    uri += `?${queryStr}`;
  }

  if (parsed.fragment) {
    uri += `#${parsed.fragment}`;
  }

  return uri;
}

export function normalizeUri(uri: string): string {
  const parsed = parseUri(uri);
  parsed.scheme = parsed.scheme.toLowerCase();
  parsed.path = parsed.path
    .split('/')
    .filter((seg) => seg !== '.' && seg !== '')
    .reduce<string[]>((acc, seg) => {
      if (seg === '..') {
        acc.pop();
      } else {
        acc.push(seg);
      }
      return acc;
    }, [])
    .join('/');
  return formatUri(parsed);
}

export function fileUri(contextId: string, key: string): string {
  return `file://${contextId}/${key}`;
}

export function eventUri(eventId: string): string {
  return `event:${eventId}`;
}

export function isFileUri(uri: string): boolean {
  return uri.startsWith('file:');
}

export function isEventUri(uri: string): boolean {
  return uri.startsWith('event:');
}
