import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * UNHCR proGres v4 (refugee registration & case management), reached through
 * DTP — UNHCR's Data Transfer Platform, an Azure API Management gateway.
 *
 * proGres has no public REST API and no CRUD surface. Partners post one message
 * per interoperability event to a DTP URL issued per integration
 * (`https://<apim-host>/<deployment>/<MessageType>`), presenting an
 * `Ocp-Apim-Subscription-Key` header and a UNHCR-issued client certificate over
 * mutual TLS. The message type is both the last path segment and the body's
 * `request_type`. The progres adaptor's only operation — `postData({ url, body,
 * headers, agentOptions })` — is exactly that POST, which is why the credential
 * holds a whole `url` rather than a host plus resource paths.
 *
 * The three routes below are the outbound messages DTP accepts. The two
 * messages that travel the other way (`PrimeroOutgoingReferral` and
 * `PrimeroIncomingReferralDecision`) are delivered by DTP to the partner's own
 * inbox — an OpenFn webhook — so they are not endpoints this system serves.
 *
 * Behaviour notes, both taken from the spec (openfn-api-specs `progres`) and
 * OpenFn/primero-progres, the UNICEF/UNHCR reference integration that is the
 * only public source of DTP paths and payloads:
 *
 *  - DTP answers 2xx as soon as a message is queued, and UNHCR documents no
 *    response body (the reference jobs ignore it), so the acknowledgement here
 *    stays deliberately bare rather than inventing proGres-side fields.
 *  - proGres reviews asynchronously and answers on the partner inbox, so a
 *    message naming an unknown intervention is still accepted: DTP documents
 *    only 200/401/403/500 on these routes, and no 4xx validation response.
 */

/** proGres intervention numbers look like `NAI-20-PRTITV-0000006`. */
function nextInterventionNumber(store: DataStore): string {
  const fmt = (n: number): string => `NAI-20-PRTITV-${String(n).padStart(7, '0')}`;
  let n = store.count('interventions') + 1;
  while (store.get('interventions', fmt(n))) n++;
  return fmt(n);
}

/**
 * What DTP hands back once a message is queued. UNHCR publishes no schema for
 * it (the spec's `DtpAcknowledgement` asserts no fields), so this echoes the
 * message type and says it was taken — nothing more.
 */
function ack(requestType: string): Record<string, any> {
  return { request_type: requestType, status: 'Received' };
}

/** Record the partner's view of an intervention, creating it if DTP has not seen it. */
function noteOnIntervention(
  store: DataStore,
  number: string | undefined,
  patch: Record<string, any>
): void {
  if (!number) return;
  if (store.get('interventions', number)) store.update('interventions', number, patch);
  else store.create('interventions', number, { progres_interventionnumber: number, ...patch });
}

const plugin: MockSystemPlugin = {
  name: 'progres',
  credential: {
    type: 'apikey',
    // Exactly the adaptor's configuration-schema: the full DTP URL, the client
    // private key and certificate for mutual TLS, and the APIM subscription key
    // (the adaptor calls it `token`; it is sent as Ocp-Apim-Subscription-Key).
    fields: [
      { name: 'url', role: 'url' },
      { name: 'key', role: 'secret', secret: { charset: 'hex', length: 64 } },
      { name: 'cert', role: 'secret', secret: { charset: 'hex', length: 64 } },
      { name: 'token', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /ReceiveIncomingReferral — a partner system refers a case into
    // proGres. One message per referred service; proGres raises an intervention
    // and returns its decision later, on the partner's inbox.
    app.post('/ReceiveIncomingReferral', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const number = nextInterventionNumber(store);
      store.create('referrals', String(body.id ?? number), {
        ...body,
        progres_interventionnumber: number,
        received_at: new Date().toISOString(),
      });
      store.create('interventions', number, {
        progres_interventionnumber: number,
        'interventiontype.progres_description': body.service_type ?? null,
        'individuals.progres_id': body.unhcr_individual_no ?? null,
        'individuals.progres_givenname': body.name_first ?? null,
        'individuals.progres_familyname': body.name_last ?? null,
        progres_orgreferralid: body.id ?? null,
        direction: 'incoming',
        review_status: 'Pending Review',
      });
      reply.code(200);
      return ack('ReceiveIncomingReferral');
    });

    // POST /ReceiveDecisionOutgoingReferral — the partner caseworker's verdict
    // on a referral proGres sent out (acknowledged / rejected, plus a reason).
    app.post('/ReceiveDecisionOutgoingReferral', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      noteOnIntervention(store, body.progres_interventionnumber, {
        decision_status: body.status ?? null,
        closure_reason: body.closure_reason ?? null,
        case_id: body.case_id ?? null,
        primero_user: body.primero_user ?? null,
        decided_at: new Date().toISOString(),
      });
      reply.code(200);
      return ack('ReceiveDecisionOutgoingReferral');
    });

    // POST /Feedback — delivery notification for one intervention: "Pending
    // Acknowledgement" once the partner has created the record, or
    // "Delivery Fail" with a closure_reason when it could not.
    app.post('/Feedback', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      noteOnIntervention(store, body.progres_interventionnumber, {
        delivery_status: body.status ?? null,
        closure_reason: body.closure_reason ?? null,
        case_id: body.case_id ?? null,
        primero_user: body.primero_user ?? null,
        delivered_at: new Date().toISOString(),
      });
      reply.code(200);
      return ack('Feedback');
    });
  },

  seed,
};

export default plugin;
