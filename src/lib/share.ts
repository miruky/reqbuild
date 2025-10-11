// RequestSpecをURLフラグメントへ可逆に詰める。共有リンクから同じリクエストを復元できる。
// 空のキーや既定値は落として短く保つ。多言語(日本語)を含むためUTF-8でencodeする。

import { emptySpec, METHODS, type BodyKind, type Pair, type RequestSpec } from './request';

const BODY_KINDS: BodyKind[] = ['none', 'json', 'form', 'raw'];

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function cleanPairs(pairs: Pair[]): Pair[] {
  return pairs
    .filter((p) => p.key !== '' || p.value !== '')
    .map((p) => ({ key: p.key, value: p.value }));
}

// 既定から外れた項目だけを持つ最小オブジェクトにする
export function encodeSpec(spec: RequestSpec): string {
  const minimal: Record<string, unknown> = { u: spec.url };
  if (spec.method !== 'GET') minimal['m'] = spec.method;
  const query = cleanPairs(spec.query);
  const headers = cleanPairs(spec.headers);
  if (query.length > 0) minimal['q'] = query.map((p) => [p.key, p.value]);
  if (headers.length > 0) minimal['h'] = headers.map((p) => [p.key, p.value]);
  if (spec.bodyKind !== 'none') minimal['k'] = spec.bodyKind;
  if (spec.body !== '') minimal['b'] = spec.body;
  return base64UrlEncode(JSON.stringify(minimal));
}

function toPairs(value: unknown): Pair[] {
  if (!Array.isArray(value)) return [];
  const out: Pair[] = [];
  for (const item of value) {
    if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string') {
      out.push({ key: item[0], value: item[1] });
    }
  }
  return out;
}

// 壊れた・改竄された入力ではnullを返し、呼び出し側で握りつぶせるようにする
export function decodeSpec(encoded: string): RequestSpec | null {
  if (encoded === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encoded));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['u'] !== 'string') return null;

  const spec = emptySpec();
  spec.url = obj['u'];
  if (typeof obj['m'] === 'string' && (METHODS as readonly string[]).includes(obj['m'])) {
    spec.method = obj['m'];
  }
  spec.query = toPairs(obj['q']);
  spec.headers = toPairs(obj['h']);
  if (typeof obj['k'] === 'string' && BODY_KINDS.includes(obj['k'] as BodyKind)) {
    spec.bodyKind = obj['k'] as BodyKind;
  }
  if (typeof obj['b'] === 'string') spec.body = obj['b'];
  return spec;
}
