import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ghana NIA (National Identification Authority). The ghana-nia adaptor posts to
 * the AWOPA baby-registration API to mint a Ghana Card PIN for a newborn. It
 * sends `content-type: application/json` plus an `NIa_merchantKey` header
 * (accept-all here) and appends `merchantKey` into the request body.
 * `registerChild` targets the fixed path POST /awopa/api/v1/baby/registration;
 * the generic `get`/`post` hit any path. The real API answers 200 with
 * `{ data: { babyPin, voucherPin, ... }, success: true, code: '00', msg }`.
 */

const REG_PATH = '/awopa/api/v1/baby/registration';

/** Shape the `data` block NIA returns for a minted registration. */
function regData(reg: Record<string, any>): Record<string, any> {
  return {
    babyPin: reg.babyPin,
    voucherPin: reg.voucherPin,
    etrackerLightwaveId: reg.etrackerLightwaveId,
    lightwaveEtrackerId: reg.lightwaveEtrackerId ?? null,
  };
}

/** Build a stored registration record from a registerChild/post body. */
function toRegistration(body: Record<string, any>): Record<string, any> {
  const digits = String(randomInt(0, 1_000_000_000)).padStart(9, '0');
  return {
    babyPin: `GHA-${digits}-1`,
    voucherPin: `GHA-${digits}-4`,
    etrackerLightwaveId: body?.babyData?.lightwaveETrackerID ?? null,
    lightwaveEtrackerId: null,
    babyData: body?.babyData ?? {},
    personVouching: body?.personVouching ?? {},
    createdAt: new Date().toISOString(),
  };
}

const plugin: MockSystemPlugin = {
  name: 'ghana-nia',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'merchantKey', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /awopa/api/v1/baby/registration — registerChild (and generic post):
    // mint a baby Ghana Card PIN. NIA answers 200 (not 201) with a data envelope.
    app.post(REG_PATH, async (req, reply) => {
      const reg = toRegistration((req.body ?? {}) as Record<string, any>);
      store.create('registrations', reg.babyPin, reg);
      reply.code(200);
      return { data: regData(reg), success: true, code: '00', msg: 'Saved Successfully' };
    });

    // GET /awopa/api/v1/baby/registration — list minted registrations (generic get).
    app.get(REG_PATH, async () => ({
      success: true,
      code: '00',
      data: store.list('registrations').map(regData),
    }));

    // GET /awopa/api/v1/baby/registration/:pin — look up one registration by baby PIN.
    app.get(`${REG_PATH}/:pin`, async (req, reply) => {
      const pin = String((req.params as Record<string, any>).pin);
      const reg = store.get('registrations', pin);
      if (!reg) {
        reply.code(404);
        // "Verifiation" typo preserved from the adaptor's own error mock.
        return { success: false, code: '05', data: null, msg: 'Error in Verifiation Process' };
      }
      return { data: regData(reg), success: true, code: '00', msg: 'Saved Successfully' };
    });
  },

  seed,
};

export default plugin;
