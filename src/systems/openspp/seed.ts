import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenSPP seed (social-protection Digital Public Good, built on Odoo). Seeds the
 * Odoo models the openspp adaptor reads/writes via XML-RPC: res.partner (both
 * individual registrants and group households), g2p.program, spp.area,
 * spp.service.point and the membership join models. Records use integer ids like
 * a real Odoo database. Collections are keyed by the Odoo model name.
 */

export const UID = 2; // the "authenticated" Odoo user id returned by login.

export function seed(store: DataStore, _config: SystemConfig): void {
  // Groups (households) and individuals both live in res.partner.
  const partners = [
    { id: 1, name: 'Kamara Household', is_group: true, is_registrant: true, kind: 'Household', area_id: [2, 'Bo District'] },
    { id: 2, name: 'Sesay Household', is_group: true, is_registrant: true, kind: 'Household', area_id: [3, 'Kenema District'] },
    { id: 3, name: 'Amina Kamara', is_group: false, is_registrant: true, gender: 'Female', birthdate: '1985-09-30', phone: '+23276000002' },
    { id: 4, name: 'Mohamed Kamara', is_group: false, is_registrant: true, gender: 'Male', birthdate: '1982-05-14', phone: '+23276000004' },
    { id: 5, name: 'Fatmata Sesay', is_group: false, is_registrant: true, gender: 'Female', birthdate: '1990-02-20', phone: '+23276000005' },
  ];
  for (const p of partners) store.create('res.partner', String(p.id), p);

  const programs = [
    { id: 10, name: 'Cash Transfer 2024', program_type: 'cash', state: 'active' },
    { id: 11, name: 'School Feeding', program_type: 'in_kind', state: 'active' },
  ];
  for (const p of programs) store.create('g2p.program', String(p.id), p);

  const areas = [
    { id: 1, name: 'Sierra Leone', code: 'SL', parent_id: false },
    { id: 2, name: 'Bo District', code: 'SL-BO', parent_id: [1, 'Sierra Leone'] },
    { id: 3, name: 'Kenema District', code: 'SL-KE', parent_id: [1, 'Sierra Leone'] },
  ];
  for (const a of areas) store.create('spp.area', String(a.id), a);

  const servicePoints = [
    { id: 20, name: 'Bo Pay Point', area_id: [2, 'Bo District'], service_type: 'bank', is_disabled: false },
    { id: 21, name: 'Kenema Pay Point', area_id: [3, 'Kenema District'], service_type: 'agent', is_disabled: false },
  ];
  for (const s of servicePoints) store.create('spp.service.point', String(s.id), s);

  // Program enrolments (g2p.program_membership) and group memberships.
  store.create('g2p.program_membership', '30', { id: 30, partner_id: [1, 'Kamara Household'], program_id: [10, 'Cash Transfer 2024'], state: 'enrolled' });
  store.create('g2p.group.membership', '40', { id: 40, group: [1, 'Kamara Household'], individual: [3, 'Amina Kamara'], kind: [1, 'Head'] });
  store.create('g2p.group.membership', '41', { id: 41, group: [1, 'Kamara Household'], individual: [4, 'Mohamed Kamara'], kind: false });
  store.create('g2p.group.membership.kind', '1', { id: 1, name: 'Head', is_unique: true });
}
