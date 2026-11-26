export const IMPORT_SPACE_MARGIN_BYTES = 256 * 1024 * 1024;

/**
 * Returns a user-facing issue when a declared import would leave less than the
 * safety margin on the import volume. An unknown size or free space is left to
 * the stream limiter and the filesystem ENOSPC error.
 */
export function importSpaceIssue(
  declaredBytes: number,
  freeBytes: number | undefined,
): string | undefined {
  if (freeBytes === undefined || declaredBytes <= 0) {
    return undefined;
  }

  if (declaredBytes > freeBytes - IMPORT_SPACE_MARGIN_BYTES) {
    return 'Not enough space on the import volume';
  }

  return undefined;
}
