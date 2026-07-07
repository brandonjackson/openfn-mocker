/** Slice `items` by offset/limit and report pagination metadata. */
export function paginate<T>(
  items: T[],
  opts: { offset?: number; limit?: number }
): { items: T[]; total: number; offset: number; limit: number; hasMore: boolean } {
  const total = items.length;
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const limit = opts.limit === undefined ? total : Math.max(0, Math.floor(opts.limit));
  const page = items.slice(offset, offset + limit);
  return { items: page, total, offset, limit, hasMore: offset + page.length < total };
}
