import type { UsageExample } from '../types.js';

/**
 * Usage examples for the mailchimp sandbox "Usage" tab: one entry per adaptor
 * function. Each `apiRef` links to a matching example id on the guide.
 */
export const usage: UsageExample[] = [
  {
    fn: 'listAudiences',
    signature: 'listAudiences(query?, callback?)',
    description: 'List all audiences (lists) in the account.',
    code: 'listAudiences();',
    apiRef: 'listLists',
  },
  {
    fn: 'listAudienceInfo',
    signature: 'listAudienceInfo(listId, query?, callback?)',
    description: 'Get information about a single audience.',
    code: "listAudienceInfo('list_seed01');",
    apiRef: 'getList',
  },
  {
    fn: 'listMembers',
    signature: 'listMembers(listId, query?, callback?)',
    description: 'List the members of an audience.',
    code: "listMembers('list_seed01');",
    apiRef: 'listMembers',
  },
  {
    fn: 'addMember',
    signature: 'addMember(listId, member, callback?)',
    description: 'Add a new member to an audience.',
    code: "addMember('list_seed01', {\n  email_address: 'grace@example.com',\n  status: 'subscribed'\n});",
    apiRef: 'addMember',
  },
  {
    fn: 'updateMember',
    signature: 'updateMember(listId, subscriberHash, member, callback?)',
    description: 'Update an existing audience member.',
    code: "updateMember('list_seed01', 'hashseed01', {\n  status: 'unsubscribed'\n});",
    apiRef: 'updateMember',
  },
  {
    fn: 'upsertMembers',
    signature: 'upsertMembers(listId, members, callback?)',
    description: 'Add or update audience members in bulk.',
    code: "upsertMembers('list_seed01', [\n  { email_address: 'ada@example.com', status: 'subscribed' }\n]);",
    apiRef: 'addMember',
  },
  {
    fn: 'tagMembers',
    signature: 'tagMembers(listId, member, callback?)',
    description: 'Add or remove tags on an audience member.',
    code: "tagMembers('list_seed01', {\n  email_address: 'ada@example.com',\n  tags: [{ name: 'VIP', status: 'active' }]\n});",
    apiRef: 'tag',
  },
  {
    fn: 'startBatch',
    signature: 'startBatch(operations, callback?)',
    description: 'Start a batch of operations to run asynchronously.',
    code: "startBatch([\n  { method: 'POST', path: '/lists/list_seed01/members', body: '{}' }\n]);",
    apiRef: 'batch',
  },
  {
    fn: 'deleteMember',
    signature: 'deleteMember(listId, subscriberHash, callback?)',
    description: 'Archive (permanently delete) an audience member.',
    code: "deleteMember('list_seed01', 'hashseed01');",
    apiRef: 'deleteMember',
  },
];
