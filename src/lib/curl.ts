// curlコマンドの解釈と生成。シェルの引用規則(' と " と \)を尊重して字句分解する

import { emptySpec, type RequestSpec } from './request';

export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let started = false;
  const text = command.replace(/\\\r?\n/g, ' '); // 行継続を畳む

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '\\' && i + 1 < text.length && '"\\$`'.includes(text[i + 1]!)) {
        current += text[i + 1]!;
        i += 1;
      } else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch as "'" | '"';
      started = true;
      continue;
    }
    if (ch === '\\' && i + 1 < text.length) {
      current += text[i + 1]!;
      started = true;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started || current !== '') tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started || current !== '') tokens.push(current);
  return tokens;
}

export class CurlParseError extends Error {}

// 対応フラグ: -X/--request、-H/--header、-d/--data/--data-raw/--data-urlencode、
// --json、-u/--user、--url、-G/--get。未対応フラグは無視せずエラーにする
const IGNORED_FLAGS = new Set([
  '-s',
  '--silent',
  '-S',
  '--show-error',
  '-L',
  '--location',
  '-k',
  '--insecure',
  '--compressed',
  '-v',
  '--verbose',
  '-i',
  '--include',
  '-f',
  '--fail',
]);

export function parseCurl(command: string): RequestSpec {
  const tokens = tokenize(command.trim());
  if (tokens.length === 0 || !tokens[0]!.endsWith('curl')) {
    throw new CurlParseError('curlコマンドではない(先頭がcurlでない)');
  }

  const spec = emptySpec();
  const dataParts: string[] = [];
  let methodSet = false;
  let useGet = false;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = (): string => {
      i += 1;
      const value = tokens[i];
      if (value === undefined) throw new CurlParseError(`${token} の値がない`);
      return value;
    };

    if (token === '-X' || token === '--request') {
      spec.method = next().toUpperCase();
      methodSet = true;
    } else if (token === '-H' || token === '--header') {
      const raw = next();
      const colon = raw.indexOf(':');
      if (colon === -1) throw new CurlParseError(`ヘッダの形式が不正: ${raw}`);
      spec.headers.push({ key: raw.slice(0, colon).trim(), value: raw.slice(colon + 1).trim() });
    } else if (token === '-d' || token === '--data' || token === '--data-raw') {
      dataParts.push(next());
    } else if (token === '--data-urlencode') {
      dataParts.push(next());
    } else if (token === '--json') {
      dataParts.push(next());
      spec.headers.push({ key: 'Content-Type', value: 'application/json' });
    } else if (token === '-u' || token === '--user') {
      spec.headers.push({ key: 'Authorization', value: `Basic ${btoa(next())}` });
    } else if (token === '--url') {
      spec.url = next();
    } else if (token === '-G' || token === '--get') {
      useGet = true;
    } else if (IGNORED_FLAGS.has(token)) {
      // 挙動オプションはリクエスト内容に影響しないため読み飛ばす
    } else if (token.startsWith('-')) {
      throw new CurlParseError(`未対応のオプション: ${token}`);
    } else if (spec.url === '') {
      spec.url = token;
    } else {
      throw new CurlParseError(`解釈できない引数: ${token}`);
    }
  }

  if (spec.url === '') throw new CurlParseError('URLが見つからない');

  if (dataParts.length > 0) {
    const joined = dataParts.join('&');
    if (useGet) {
      spec.url += (spec.url.includes('?') ? '&' : '?') + joined;
    } else {
      spec.body = joined;
      const explicit = spec.headers.find((h) => h.key.toLowerCase() === 'content-type');
      spec.bodyKind = (explicit?.value ?? '').includes('json')
        ? 'json'
        : joined.trimStart().startsWith('{') || joined.trimStart().startsWith('[')
          ? 'json'
          : 'raw';
      if (!methodSet) spec.method = 'POST';
    }
  }

  // URL内のクエリはqueryリストへ分解して編集しやすくする
  const qIndex = spec.url.indexOf('?');
  if (qIndex !== -1) {
    const qs = spec.url.slice(qIndex + 1);
    spec.url = spec.url.slice(0, qIndex);
    for (const part of qs.split('&')) {
      if (part === '') continue;
      const eq = part.indexOf('=');
      spec.query.push({
        key: decodeURIComponent(eq === -1 ? part : part.slice(0, eq)),
        value: eq === -1 ? '' : decodeURIComponent(part.slice(eq + 1)),
      });
    }
  }
  return spec;
}
