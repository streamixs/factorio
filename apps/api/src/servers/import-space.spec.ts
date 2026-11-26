import { describe, expect, it } from 'vitest';

import { IMPORT_SPACE_MARGIN_BYTES, importSpaceIssue } from './import-space.js';

describe('importSpaceIssue', () => {
  it('allows an import when the free space is unknown', () => {
    expect(importSpaceIssue(1024, undefined)).toBeUndefined();
  });

  it('allows an unknown import size', () => {
    expect(importSpaceIssue(0, 1024)).toBeUndefined();
  });

  it('allows an import that leaves the safety margin', () => {
    const free = 1024 * 1024 * 1024;
    const declared = free - IMPORT_SPACE_MARGIN_BYTES;
    expect(importSpaceIssue(declared, free)).toBeUndefined();
  });

  it('rejects an import that would eat the safety margin', () => {
    const free = 1024 * 1024 * 1024;
    const declared = free - IMPORT_SPACE_MARGIN_BYTES + 1;
    expect(importSpaceIssue(declared, free)).toBe(
      'Not enough space on the import volume',
    );
  });

  it('rejects any import when the volume is smaller than the margin', () => {
    expect(importSpaceIssue(1, 1024)).toBe(
      'Not enough space on the import volume',
    );
  });
});
