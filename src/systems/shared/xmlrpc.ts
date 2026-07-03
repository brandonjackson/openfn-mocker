/**
 * Minimal XML-RPC codec, just enough to mock an Odoo external API (OpenSPP is
 * Odoo-based and the openspp adaptor talks to it over XML-RPC via `odoo-await`).
 * Supports the value types Odoo uses: string, int/i4, double, boolean, nil,
 * dateTime.iso8601, array and struct. Not a general XML parser — it assumes the
 * well-formed documents an XML-RPC client emits (no attributes, no CDATA).
 */

interface XmlNode {
  tag: string;
  children: XmlNode[];
  text: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

function encodeEntities(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Parse an XML string into a lightweight element tree (text nodes inlined). */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', children: [], text: '' };
  const stack: XmlNode[] = [root];
  const tokenRe = /<[^>]+>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(xml))) {
    const token = m[0];
    if (token.startsWith('<')) {
      const inner = token.slice(1, -1).trim();
      if (inner.startsWith('?') || inner.startsWith('!')) continue; // declaration / comment
      if (inner.startsWith('/')) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const selfClosing = inner.endsWith('/');
      const name = inner.replace(/\/$/, '').trim().split(/\s/)[0];
      const node: XmlNode = { tag: name, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    } else {
      const text = decodeEntities(token);
      if (text.trim().length) stack[stack.length - 1].text += text;
    }
  }
  return root;
}

function firstChild(node: XmlNode, tag?: string): XmlNode | undefined {
  return node.children.find((c) => (tag ? c.tag === tag : true));
}

/** Convert a <value> node (or its typed child) into a JS value. */
function valueToJs(valueNode: XmlNode): any {
  const child = valueNode.children[0];
  if (!child) return valueNode.text; // untyped <value>text</value> is a string
  switch (child.tag) {
    case 'string':
      return child.text;
    case 'int':
    case 'i4':
      return parseInt(child.text, 10);
    case 'double':
      return parseFloat(child.text);
    case 'boolean':
      return child.text.trim() === '1';
    case 'nil':
      return null;
    case 'dateTime.iso8601':
      return child.text;
    case 'array': {
      const data = firstChild(child, 'data');
      if (!data) return [];
      return data.children.filter((c) => c.tag === 'value').map(valueToJs);
    }
    case 'struct': {
      const obj: Record<string, any> = {};
      for (const member of child.children.filter((c) => c.tag === 'member')) {
        const nameNode = firstChild(member, 'name');
        const valNode = firstChild(member, 'value');
        if (nameNode) obj[nameNode.text] = valNode ? valueToJs(valNode) : null;
      }
      return obj;
    }
    default:
      return child.text;
  }
}

export interface XmlRpcCall {
  methodName: string;
  params: any[];
}

/** Parse an XML-RPC <methodCall> document. */
export function parseMethodCall(xml: string): XmlRpcCall {
  const root = parseXml(xml);
  const call = firstChild(root, 'methodCall');
  if (!call) return { methodName: '', params: [] };
  const methodName = firstChild(call, 'methodName')?.text ?? '';
  const paramsNode = firstChild(call, 'params');
  const params = paramsNode
    ? paramsNode.children
        .filter((c) => c.tag === 'param')
        .map((p) => {
          const v = firstChild(p, 'value');
          return v ? valueToJs(v) : null;
        })
    : [];
  return { methodName, params };
}

/** Serialize a JS value to an XML-RPC <value> element. */
export function serializeValue(v: any): string {
  if (v === null || v === undefined) return '<value><nil/></value>';
  if (typeof v === 'boolean') return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? `<value><int>${v}</int></value>`
      : `<value><double>${v}</double></value>`;
  }
  if (typeof v === 'string') return `<value><string>${encodeEntities(v)}</string></value>`;
  if (Array.isArray(v)) {
    return `<value><array><data>${v.map(serializeValue).join('')}</data></array></value>`;
  }
  if (typeof v === 'object') {
    const members = Object.entries(v)
      .map(([k, val]) => `<member><name>${encodeEntities(k)}</name>${serializeValue(val)}</member>`)
      .join('');
    return `<value><struct>${members}</struct></value>`;
  }
  return `<value><string>${encodeEntities(String(v))}</string></value>`;
}

/** Wrap a value in a full XML-RPC <methodResponse> document. */
export function serializeResponse(value: any): string {
  return (
    '<?xml version="1.0"?>\n<methodResponse><params><param>' +
    serializeValue(value) +
    '</param></params></methodResponse>'
  );
}

/** Serialize an XML-RPC fault response. */
export function serializeFault(code: number, message: string): string {
  return (
    '<?xml version="1.0"?>\n<methodResponse><fault>' +
    serializeValue({ faultCode: code, faultString: message }) +
    '</fault></methodResponse>'
  );
}
