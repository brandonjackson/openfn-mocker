import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the mailchimp system. Paths match the Marketing API 3.0
 * resources the adaptor calls; the example ids are the cross-link targets for
 * the usage examples' `apiRef`.
 */
export const guide: SystemGuide = {
  title: 'Mailchimp Marketing',
  docs: 'https://docs.openfn.org/adaptors/packages/mailchimp-docs',
  blurb:
    'Mailchimp Marketing API 3.0. The adaptor authenticates with HTTP Basic (any username + the API key as the password) against https://<server>.api.mailchimp.com/3.0 and manages audiences (lists), members and batch operations. Member ids are the MD5 hash of the lowercased email (the subscriber_hash); tagging and deletion return 204 No Content.',
  auth: 'Basic (any username + API key)',
  examples: [
    { id: 'listLists', method: 'GET', path: '/3.0/lists', label: 'List audiences (listAudiences)' },
    { id: 'getList', method: 'GET', path: '/3.0/lists/list_seed01', label: 'Audience info' },
    { id: 'listMembers', method: 'GET', path: '/3.0/lists/list_seed01/members', label: 'List members of an audience' },
    {
      id: 'addMember',
      method: 'POST',
      path: '/3.0/lists/list_seed01/members',
      label: 'Add a member',
      body: JSON.stringify({ email_address: 'grace@example.com', status: 'subscribed' }, null, 2),
    },
    {
      id: 'updateMember',
      method: 'PATCH',
      path: '/3.0/lists/list_seed01/members/hashseed01',
      label: 'Update a member',
      body: JSON.stringify({ status: 'unsubscribed' }, null, 2),
    },
    {
      id: 'tag',
      method: 'POST',
      path: '/3.0/lists/list_seed01/members/hashseed01/tags',
      label: 'Add or remove member tags (204)',
      body: JSON.stringify({ tags: [{ name: 'VIP', status: 'active' }] }, null, 2),
    },
    {
      id: 'batch',
      method: 'POST',
      path: '/3.0/batches',
      label: 'Start a batch operation',
      body: JSON.stringify(
        { operations: [{ method: 'POST', path: '/lists/list_seed01/members', body: '{}' }] },
        null,
        2
      ),
    },
    {
      id: 'deleteMember',
      method: 'DELETE',
      path: '/3.0/lists/list_seed01/members/hashseed01',
      label: 'Archive/delete a member (204)',
    },
  ],
};
