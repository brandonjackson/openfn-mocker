import { describe, it, expect } from 'vitest';
import { plugins } from '../src/systems/index.js';
import type { CredentialType } from '../src/auth.js';

const TYPES: CredentialType[] = ['userpass', 'apikey', 'oauth', 'none'];

describe('per-plugin credential spec', () => {
  it('every plugin declares a credential with a valid type and a url field', () => {
    for (const [name, plugin] of Object.entries(plugins)) {
      const cred = plugin.credential;
      expect(cred, `${name} should declare a credential`).toBeDefined();
      expect(TYPES).toContain(cred!.type);
      expect(cred!.fields.length, `${name} needs at least one field`).toBeGreaterThan(0);
      // 'host' is a bare host[:port] variant of 'url' (see CredentialFieldRole)
      // for adaptors that derive their own per-service hosts from it.
      const urlFields = cred!.fields.filter((f) => f.role === 'url' || f.role === 'host');
      expect(urlFields.length, `${name} needs exactly one url/host field`).toBe(1);
    }
  });

  it('every secret field carries a generation shape and every non-secret a value', () => {
    for (const [name, plugin] of Object.entries(plugins)) {
      for (const f of plugin.credential!.fields) {
        if (f.role === 'secret') {
          expect(f.secret, `${name}.${f.name} secret needs a shape`).toBeDefined();
          expect(f.value, `${name}.${f.name} secret must not hardcode a value`).toBeUndefined();
        } else if (f.role !== 'url' && f.role !== 'host') {
          // url/host values are filled in by the sandbox from the mount path
          // (url) or the bare origin (host).
          expect(typeof f.value, `${name}.${f.name} needs a value`).toBe('string');
        }
      }
    }
  });

  it('a plugin whose mock enforces auth can build a live auth header', () => {
    // PR #10 systems: if the mock returns 401 without a credential, the sandbox
    // must know how to authenticate its live example requests.
    for (const [name, plugin] of Object.entries(plugins)) {
      if (plugin.auth?.required) {
        expect(plugin.credential!.authHeader, `${name} enforces auth`).toBeDefined();
      }
    }
    // Exactly the systems whose plugin enforces auth carry an authHeader.
    const enforced = Object.keys(plugins).filter((n) => plugins[n].auth?.required).sort();
    expect(enforced).toEqual(
      ['commcare', 'dhis2', 'kobotoolbox', 'mailgun', 'openmrs', 'primero', 'twilio'].sort()
    );
  });

  it('classifies username/password vs API key vs OAuth from the real adaptor shape', () => {
    const type = (n: string) => plugins[n].credential!.type;
    expect(type('dhis2')).toBe('userpass');
    expect(type('openmrs')).toBe('userpass');
    expect(type('godata')).toBe('userpass');
    expect(type('mailgun')).toBe('apikey');
    expect(type('twilio')).toBe('apikey');
    expect(type('rapidpro')).toBe('apikey');
    expect(type('opencrvs')).toBe('oauth');
    expect(type('fhir')).toBe('none');
    expect(type('http-generic')).toBe('none');
  });

  it('uses the exact field names from each adaptor configuration-schema.json', () => {
    const names = (n: string) => plugins[n].credential!.fields.map((f) => f.name);
    // Field names must match what the adaptor actually reads, or the credential
    // a user pastes into OpenFn will not target the mock.
    expect(names('dhis2')).toEqual(['hostUrl', 'username', 'password']);
    expect(names('openmrs')).toEqual(['instanceUrl', 'username', 'password']);
    expect(names('kobotoolbox')).toEqual(['baseUrl', 'username', 'password', 'apiVersion']);
    expect(names('primero')).toEqual(['url', 'user', 'password']);
    expect(names('mailgun')).toEqual(['baseUrl', 'domain', 'apiKey']);
    expect(names('twilio')).toEqual(['baseUrl', 'accountSid', 'authToken']);
    expect(names('rapidpro')).toEqual(['host', 'token', 'apiVersion']);
    expect(names('odk')).toEqual(['baseUrl', 'email', 'password']);
    expect(names('openhim')).toEqual(['apiUrl', 'username', 'password']);
    expect(names('openspp')).toEqual(['baseUrl', 'database', 'username', 'password']);
    expect(names('opencrvs')).toEqual(['domain', 'clientId', 'clientSecret']);
    expect(names('openlmis')).toEqual([
      'baseUrl',
      'username',
      'password',
      'clientId',
      'clientSecret',
    ]);
    // Regression guard: the old sandbox guessed these wrong.
    expect(names('kobotoolbox')).not.toContain('apiToken');
    expect(names('commcare')).not.toContain('hostURL');
    expect(names('commcare')).toContain('hostUrl');
  });
});
