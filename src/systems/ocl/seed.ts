import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenConceptLab (OCL) seed — an open terminology-management platform. OCL's
 * REST API nests concepts and mappings under an owner (an org or user) and a
 * repository (a source or collection). A demo org with one source (two
 * concepts) and one collection (one mapping) is seeded so the ocl adaptor's
 * get() and getMappings() return data on first boot.
 */

const OWNER = 'DemoOrg';
const SOURCE = 'DemoSource';
const COLLECTION = 'DemoCollection';

export function seed(store: DataStore, config: SystemConfig): void {
  const origin = `http://localhost:${config.port}`;

  store.create('orgs', OWNER, {
    type: 'Organization',
    uuid: 'org-uuid-0001',
    id: OWNER,
    name: 'Demo Organization',
    url: `${origin}/orgs/${OWNER}/`,
    public_access: 'View',
  });

  store.create('sources', SOURCE, {
    type: 'Source',
    uuid: 'source-uuid-0001',
    id: SOURCE,
    short_code: SOURCE,
    name: 'Demo Source',
    source_type: 'Dictionary',
    owner: OWNER,
    owner_type: 'Organization',
    owner_url: `${origin}/orgs/${OWNER}/`,
    url: `${origin}/orgs/${OWNER}/sources/${SOURCE}/`,
    active_concepts: 2,
    default_locale: 'en',
  });

  const concept = (id: string, cls: string, datatype: string, name: string) => ({
    type: 'Concept',
    uuid: `concept-uuid-${id}`,
    id,
    external_id: null,
    concept_class: cls,
    datatype,
    url: `${origin}/orgs/${OWNER}/sources/${SOURCE}/concepts/${id}/`,
    version_url: `${origin}/orgs/${OWNER}/sources/${SOURCE}/concepts/${id}/`,
    retired: false,
    source: SOURCE,
    owner: OWNER,
    owner_type: 'Organization',
    owner_url: `${origin}/orgs/${OWNER}/`,
    display_name: name,
    display_locale: 'en',
    names: [{ name, locale: 'en', locale_preferred: true, name_type: 'Fully Specified' }],
    version: 'HEAD',
  });

  store.create('concepts', 'MALARIA', concept('MALARIA', 'Diagnosis', 'N/A', 'Malaria'));
  store.create('concepts', 'BODY_WEIGHT', concept('BODY_WEIGHT', 'Finding', 'Numeric', 'Body weight'));

  store.create('collections', COLLECTION, {
    type: 'Collection',
    uuid: 'collection-uuid-0001',
    id: COLLECTION,
    short_code: COLLECTION,
    name: 'Demo Collection',
    collection_type: 'Subset',
    owner: OWNER,
    owner_type: 'Organization',
    url: `${origin}/orgs/${OWNER}/collections/${COLLECTION}/`,
  });

  store.create('mappings', 'MAP-1', {
    type: 'Mapping',
    uuid: 'mapping-uuid-0001',
    id: 'MAP-1',
    map_type: 'SAME-AS',
    from_concept_url: `${origin}/orgs/${OWNER}/sources/${SOURCE}/concepts/MALARIA/`,
    to_concept_code: 'B54',
    to_concept_name: 'Malaria, unspecified',
    to_source_url: `${origin}/orgs/WHO/sources/ICD-10-WHO/`,
    source: COLLECTION,
    owner: OWNER,
    owner_type: 'Organization',
    url: `${origin}/orgs/${OWNER}/collections/${COLLECTION}/mappings/MAP-1/`,
    retired: false,
  });
}
