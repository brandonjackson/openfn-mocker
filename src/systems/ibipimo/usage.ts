import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ibipimo sandbox "Usage" tab: the two domain-specific
 * operations (postViralLoadRequest, getViralLoadResults) plus a generic get.
 */
export const usage: UsageExample[] = [
  {
    fn: 'postViralLoadRequest',
    signature: 'postViralLoadRequest(data, options?)',
    description: 'Post viral-load test requests (a siteid and its samples).',
    code: "postViralLoadRequest({\n  siteid: '77889900',\n  samples: [\n    {\n      sidainfo_uid: '147461',\n      p_code: '000011',\n      p_name: 'Example',\n      p_prename: 'Patient',\n      p_sex: 'F',\n      p_dob: '1985-03-12',\n      reason_vl: 'suspicion_echec',\n      on_arv: '1',\n      sample_type: 'DBS',\n      date_blood_taken: '2024-04-15 11:49:00',\n      dateprelevement: '2024-04-15',\n      site: '77889900',\n      sidainfo_siteid: '77889900'\n    }\n  ]\n});",
    apiRef: 'postVl',
  },
  {
    fn: 'getViralLoadResults',
    signature: 'getViralLoadResults(data, options?)',
    description: 'Ask for viral-load results and statuses by sample UID.',
    code: "getViralLoadResults({\n  siteid: '77889900',\n  sample_uids: ['IBI-2024-000001']\n});",
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
