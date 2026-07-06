import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ibipimo sandbox "Usage" tab: the two domain-specific
 * operations (postViralLoadRequest, getViralLoadResults) plus a generic get.
 */
export const usage: UsageExample[] = [
  {
    fn: 'postViralLoadRequest',
    signature: 'postViralLoadRequest(data, options?)',
    description: 'Queue a viral-load request for a sample.',
    code: "postViralLoadRequest({\n  sampleId: 'SMP-1001',\n  patientId: 'PT-001',\n  siteCode: 'ST-01'\n});",
    apiRef: 'postVl',
  },
  {
    fn: 'getViralLoadResults',
    signature: 'getViralLoadResults(data, options?)',
    description: 'Ask for available viral-load results for a site.',
    code: "getViralLoadResults({ siteCode: 'ST-01' });",
    apiRef: 'getVl',
  },
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'Make a generic GET request to an Ibipimo endpoint.',
    code: "get('/api/v1/sites');",
    apiRef: 'sites',
  },
];
