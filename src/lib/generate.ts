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
    args.push(
      `params={${query.map((p) => `${pyString(p.key)}: ${pyString(p.value)}`).join(', ')}}`,
    );
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
    lines.push(`\treq, err := http.NewRequest(${goString(spec.method)}, ${goString(url)}, body)`);
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

function rubyString(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

export function toRubyNetHttp(spec: RequestSpec): string {
  const url = fullUrl(spec);
  // POST -> Post のように先頭だけ大文字へ。Net::HTTP::Post 等のクラス名に対応する
  const klass = spec.method.charAt(0) + spec.method.slice(1).toLowerCase();
  const headers = spec.headers.filter((h) => h.key !== '');
  const implied = impliedContentType(spec);
  const lines = ["require 'net/http'", "require 'uri'", ''];
  lines.push(`uri = URI(${rubyString(url)})`);
  lines.push('http = Net::HTTP.new(uri.host, uri.port)');
  lines.push("http.use_ssl = uri.scheme == 'https'");
  lines.push('');
  lines.push(`request = Net::HTTP::${klass}.new(uri)`);
  if (implied && hasBody(spec)) {
    lines.push(`request['Content-Type'] = ${rubyString(implied)}`);
  }
  for (const h of headers) lines.push(`request[${rubyString(h.key)}] = ${rubyString(h.value)}`);
  if (hasBody(spec)) lines.push(`request.body = ${rubyString(effectiveBody(spec))}`);
  lines.push('', 'response = http.request(request)', 'puts response.body');
  return lines.join('\n');
}

function phpString(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

export function toPhpCurl(spec: RequestSpec): string {
  const url = fullUrl(spec);
  const headers = spec.headers.filter((h) => h.key !== '');
  const implied = impliedContentType(spec);
  const lines = [
    '<?php',
    '',
    `$ch = curl_init(${phpString(url)});`,
    'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);',
  ];
  if (spec.method !== 'GET') {
    lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpString(spec.method)});`);
  }
  const headerItems = [
    ...(implied && hasBody(spec) ? [`Content-Type: ${implied}`] : []),
    ...headers.map((h) => `${h.key}: ${h.value}`),
  ];
  if (headerItems.length > 0) {
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
    for (const item of headerItems) lines.push(`    ${phpString(item)},`);
    lines.push(']);');
  }
  if (hasBody(spec)) {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpString(effectiveBody(spec))});`);
  }
  lines.push('', '$response = curl_exec($ch);', 'curl_close($ch);', 'echo $response;');
  return lines.join('\n');
}

// JSONが平坦なオブジェクトならHTTPieのフィールド構文へ。配列やネストはnullで生ボディへ回す
function flatJsonFields(jsonText: string): string[] | null {
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return Object.entries(value).map(([k, v]) =>
    typeof v === 'string' ? `${k}=${v}` : `${k}:=${JSON.stringify(v)}`,
  );
}

export function toHttpie(spec: RequestSpec): string {
  const headers = spec.headers.filter((h) => h.key !== '');
  const query = spec.query.filter((p) => p.key !== '');
  const flags: string[] = [];
  const fields: string[] = [];
  let rawBody: string | null = null;

  if (hasBody(spec)) {
    if (spec.bodyKind === 'form') {
      flags.push('--form');
      for (const line of spec.body.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        const eq = trimmed.indexOf('=');
        fields.push(eq === -1 ? `${trimmed}=` : `${trimmed.slice(0, eq)}=${trimmed.slice(eq + 1)}`);
      }
    } else if (spec.bodyKind === 'json') {
      const flat = flatJsonFields(spec.body);
      if (flat) fields.push(...flat);
      else rawBody = spec.body.trim();
    } else {
      rawBody = spec.body;
    }
  }
  if (rawBody !== null) flags.push(`--raw=${shellQuote(rawBody)}`);

  const parts = ['http', ...flags];
  if (spec.method !== 'GET') parts.push(spec.method);
  parts.push(shellQuote(spec.url));
  for (const p of query) parts.push(shellQuote(`${p.key}==${p.value}`));
  for (const h of headers) parts.push(shellQuote(`${h.key}:${h.value}`));
  // 生ボディのJSONはfield構文と違い自動でContent-Typeが付かないため補う
  if (
    rawBody !== null &&
    spec.bodyKind === 'json' &&
    !headers.some((h) => h.key.toLowerCase() === 'content-type')
  ) {
    parts.push('Content-Type:application/json');
  }
  parts.push(...fields.map(shellQuote));
  return parts.join(' ');
}

export function toRawHttp(spec: RequestSpec): string {
  const full = fullUrl(spec);
  let parsed: URL;
  try {
    parsed = new URL(full);
  } catch {
    return '# 有効なURLを入力すると生のHTTPリクエストを表示します';
  }
  const target = `${parsed.pathname}${parsed.search}` || '/';
  const lines = [`${spec.method} ${target} HTTP/1.1`, `Host: ${parsed.host}`];
  const implied = impliedContentType(spec);
  if (implied && hasBody(spec)) lines.push(`Content-Type: ${implied}`);
  for (const h of spec.headers.filter((h) => h.key !== '')) lines.push(`${h.key}: ${h.value}`);
  const body = hasBody(spec) ? effectiveBody(spec) : '';
  if (body !== '') lines.push(`Content-Length: ${new TextEncoder().encode(body).length}`);
  const head = lines.join('\r\n');
  return body === '' ? `${head}\r\n\r\n` : `${head}\r\n\r\n${body}`;
}

export { encodeFormBody };

export const GENERATORS = [
  { id: 'curl', name: 'curl', generate: toCurl },
  { id: 'fetch', name: 'fetch', generate: toFetch },
  { id: 'python', name: 'Python', generate: toPythonRequests },
  { id: 'go', name: 'Go', generate: toGoHttp },
  { id: 'ruby', name: 'Ruby', generate: toRubyNetHttp },
  { id: 'php', name: 'PHP', generate: toPhpCurl },
  { id: 'httpie', name: 'HTTPie', generate: toHttpie },
  { id: 'http', name: 'HTTP', generate: toRawHttp },
] as const;
