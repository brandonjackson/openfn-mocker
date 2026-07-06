import type { UsageExample } from '../types.js';

/**
 * Usage examples for the collections sandbox "Usage" tab. Functions live under
 * the `collections` namespace; the `fn` carries the namespace prefix (the audit
 * strips the parentheses, and the prefix matches the namespace member name).
 */
export const usage: UsageExample[] = [
  {
    fn: 'collections.get',
    signature: 'collections.get(name, key, callback?)',
    description: 'Fetch a single value by key from a collection.',
    code: "collections.get('patients', 'patient-001');",
    apiRef: 'getKey',
  },
  {
    fn: 'collections.each',
    signature: 'collections.each(name, keyPattern, callback)',
    description: 'Iterate over the values in a collection matching a key pattern.',
    code: "collections.each('patients', '*', (state, value, key) => {\n  console.log(key);\n});",
    apiRef: 'listKeys',
  },
  {
    fn: 'collections.set',
    signature: 'collections.set(name, values, callback?)',
    description: 'Upsert one or more key/value pairs into a collection.',
    code: "collections.set('patients', { 'patient-003': { name: 'Grace' } });",
    apiRef: 'setKey',
  },
  {
    fn: 'collections.remove',
    signature: 'collections.remove(name, key, callback?)',
    description: 'Remove a value by key from a collection.',
    code: "collections.remove('patients', 'patient-001');",
    apiRef: 'removeKey',
  },
];
