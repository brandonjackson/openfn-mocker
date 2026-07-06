import type { UsageExample } from '../types.js';

/**
 * Usage examples for the memento sandbox "Usage" tab: one entry per adaptor
 * function. Each `apiRef` links to a matching example id on the guide.
 */
export const usage: UsageExample[] = [
  {
    fn: 'listLibraries',
    signature: 'listLibraries(callback?)',
    description: 'List all libraries in the account.',
    code: 'listLibraries();',
    apiRef: 'listLibs',
  },
  {
    fn: 'getFields',
    signature: 'getFields(libraryId, callback?)',
    description: 'Get a library including its field schema.',
    code: "getFields('lib_seed01');",
    apiRef: 'getLib',
  },
  {
    fn: 'listEntries',
    signature: 'listEntries(libraryId, params?, callback?)',
    description: 'List the entries of a library.',
    code: "listEntries('lib_seed01');",
    apiRef: 'listEntries',
  },
  {
    fn: 'getEntry',
    signature: 'getEntry(libraryId, entryId, callback?)',
    description: 'Fetch a single entry by id.',
    code: "getEntry('lib_seed01', 'entry_seed01');",
    apiRef: 'getEntry',
  },
  {
    fn: 'createEntry',
    signature: 'createEntry(libraryId, entry, callback?)',
    description: 'Create a new entry in a library.',
    code: "createEntry('lib_seed01', {\n  fields: [\n    { id: 1, value: 'Grace' },\n    { id: 2, value: '555-2000' }\n  ]\n});",
    apiRef: 'createEntry',
  },
  {
    fn: 'updateEntry',
    signature: 'updateEntry(libraryId, entryId, entry, callback?)',
    description: 'Update an existing entry.',
    code: "updateEntry('lib_seed01', 'entry_seed01', {\n  fields: [{ id: 1, value: 'Ada Lovelace' }]\n});",
    apiRef: 'updateEntry',
  },
];
