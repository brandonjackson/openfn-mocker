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
  // Groups (households) and individuals both live in res.partner. The adaptor's
  // get/update/search helpers look registrants up by the human-facing `spp_id`
  // (e.g. GRP_… / IND_…), not the integer Odoo id, so every registrant carries
  // one.
  const partners = [
    { id: 1, name: 'Kamara Household', spp_id: 'GRP_KAMARA01', is_group: true, is_registrant: true, kind: 'Household', area_id: [2, 'Bo District'] },
    { id: 2, name: 'Sesay Household', spp_id: 'GRP_SESAY001', is_group: true, is_registrant: true, kind: 'Household', area_id: [3, 'Kenema District'] },
    { id: 3, name: 'Amina Kamara', spp_id: 'IND_AMINA001', is_group: false, is_registrant: true, gender: 'Female', birthdate: '1985-09-30', phone: '+23276000002' },
    { id: 4, name: 'Mohamed Kamara', spp_id: 'IND_MOHAMED1', is_group: false, is_registrant: true, gender: 'Male', birthdate: '1982-05-14', phone: '+23276000004' },
    { id: 5, name: 'Fatmata Sesay', spp_id: 'IND_FATMATA1', is_group: false, is_registrant: true, gender: 'Female', birthdate: '1990-02-20', phone: '+23276000005' },
  ];
  for (const p of partners) store.create('res.partner', String(p.id), p);

  // g2p.program is queried by its `program_id` (getProgram / enroll) as well as
  // by the integer id (getEnrolledPrograms), so carry both.
  const programs = [
    { id: 10, name: 'Cash Transfer 2024', program_id: 'PROG_CT2024', program_type: 'cash', state: 'active' },
    { id: 11, name: 'School Feeding', program_id: 'PROG_SF2024', program_type: 'in_kind', state: 'active' },
  ];
  for (const p of programs) store.create('g2p.program', String(p.id), p);

  const areas = [
    { id: 1, name: 'Sierra Leone', spp_id: 'AREA_SL', code: 'SL', parent_id: false },
    { id: 2, name: 'Bo District', spp_id: 'AREA_SL_BO', code: 'SL-BO', parent_id: [1, 'Sierra Leone'] },
    { id: 3, name: 'Kenema District', spp_id: 'AREA_SL_KE', code: 'SL-KE', parent_id: [1, 'Sierra Leone'] },
  ];
  for (const a of areas) store.create('spp.area', String(a.id), a);

  const servicePoints = [
    { id: 20, name: 'Bo Pay Point', spp_id: 'SVP_BO01', area_id: [2, 'Bo District'], service_type_ids: [1], phone_sanitized: '+23276111020', shop_address: 'Bo Town Centre', is_contract_active: true, is_disabled: false },
    { id: 21, name: 'Kenema Pay Point', spp_id: 'SVP_KE01', area_id: [3, 'Kenema District'], service_type_ids: [2], phone_sanitized: '+23276111021', shop_address: 'Kenema Market', is_contract_active: true, is_disabled: false },
  ];
  for (const s of servicePoints) store.create('spp.service.point', String(s.id), s);

  // Program enrolments (g2p.program_membership) and group memberships. Group
  // memberships carry `is_ended` (getGroupMembers / addToGroup / removeFromGroup
  // filter on `is_ended = false`) plus the member fields getGroupMembers reads.
  store.create('g2p.program_membership', '30', { id: 30, partner_id: [1, 'Kamara Household'], program_id: [10, 'Cash Transfer 2024'], state: 'enrolled' });
  store.create('g2p.group.membership', '40', {
    id: 40, group: [1, 'Kamara Household'], individual: [3, 'Amina Kamara'], kind: [1], is_ended: false,
    start_date: '2024-01-15', ended_date: false, individual_birthdate: '1985-09-30', individual_gender: 'Female',
  });
  store.create('g2p.group.membership', '41', {
    id: 41, group: [1, 'Kamara Household'], individual: [4, 'Mohamed Kamara'], kind: [], is_ended: false,
    start_date: '2024-01-15', ended_date: false, individual_birthdate: '1982-05-14', individual_gender: 'Male',
  });
  store.create('g2p.group.membership.kind', '1', { id: 1, name: 'Head', is_unique: true });
}
