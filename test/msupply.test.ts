import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import msupply from '../src/systems/msupply/plugin.js';

const config = { port: 0 };

const gql = (query: string, variables: Record<string, any> = {}) => ({
  method: 'POST' as const,
  url: '/graphql',
  payload: { query, variables },
});

describe('msupply (Open mSupply GraphQL)', () => {
  it('logs in via authToken and returns a bearer token', async () => {
    const { app } = await createSystemServer(msupply, config, { logLevel: 'silent' });
    const res = await app.inject(
      gql('query AuthToken($username: String!, $password: String!) { authToken(username: $username, password: $password) { token } }', {
        username: 'admin',
        password: 'secret',
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().data.authToken.token).toBe('mock-msupply-token');
    await app.close();
  });

  it('getItemsWithStats returns seeded item nodes with stats', async () => {
    const { app } = await createSystemServer(msupply, config, { logLevel: 'silent' });
    const res = await app.inject(gql('query itemsWithStats($storeId: String!) { items(storeId: $storeId) { nodes { id } totalCount } }', { storeId: 'store-a' }));
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.totalCount).toBe(3);
    expect(items.nodes[0].stats.averageMonthlyConsumption).toBeGreaterThan(0);
    await app.close();
  });

  it('insertOutboundShipment creates an invoice with an id and number', async () => {
    const { app } = await createSystemServer(msupply, config, { logLevel: 'silent' });
    const res = await app.inject(
      gql('mutation insertOutboundShipment($id: String!, $otherPartyId: String!, $storeId: String!) { insertOutboundShipment(storeId: $storeId, input: {id: $id, otherPartyId: $otherPartyId}) { id invoiceNumber } }', {
        id: 'shipment-1',
        otherPartyId: 'customer-1',
        storeId: 'store-a',
      })
    );
    expect(res.statusCode).toBe(200);
    const invoice = res.json().data.insertOutboundShipment;
    expect(invoice.id).toBe('shipment-1');
    expect(invoice.invoiceNumber).toBe(1);
    await app.close();
  });

  it('upsertOutboundShipment (batch) returns a shaped batch response', async () => {
    const { app } = await createSystemServer(msupply, config, { logLevel: 'silent' });
    const res = await app.inject(
      gql('mutation upsertOutboundShipment($storeId: String!, $input: BatchOutboundShipmentInput!) { batchOutboundShipment(storeId: $storeId, input: $input) { __typename } }', {
        storeId: 'store-a',
        input: {},
      })
    );
    expect(res.statusCode).toBe(200);
    const batch = res.json().data.batchOutboundShipment;
    expect(batch.__typename).toBe('BatchOutboundShipmentResponse');
    expect(Array.isArray(batch.insertOutboundShipments)).toBe(true);
    await app.close();
  });
});
