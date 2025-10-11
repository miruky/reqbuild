import { describe, expect, it } from 'vitest';
import { CurlParseError, parseCurl, tokenize } from './curl';
import { toCurl } from './generate';

describe('tokenize', () => {
  it('引用符と空白を尊重する', () => {
    expect(tokenize(`curl -H 'X-A: b c' "https://x.example/?q=1 2"`)).toEqual([
      'curl',
      '-H',
      'X-A: b c',
      'https://x.example/?q=1 2',
    ]);
  });

  it('シングルクォート内のエスケープ連結を扱う', () => {
    expect(tokenize(`echo 'it'\\''s'`)).toEqual(['echo', "it's"]);
  });

  it('行継続バックスラッシュを畳む', () => {
    expect(tokenize('curl \\\n  -X POST url')).toEqual(['curl', '-X', 'POST', 'url']);
  });
});

describe('parseCurl', () => {
  it('メソッド・ヘッダ・ボディ・URLを取り込む', () => {
    const spec = parseCurl(
      `curl -X PUT 'https://api.example.com/items/1?lang=ja' -H 'Authorization: Bearer t0ken' -H 'Content-Type: application/json' -d '{"name":"新しい名前"}'`,
    );
    expect(spec.method).toBe('PUT');
    expect(spec.url).toBe('https://api.example.com/items/1');
    expect(spec.query).toEqual([{ key: 'lang', value: 'ja' }]);
    expect(spec.headers).toContainEqual({ key: 'Authorization', value: 'Bearer t0ken' });
    expect(spec.bodyKind).toBe('json');
    expect(spec.body).toBe('{"name":"新しい名前"}');
  });

  it('-dがあればメソッド未指定をPOSTにする', () => {
    const spec = parseCurl(`curl https://x.example/login -d 'user=a&pass=b'`);
    expect(spec.method).toBe('POST');
    expect(spec.bodyKind).toBe('raw');
  });

  it('-uをBasic認証ヘッダへ写す', () => {
    const spec = parseCurl(`curl -u admin:secret https://x.example/`);
    expect(spec.headers).toContainEqual({
      key: 'Authorization',
      value: `Basic ${btoa('admin:secret')}`,
    });
  });

  it('-Gはデータをクエリへ回す', () => {
    const spec = parseCurl(`curl -G https://x.example/search -d 'q=hello'`);
    expect(spec.method).toBe('GET');
    expect(spec.query).toContainEqual({ key: 'q', value: 'hello' });
  });

  it('未対応オプションとcurl以外を拒否する', () => {
    expect(() => parseCurl('wget https://x.example/')).toThrow(CurlParseError);
    expect(() => parseCurl('curl --output file https://x.example/')).toThrow('未対応');
  });
});

describe('toCurlとの往復', () => {
  it('生成したcurlを取り込み直しても同じ意味になる', () => {
    const original = parseCurl(
      `curl -X POST 'https://api.example.com/v1/users?dry=1' -H 'X-Trace: a b' -d '{"role":"admin"}'`,
    );
    const regenerated = parseCurl(toCurl(original));
    expect(regenerated.method).toBe(original.method);
    expect(regenerated.url).toBe(original.url);
    expect(regenerated.query).toEqual(original.query);
    expect(regenerated.body).toBe(original.body);
    expect(regenerated.headers).toEqual(expect.arrayContaining(original.headers));
  });
});
