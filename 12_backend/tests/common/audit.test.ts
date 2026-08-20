import {
  AUDIT_KEYS,
  SYSTEM_ACTOR,
  createAuditFields,
  stripAuditFields,
  updateAuditFields,
} from '../../src/common/audit';

const FIXED_NOW = new Date('2026-08-18T10:00:00.000Z');

describe('createAuditFields', () => {
  it('4項目すべてを設定し、作成時は更新日時と登録日時が同値になる', () => {
    const fields = createAuditFields('cognito-sub-1', FIXED_NOW);

    expect(fields).toEqual({
      createdAt: '2026-08-18T10:00:00.000Z',
      createdBy: 'cognito-sub-1',
      updatedAt: '2026-08-18T10:00:00.000Z',
      updatedBy: 'cognito-sub-1',
    });
  });

  it('システム起因の書き込みでは SYSTEM を設定できる', () => {
    const fields = createAuditFields(SYSTEM_ACTOR, FIXED_NOW);

    expect(fields.createdBy).toBe('SYSTEM');
    expect(fields.updatedBy).toBe('SYSTEM');
  });
});

describe('updateAuditFields', () => {
  it('createdAt / createdBy を含めない（更新時に上書きしないため）', () => {
    const fields = updateAuditFields('cognito-sub-2', FIXED_NOW);

    expect(fields).toEqual({
      updatedAt: '2026-08-18T10:00:00.000Z',
      updatedBy: 'cognito-sub-2',
    });
    expect(Object.keys(fields)).not.toContain('createdAt');
    expect(Object.keys(fields)).not.toContain('createdBy');
  });
});

describe('stripAuditFields', () => {
  const item = {
    userId: 'u-1',
    displayName: 'テストユーザー',
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBy: 'u-1',
    updatedAt: '2026-08-18T10:00:00.000Z',
    updatedBy: 'u-1',
  };

  it('共通項目をすべて除去する', () => {
    expect(stripAuditFields(item)).toEqual({
      userId: 'u-1',
      displayName: 'テストユーザー',
    });
  });

  it('keep に指定した項目は残す（GET /users/me の createdAt）', () => {
    expect(stripAuditFields(item, ['createdAt'])).toEqual({
      userId: 'u-1',
      displayName: 'テストユーザー',
      createdAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('AUDIT_KEYS は4項目である', () => {
    expect(AUDIT_KEYS).toEqual(['createdAt', 'createdBy', 'updatedAt', 'updatedBy']);
  });
});
