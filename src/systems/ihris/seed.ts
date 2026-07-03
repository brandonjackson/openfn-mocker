import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * iHRIS seed (health-workforce Digital Public Good). iHRIS exposes a FHIR R4 API
 * built on the health-workforce resources: Practitioners, PractitionerRoles,
 * Organizations and Locations. A small, cross-referenced Sierra Leone workforce
 * is seeded (the ihris adaptor is FHIR-based, re-exporting language-fhir-4).
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('Organization', 'org-moh', {
    resourceType: 'Organization',
    id: 'org-moh',
    name: 'Ministry of Health and Sanitation',
    type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'govt' }] }],
  });

  store.create('Location', 'loc-ngelehun', {
    resourceType: 'Location',
    id: 'loc-ngelehun',
    name: 'Ngelehun CHC',
    status: 'active',
    managingOrganization: { reference: 'Organization/org-moh' },
    address: { district: 'Bo', country: 'SL' },
  });

  const practitioners = [
    { id: 'prac-0001', family: 'Kamara', given: 'Aminata', gender: 'female', role: 'nurse', roleDisplay: 'Nurse' },
    { id: 'prac-0002', family: 'Sesay', given: 'Ibrahim', gender: 'male', role: 'doctor', roleDisplay: 'Medical Doctor' },
    { id: 'prac-0003', family: 'Bangura', given: 'Fatmata', gender: 'female', role: 'chw', roleDisplay: 'Community Health Worker' },
  ];
  for (const p of practitioners) {
    store.create('Practitioner', p.id, {
      resourceType: 'Practitioner',
      id: p.id,
      active: true,
      name: [{ use: 'official', family: p.family, given: [p.given] }],
      gender: p.gender,
    });
    store.create('PractitionerRole', `role-${p.id}`, {
      resourceType: 'PractitionerRole',
      id: `role-${p.id}`,
      active: true,
      practitioner: { reference: `Practitioner/${p.id}` },
      organization: { reference: 'Organization/org-moh' },
      location: [{ reference: 'Location/loc-ngelehun' }],
      code: [{ coding: [{ system: 'http://snomed.info/sct', code: p.role, display: p.roleDisplay }] }],
    });
  }
}
