import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/** The phone number the credential's `phoneNumberId` points at. */
export const PHONE_NUMBER_ID = '106540352242922';
export const WABA_ID = '102290129340398';

/**
 * WhatsApp Business Platform (Cloud API) seed: one business phone number with
 * its business profile and commerce settings, a couple of blocked users, two
 * QR-code deep links, and a short history of sent messages. Shapes follow
 * Meta's own OpenAPI (openfn-api-specs specs/adaptors/whatsapp).
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('phone_numbers', PHONE_NUMBER_ID, {
    id: PHONE_NUMBER_ID,
    display_phone_number: '+1 555-010-4422',
    verified_name: 'OpenFn Clinic',
    quality_rating: 'GREEN',
    code_verification_status: 'VERIFIED',
    name_status: 'APPROVED',
    registered: true,
  });

  store.create('business_profiles', PHONE_NUMBER_ID, {
    messaging_product: 'whatsapp',
    about: 'Appointment reminders and test results from the OpenFn Clinic.',
    address: '12 Riverside Road, Nairobi',
    email: 'hello@clinic.example.org',
    profile_picture_url: 'https://pps.whatsapp.net/v/t61.24694-24/openfn-clinic.jpg',
    websites: ['https://clinic.example.org'],
    vertical: 'HEALTH',
  });

  store.create('commerce_settings', PHONE_NUMBER_ID, {
    id: '1095744838563092',
    is_cart_enabled: false,
    is_catalog_visible: false,
  });

  for (const wa_id of ['254711000111', '254722000222']) {
    store.create('blocked_users', wa_id, { messaging_product: 'whatsapp', wa_id });
  }

  const qr = [
    { code: 'ANED2T5QRU7HGZ', prefilled_message: 'Book an appointment' },
    { code: 'WTPX3KQ7L2MN4B', prefilled_message: 'Get my test results' },
  ];
  // Seeded at a fixed time so the payload is stable between boots.
  const created = 1767225600; // 2026-01-01T00:00:00Z
  for (const q of qr) {
    store.create('qr_codes', q.code, {
      ...q,
      deep_link_url: `https://wa.me/message/${q.code}`,
      qr_image_url: `https://scontent.xx.fbcdn.net/m1/v/t6/qr/${q.code}.png`,
      creation_time: created,
    });
  }

  const sent = [
    { id: 'wamid.HBgMMjU0NzEyMzQ1Njc4FQIAERgSQzNEMTlCN0QwRjVBNjU0QjY4AA==', to: '254712345678', type: 'template', template: { name: 'appointment_reminder', language: { code: 'en_US', policy: 'deterministic' } } },
    { id: 'wamid.HBgMMjU0NzIzNDU2Nzg5FQIAERgSRTJGNzA0QTlCMzdCOTk2RkM0AA==', to: '254723456789', type: 'text', text: { body: 'Your results are ready to collect.' } },
  ];
  for (const m of sent) store.create('messages', m.id, { messaging_product: 'whatsapp', recipient_type: 'individual', status: 'sent', ...m });
}
