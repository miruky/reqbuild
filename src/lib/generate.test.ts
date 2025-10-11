import { describe, expect, it } from 'vitest';
import {
  toCurl,
  toFetch,
  toGoHttp,
  toHttpie,
  toPhpCurl,
  toPythonRequests,
  toRawHttp,
  toRubyNetHttp,
} from './generate';
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

describe('toRubyNetHttp', () => {
  it('メソッドをクラス名に写しボディとヘッダを設定する', () => {
    const code = toRubyNetHttp(
      spec({
        method: 'POST',
        url: 'https://x.example/items',
        headers: [{ key: 'X-Trace', value: 'abc' }],
        bodyKind: 'json',
        body: '{"a":1}',
      }),
    );
    expect(code).toContain("require 'net/http'");
    expect(code).toContain('request = Net::HTTP::Post.new(uri)');
    expect(code).toContain("request['Content-Type'] = 'application/json'");
    expect(code).toContain("request['X-Trace'] = 'abc'");
    expect(code).toContain('request.body = \'{"a":1}\'');
  });
});

describe('toPhpCurl', () => {
  it('CUSTOMREQUESTとヘッダ配列・POSTFIELDSを組む', () => {
    const code = toPhpCurl(
      spec({
        method: 'PUT',
        url: 'https://x.example/items/1',
        bodyKind: 'json',
        body: '{"a":1}',
      }),
    );
    expect(code).toContain("curl_init('https://x.example/items/1')");
    expect(code).toContain("curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT')");
    expect(code).toContain("'Content-Type: application/json'");
    expect(code).toContain('CURLOPT_POSTFIELDS');
  });
});

describe('toHttpie', () => {
  it('クエリは==・ヘッダは:・平坦なJSONはフィールド構文にする', () => {
    const code = toHttpie(
      spec({
        method: 'POST',
        url: 'https://x.example/users',
        query: [{ key: 'dry', value: '1' }],
        headers: [{ key: 'Authorization', value: 'Bearer t' }],
        bodyKind: 'json',
        body: '{"name":"yamada","admin":true}',
      }),
    );
    expect(code).toContain('http POST https://x.example/users');
    expect(code).toContain('dry==1');
    expect(code).toContain('Authorization:Bearer');
    expect(code).toContain('name=yamada');
    expect(code).toContain('admin:=true');
  });

  it('ネストしたJSONは--rawへ退避しContent-Typeを補う', () => {
    const code = toHttpie(
      spec({ method: 'POST', url: 'https://x.example/', bodyKind: 'json', body: '[1,2,3]' }),
    );
    expect(code).toContain("--raw='[1,2,3]'");
    expect(code).toContain('Content-Type:application/json');
  });
});

describe('toRawHttp', () => {
  it('リクエストライン・Host・Content-Lengthを組み立てる', () => {
    const code = toRawHttp(
      spec({
        method: 'POST',
        url: 'https://api.example.com/v1/users',
        query: [{ key: 'dry', value: '1' }],
        bodyKind: 'json',
        body: '{"a":1}',
      }),
    );
    expect(code).toContain('POST /v1/users?dry=1 HTTP/1.1\r\n');
    expect(code).toContain('Host: api.example.com');
    expect(code).toContain('Content-Type: application/json');
    expect(code).toContain('Content-Length: 7');
    expect(code.endsWith('\r\n\r\n{"a":1}')).toBe(true);
  });

  it('不正なURLでは案内文を返す', () => {
    expect(toRawHttp(spec({ url: 'not a url' }))).toContain('有効なURL');
  });
});
