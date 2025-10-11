// リクエストの中立表現。フォーム・curl取り込み・各言語ジェネレータの共通土台

export interface Pair {
  key: string;
  value: string;
}

export type BodyKind = 'none' | 'json' | 'form' | 'raw';

export interface RequestSpec {
  method: string;
  url: string;
  query: Pair[];
  headers: Pair[];
  bodyKind: BodyKind;
  body: string;
}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export function emptySpec(): RequestSpec {
  return { method: 'GET', url: '', query: [], headers: [], bodyKind: 'none', body: '' };
}

// クエリを合成した最終URL。既存のクエリ文字列があれば後ろに連結する
export function fullUrl(spec: RequestSpec): string {
  const pairs = spec.query.filter((p) => p.key !== '');
  if (pairs.length === 0) return spec.url;
  const qs = pairs
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return spec.url + (spec.url.includes('?') ? '&' : '?') + qs;
}

// bodyKindに応じて自動付与すべきContent-Type。明示ヘッダがあればそちらを優先する
export function impliedContentType(spec: RequestSpec): string | null {
  if (spec.headers.some((h) => h.key.toLowerCase() === 'content-type')) return null;
  if (spec.bodyKind === 'json') return 'application/json';
  if (spec.bodyKind === 'form') return 'application/x-www-form-urlencoded';
  return null;
}

export function hasBody(spec: RequestSpec): boolean {
  return spec.bodyKind !== 'none' && spec.body.trim() !== '';
}

// form形式のbody(key=value改行区切り)をURLエンコード済み文字列へ
export function encodeFormBody(body: string): string {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const eq = line.indexOf('=');
      const key = eq === -1 ? line : line.slice(0, eq);
      const value = eq === -1 ? '' : line.slice(eq + 1);
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
}

export function effectiveBody(spec: RequestSpec): string {
  if (!hasBody(spec)) return '';
  return spec.bodyKind === 'form' ? encodeFormBody(spec.body) : spec.body;
}
