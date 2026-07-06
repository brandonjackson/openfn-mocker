/** A single API operation extracted from an OpenAPI spec. */
export interface ParsedOperation {
  method: string; // upper-case HTTP verb, e.g. 'GET'
  path: string; // OpenAPI-style path, e.g. '/v3/{domain}/messages'
  operationId?: string;
  requestSchema?: any; // application/json request body schema (may contain $ref)
  responseSchema?: any; // chosen 2xx application/json response schema
  successStatus: number; // numeric success status (e.g. 200, 201)
}

export interface ParsedSpec {
  raw: any;
  schemas: Record<string, any>;
  operations: ParsedOperation[];
  /** Follow a node's $ref (recursively) to its target; returns the node as-is if not a $ref. */
  deref(node: any): any;
  /** Resolve a local JSON pointer like '#/components/schemas/Foo'. */
  resolveRef(ref: string): any;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

/**
 * Parse a raw OpenAPI document into a ParsedSpec: extract components.schemas,
 * walk paths -> operations (choosing the lowest 2xx response + json request
 * body schema), and expose local $ref resolution.
 */
export function parseSpec(raw: any): ParsedSpec {
  const schemas: Record<string, any> = (raw?.components?.schemas ?? {}) as Record<string, any>;

  const resolveRef = (ref: string): any => {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
    const parts = ref
      .slice(2)
      .split('/')
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let node: any = raw;
    for (const part of parts) {
      if (node == null) return undefined;
      node = node[part];
    }
    return node;
  };

  const deref = (node: any): any => {
    let cur = node;
    let guard = 0;
    while (cur && typeof cur === 'object' && typeof cur.$ref === 'string' && guard++ < 50) {
      cur = resolveRef(cur.$ref);
    }
    return cur;
  };

  const operations: ParsedOperation[] = [];
  const paths = (raw?.paths ?? {}) as Record<string, any>;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, any>)[method];
      if (!op || typeof op !== 'object') continue;

      // Request body (application/json).
      let requestSchema: any;
      const rb = deref(op.requestBody);
      const reqJson = rb?.content?.['application/json'];
      if (reqJson?.schema) requestSchema = reqJson.schema;

      // Success response: lowest 2xx, else 'default'.
      let successStatus = method === 'post' ? 201 : 200;
      let responseSchema: any;
      const responses = (op.responses ?? {}) as Record<string, any>;
      const twoxx = Object.keys(responses)
        .filter((k) => /^2\d\d$/.test(k))
        .sort();
      const chosen = twoxx[0] ?? (responses.default ? 'default' : undefined);
      if (chosen && /^2\d\d$/.test(chosen)) successStatus = parseInt(chosen, 10);
      if (chosen) {
        const resp = deref(responses[chosen]);
        const respJson = resp?.content?.['application/json'];
        if (respJson?.schema) responseSchema = respJson.schema;
      }

      operations.push({
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
        requestSchema,
        responseSchema,
        successStatus,
      });
    }
  }

  return { raw, schemas, operations, deref, resolveRef };
}
