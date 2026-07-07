import type { UsageExample } from '../types.js';

/**
 * Usage examples for the mailchimp sandbox "Usage" tab: one entry per adaptor
 * function. Every function (except `listAudiences`) takes a single options
 * object — `listId` and the rest of the arguments are properties on it, not
 * positional — so the snippets pass one object. Each `apiRef` links to a
 * matching example id on the guide.
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
    signature: 'listAudienceInfo({ listId }, callback?)',
    description: 'Get information about a single audience.',
    code: "listAudienceInfo({ listId: 'list_seed01' });",
    apiRef: 'getList',
  },
  {
    fn: 'listMembers',
    signature: 'listMembers({ listId, ...query }, callback?)',
    description: 'List the members of an audience.',
    code: "listMembers({ listId: 'list_seed01' });",
    apiRef: 'listMembers',
  },
  {
    fn: 'addMember',
    signature: 'addMember({ listId, member }, callback?)',
    description: 'Add a new member to an audience.',
    code: "addMember({\n  listId: 'list_seed01',\n  member: [{ email_address: 'grace@example.com', status: 'subscribed' }]\n});",
    apiRef: 'addMember',
  },
  {
    fn: 'updateMember',
    signature: 'updateMember({ listId, subscriberHash, member }, callback?)',
    description: 'Update an existing audience member.',
    code: "updateMember({\n  listId: 'list_seed01',\n  subscriberHash: 'hashseed01',\n  member: { status: 'unsubscribed' }\n});",
    apiRef: 'updateMember',
  },
  {
    fn: 'upsertMembers',
    signature: 'upsertMembers({ listId, users }, callback?)',
    description: 'Add or update audience members in bulk.',
    code: "upsertMembers({\n  listId: 'list_seed01',\n  users: [{ email: 'ada@example.com', status: 'subscribed' }]\n});",
    apiRef: 'batchMembers',
  },
  {
    fn: 'tagMembers',
    signature: 'tagMembers({ listId, tagId, members }, callback?)',
    description: 'Add members to a segment (tag) in bulk.',
    code: "tagMembers({\n  listId: 'list_seed01',\n  tagId: 'seg01',\n  members: ['ada@example.com']\n});",
    apiRef: 'segmentMembers',
  },
  {
    fn: 'startBatch',
    signature: 'startBatch({ operations }, callback?)',
    description: 'Start a batch of operations to run asynchronously.',
    code: "startBatch({\n  operations: [{ method: 'POST', path: '/lists/list_seed01/members', body: '{}' }]\n});",
    apiRef: 'batch',
  },
  {
    fn: 'deleteMember',
    signature: 'deleteMember({ listId, subscriberHash }, callback?)',
    description: 'Permanently delete an audience member.',
    code: "deleteMember({ listId: 'list_seed01', subscriberHash: 'hashseed01' });",
    apiRef: 'deleteMember',
  },
];
