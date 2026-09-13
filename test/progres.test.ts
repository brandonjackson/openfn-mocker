import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import progres from '../src/systems/progres/plugin.js';

const config = { port: 0 };

/**
 * proGres v4 is reached through DTP, a message gateway: one POST per
 * interoperability message type, no CRUD surface. DTP documents no response
 * body and only 200/401/403/500, so every well-formed message is acknowledged —
 * including one naming an intervention DTP has never seen (proGres validates
 * asynchronously and answers on the partner's own inbox).
 */
describe('progres (UNHCR DTP message gateway)', () => {
  it('accepts an incoming referral and raises a proGres intervention for it', async () => {
    const { app, store } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/ReceiveIncomingReferral',
      payload: {
        request_type: 'ReceiveIncomingReferral',
        id: 'case-1#svc-1',
        service_type: 'Legal Assistance Service',
        unhcr_individual_no: 'AAA0000000000',
        name_first: 'Given',
        name_last: 'Family',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().request_type).toBe('ReceiveIncomingReferral');
    expect(res.json().status).toBe('Received');

    const referral = store.get('referrals', 'case-1#svc-1');
    expect(referral.unhcr_individual_no).toBe('AAA0000000000');
    expect(referral.progres_interventionnumber).toMatch(/^NAI-20-PRTITV-\d{7}$/);

    const intervention = store.get('interventions', referral.progres_interventionnumber);
    expect(intervention.direction).toBe('incoming');
    expect(intervention['interventiontype.progres_description']).toBe('Legal Assistance Service');
    await app.close();
  });

  it('gives each referral its own intervention number, never reusing a seeded one', async () => {
    const { app, store } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const before = store.count('interventions');
    for (const id of ['a', 'b']) {
      await app.inject({ method: 'POST', url: '/ReceiveIncomingReferral', payload: { id } });
    }
    expect(store.count('interventions')).toBe(before + 2);
    const numbers = store.list('interventions').map((i: any) => i.progres_interventionnumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    await app.close();
  });

  it('records an outgoing-referral decision against the seeded intervention', async () => {
    const { app, store } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/ReceiveDecisionOutgoingReferral',
      payload: {
        request_type: 'ReceiveDecisionOutgoingReferral',
        case_id: 'b30cba6b-8d97-4524-b77f-a8f50cfcc974',
        primero_user: 'primero_cp',
        progres_interventionnumber: 'NAI-20-PRTITV-0000006',
        status: 'acknowledged',
        closure_reason: 'No reason specified.',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().request_type).toBe('ReceiveDecisionOutgoingReferral');
    const intervention = store.get('interventions', 'NAI-20-PRTITV-0000006');
    expect(intervention.decision_status).toBe('acknowledged');
    expect(intervention.case_id).toBe('b30cba6b-8d97-4524-b77f-a8f50cfcc974');
    await app.close();
  });

  it('records a delivery-failure Feedback message', async () => {
    const { app, store } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/Feedback',
      payload: {
        request_type: 'Feedback',
        progres_interventionnumber: 'NAI-20-PRTITV-0000011',
        status: 'Delivery Fail',
        closure_reason: 'Intervention referral is missing fields required for sending.',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().request_type).toBe('Feedback');
    const intervention = store.get('interventions', 'NAI-20-PRTITV-0000011');
    expect(intervention.delivery_status).toBe('Delivery Fail');
    expect(intervention.closure_reason).toMatch(/missing fields/);
    await app.close();
  });

  it('accepts a message for an intervention it has never seen (DTP has no 4xx here)', async () => {
    const { app, store } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/Feedback',
      payload: { progres_interventionnumber: 'ZZZ-99-PRTITV-9999999', status: 'Pending Acknowledgement' },
    });
    expect(res.statusCode).toBe(200);
    expect(store.get('interventions', 'ZZZ-99-PRTITV-9999999').delivery_status).toBe(
      'Pending Acknowledgement'
    );
    await app.close();
  });

  it('serves no REST surface: the old /api/v4 routes do not exist', async () => {
    const { app } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v4/individuals' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
