// RequestSpecから各クライアントのコードを生成する。
// それぞれの言語の慣用句(fetchのasync/await、requestsのparams等)に合わせる

import {
  effectiveBody,
  encodeFormBody,
  fullUrl,
  hasBody,
  impliedContentType,
  type RequestSpec,
} from './request';

function shellQuote(text: string): string {
  if (/^[A-Za-z0-9_\-./:=@?&%+,]*$/.test(text)) return text;
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

export function toCurl(spec: RequestSpec): string {
  const lines: string[] = [];
  const url = fullUrl(spec);
  const method = spec.method;
  const first =
    method === 'GET' ? `curl ${shellQuote(url)}` : `curl -X ${method} ${shellQuote(url)}`;
  lines.push(first);
  const implied = impliedContentType(spec);
  if (implied && hasBody(spec)) lines.push(`  -H ${shellQuote(`Content-Type: ${implied}`)}`);
  for (const h of spec.headers.filter((h) => h.key !== '')) {
    lines.push(`  -H ${shellQuote(`${h.key}: ${h.value}`)}`);
  }
  if (hasBody(spec)) lines.push(`  -d ${shellQuote(effectiveBody(spec))}`);
  return lines.join(' \\\n');
}

function jsString(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
}

export function toFetch(spec: RequestSpec): string {
  const url = fullUrl(spec);
  const headers = spec.headers.filter((h) => h.key !== '');
  const implied = impliedContentType(spec);
  const lines: string[] = [`const response = await fetch(${jsString(url)}`];

  const optionLines: string[] = [];
  if (spec.method !== 'GET') optionLines.push(`  method: ${jsString(spec.method)},`);
  if (headers.length > 0 || (implied && hasBody(spec))) {
    const entries = [
      ...(implied && hasBody(spec) ? [`    'Content-Type': ${jsString(implied)},`] : []),
      ...headers.map((h) => `    ${jsString(h.key)}: ${jsString(h.value)},`),
    ];
    optionLines.push('  headers: {', ...entries, '  },');
  }
  if (hasBody(spec)) {
    if (spec.bodyKind === 'json') {
      optionLines.push(`  body: JSON.stringify(${spec.body.trim()}),`);
    } else {
      optionLines.push(`  body: ${jsString(effectiveBody(spec))},`);
    }
  }

  if (optionLines.length === 0) {
    lines[0] += ');';
  } else {
    lines[0] += ', {';
    lines.push(...optionLines, '});');
  }
  lines.push('const data = await response.json();');
  return lines.join('\n');
}

function pyString(text: string): string {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;
}

export function toPythonRequests(spec: RequestSpec): string {
  const lines = ['import requests', ''];
  const args: string[] = [pyString(spec.url)];
  const query = spec.query.filter((p) => p.key !== '');
  if (query.length > 0) {
    args.push(`params={${query.map((p) => `${pyString(p.key)}: ${pyString(p.value)}`).join(', ')}}`);
  }
  const headers = spec.headers.filter((h) => h.key !== '');
  const implied = impliedContentType(spec);
  const headerEntries = [
    ...headers.map((h) => `${pyString(h.key)}: ${pyString(h.value)}`),
    // requestsはjson=で自動付与するため、JSONのContent-Typeは明示しない
    ...(implied === 'application/x-www-form-urlencoded' ? [] : []),
  ];
  if (headerEntries.length > 0) args.push(`headers={${headerEntries.join(', ')}}`);
  if (hasBody(spec)) {
    if (spec.bodyKind === 'json') args.push(`json=${pythonLiteral(spec.body)}`);
    else if (spec.bodyKind === 'form') {
      const pairs = spec.body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
        .map((l) => {
          const eq = l.indexOf('=');
          return `${pyString(eq === -1 ? l : l.slice(0, eq))}: ${pyString(eq === -1 ? '' : l.slice(eq + 1))}`;
        });
      args.push(`data={${pairs.join(', ')}}`);
    } else args.push(`data=${pyString(spec.body)}`);
  }
  lines.push(`response = requests.${spec.method.toLowerCase()}(`);
  lines.push(...args.map((a) => `    ${a},`));
  lines.push(')');
  lines.push('response.raise_for_status()');
  lines.push('print(response.json())');
  return lines.join('\n');
}

// JSONとして読めればPythonリテラル(True/None)へ写す。読めなければ文字列で渡す
function pythonLiteral(jsonText: string): string {
  try {
    return toPy(JSON.parse(jsonText));
  } catch {
    return pyString(jsonText);
  }
}

function toPy(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return pyString(value);
  if (Array.isArray(value)) return `[${value.map(toPy).join(', ')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${pyString(k)}: ${toPy(v)}`)
    .join(', ')}}`;
}

function goString(text: string): string {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;
}

export function toGoHttp(spec: RequestSpec): string {
  const url = fullUrl(spec);
  const headers = spec.headers.filter((h) => h.key !== '');
  const implied = impliedContentType(spec);
  const lines: string[] = ['package main', '', 'import (', '\t"fmt"', '\t"io"', '\t"net/http"'];
  if (hasBody(spec)) lines.splice(4, 0, '\t"strings"');
  lines.push(')', '', 'func main() {');
  if (hasBody(spec)) {
    lines.push(`\tbody := strings.NewReader(${goString(effectiveBody(spec))})`);
    lines.push(
      `\treq, err := http.NewRequest(${goString(spec.method)}, ${goString(url)}, body)`,
    );
  } else {
    lines.push(`\treq, err := http.NewRequest(${goString(spec.method)}, ${goString(url)}, nil)`);
  }
  lines.push('\tif err != nil {', '\t\tpanic(err)', '\t}');
  if (implied && hasBody(spec)) {
    lines.push(`\treq.Header.Set("Content-Type", ${goString(implied)})`);
  }
  for (const h of headers) {
    lines.push(`\treq.Header.Set(${goString(h.key)}, ${goString(h.value)})`);
  }
  lines.push(
    '',
    '\tresp, err := http.DefaultClient.Do(req)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tdefer resp.Body.Close()',
    '',
    '\tdata, _ := io.ReadAll(resp.Body)',
    '\tfmt.Println(resp.Status, string(data))',
    '}',
  );
  return lines.join('\n');
}

export { encodeFormBody };

export const GENERATORS = [
  { id: 'curl', name: 'curl', generate: toCurl },
  { id: 'fetch', name: 'fetch(JS)', generate: toFetch },
  { id: 'python', name: 'Python requests', generate: toPythonRequests },
  { id: 'go', name: 'Go net/http', generate: toGoHttp },
] as const;
