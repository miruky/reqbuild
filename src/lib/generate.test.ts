import { describe, expect, it } from 'vitest';
import { toCurl, toFetch, toGoHttp, toPythonRequests } from './generate';
import { emptySpec, encodeFormBody, fullUrl, type RequestSpec } from './request';

function spec(overrides: Partial<RequestSpec>): RequestSpec {
  return { ...emptySpec(), ...overrides };
}

describe('fullUrl / encodeFormBody', () => {
  it('クエリをエンコードして連結する', () => {
    const s = spec({ url: 'https://x.example/search', query: [{ key: 'q', value: '日本 語' }] });
    expect(fullUrl(s)).toBe('https://x.example/search?q=%E6%97%A5%E6%9C%AC%20%E8%AA%9E');
  });

  it('form本文を行ごとにURLエンコードする', () => {
    expect(encodeFormBody('user=a b\npass=c&d')).toBe('user=a%20b&pass=c%26d');
  });
});

describe('toCurl', () => {
  it('GETはフラグなしの最短形にする', () => {
    expect(toCurl(spec({ url: 'https://x.example/items' }))).toBe('curl https://x.example/items');
  });

  it('JSONボディにContent-Typeを自動付与しシングルクォートで括る', () => {
    const text = toCurl(
      spec({
        method: 'POST',
        url: 'https://x.example/items',
        bodyKind: 'json',
        body: '{"name":"abc"}',
      }),
    );
    expect(text).toContain("-H 'Content-Type: application/json'");
    expect(text).toContain(`-d '{"name":"abc"}'`);
  });
});

describe('toFetch', () => {
  it('GETはオプションなしで呼ぶ', () => {
    const code = toFetch(spec({ url: 'https://x.example/items' }));
    expect(code).toContain("await fetch('https://x.example/items');");
  });

  it('JSONボディはJSON.stringifyで包む', () => {
    const code = toFetch(
      spec({ method: 'POST', url: 'https://x.example/', bodyKind: 'json', body: '{"a":1}' }),
    );
    expect(code).toContain('body: JSON.stringify({"a":1})');
    expect(code).toContain("'Content-Type': 'application/json'");
  });
});

describe('toPythonRequests', () => {
  it('クエリをparamsに、JSONをjson=に写す', () => {
    const code = toPythonRequests(
      spec({
        method: 'POST',
        url: 'https://x.example/items',
        query: [{ key: 'dry', value: '1' }],
        bodyKind: 'json',
        body: '{"flag": true, "note": null}',
      }),
    );
    expect(code).toContain('requests.post(');
    expect(code).toContain('params={"dry": "1"}');
    expect(code).toContain('json={"flag": True, "note": None}');
  });
});

describe('toGoHttp', () => {
  it('ヘッダ設定とボディのReaderを生成する', () => {
    const code = toGoHttp(
      spec({
        method: 'POST',
        url: 'https://x.example/items',
        headers: [{ key: 'X-Trace', value: 'abc' }],
        bodyKind: 'json',
        body: '{"a":1}',
      }),
    );
    expect(code).toContain('strings.NewReader("{\\"a\\":1}")');
    expect(code).toContain('req.Header.Set("X-Trace", "abc")');
    expect(code).toContain('http.NewRequest("POST"');
  });
});
