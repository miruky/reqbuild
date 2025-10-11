import { describe, expect, it } from 'vitest';
import { formatJson, minifyJson } from './format';

describe('formatJson', () => {
  it('2スペースインデントへ整形する', () => {
    expect(formatJson('{"a":1,"b":[2,3]}')).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it('不正なJSONや空文字ではnullを返す', () => {
    expect(formatJson('{a:1}')).toBeNull();
    expect(formatJson('   ')).toBeNull();
  });
});

describe('minifyJson', () => {
  it('余白を除いた最小形にする', () => {
    expect(minifyJson('{\n  "a": 1\n}')).toBe('{"a":1}');
  });

  it('不正なJSONではnullを返す', () => {
    expect(minifyJson('nope')).toBeNull();
  });
});
