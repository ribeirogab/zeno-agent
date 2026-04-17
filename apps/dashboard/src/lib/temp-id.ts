let counter = 0;

/**
 * Temp IDs for optimistic inserts. Prefix identifies the row kind so feature
 * components can detect provisional rows and dim them. Invalidate replaces
 * the temp row with the server row ~1.5s after the mutation settles.
 */
export function tempId(prefix: string): string {
  counter += 1;
  return `${prefix}_tmp_${Date.now()}_${counter}`;
}

export function isTempId(id: string): boolean {
  return id.includes('_tmp_');
}
