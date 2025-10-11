import { describe, expect, it } from 'vitest';
import { decodeSpec, encodeSpec } from './share';
import { emptySpec, type RequestSpec } from './request';

function spec(overrides: Partial<RequestSpec>): RequestSpec {
  return { ...emptySpec(), ...overrides };
}

describe('encodeSpec / decodeSpec', () => {
  it('日本語を含むリクエストを往復しても等しい', () => {
    const original = spec({
      method: 'POST',
      url: 'https://api.example.com/v1/users',
      query: [{ key: 'lang', value: 'ja' }],
      headers: [{ key: 'Authorization', value: 'Bearer t0ken' }],
      bodyKind: 'json',
      body: '{"name":"山田 太郎"}',
    });
    const restored = decodeSpec(encodeSpec(original));
    expect(restored).toEqual(original);
  });

  it('URLフラグメントに安全な文字だけを使う', () => {
    const encoded = encodeSpec(spec({ url: 'https://x.example/?q=1' }));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('空のクエリ・ヘッダ行は落とす', () => {
    const restored = decodeSpec(
      encodeSpec(spec({ url: 'https://x.example/', query: [{ key: '', value: '' }] })),
    );
    expect(restored?.query).toEqual([]);
  });

  it('壊れた入力ではnullを返す', () => {
    expect(decodeSpec('')).toBeNull();
    expect(decodeSpec('@@@not-base64@@@')).toBeNull();
    expect(decodeSpec(btoa('{"no":"url"}'))).toBeNull();
  });
});
