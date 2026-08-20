import { ValidationError } from '../../src/common/errors';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  decodeNextToken,
  encodeNextToken,
  resolveLimit,
} from '../../src/common/pagination';

describe('nextToken の変換', () => {
  it('エンコードとデコードで元のキーに戻る', () => {
    const key = { questionId: 'q-uuid-1' };
    const token = encodeNextToken(key);

    expect(token).not.toBeNull();
    expect(decodeNextToken(token)).toEqual(key);
  });

  it('LastEvaluatedKey が無い場合（最終ページ）は null', () => {
    expect(encodeNextToken(undefined)).toBeNull();
  });

  it('nextToken 未指定時は undefined（初回ページ）', () => {
    expect(decodeNextToken(undefined)).toBeUndefined();
    expect(decodeNextToken(null)).toBeUndefined();
    expect(decodeNextToken('')).toBeUndefined();
  });

  it('不正な形式は VALIDATION_ERROR', () => {
    expect(() => decodeNextToken('!!!not-base64-json!!!')).toThrow(ValidationError);
  });

  it('JSONだが配列の場合も VALIDATION_ERROR', () => {
    const token = Buffer.from('[1,2,3]', 'utf8').toString('base64');
    expect(() => decodeNextToken(token)).toThrow(ValidationError);
  });
});

describe('resolveLimit', () => {
  it('未指定時は既定値20', () => {
    expect(resolveLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(resolveLimit('')).toBe(DEFAULT_LIMIT);
  });

  it('範囲内の値はそのまま採用する', () => {
    expect(resolveLimit('1')).toBe(1);
    expect(resolveLimit('50')).toBe(50);
    expect(resolveLimit(String(MAX_LIMIT))).toBe(MAX_LIMIT);
  });

  it.each(['0', '-1', '101', 'abc', '10.5'])('範囲外・非整数 %s は VALIDATION_ERROR', (value) => {
    expect(() => resolveLimit(value)).toThrow(ValidationError);
  });
});
