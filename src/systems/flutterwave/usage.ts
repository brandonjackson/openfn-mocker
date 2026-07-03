import type { UsageExample } from '../types.js';

/**
 * Usage examples for the flutterwave sandbox "Usage" tab: one entry per adaptor
 * function (createCustomer, initiatePayment, createPaymentMethod).
 */
export const usage: UsageExample[] = [
  {
    fn: 'createCustomer',
    signature: 'createCustomer(customerData, options?)',
    description: 'Create a new customer in Flutterwave.',
    code: "createCustomer({\n  name: { first: 'Ada', last: 'Lovelace' },\n  email: 'ada@example.com',\n  phone: { country_code: '234', number: '8012345678' }\n});",
    apiRef: 'createCustomer',
  },
  {
    fn: 'initiatePayment',
    signature: 'initiatePayment(paymentData, options?)',
    description: 'Initiate a payment (charge) request to Flutterwave.',
    code: "initiatePayment({\n  amount: 1000,\n  currency: 'NGN',\n  customer_id: 'cus_00000000000001',\n  payment_method_id: 'pmt_00000000000001',\n  reference: 'order-1001'\n});",
    apiRef: 'initiatePayment',
  },
  {
    fn: 'createPaymentMethod',
    signature: 'createPaymentMethod(paymentMethodData, options?)',
    description: 'Create a new payment method for a customer.',
    code: "createPaymentMethod({\n  type: 'card',\n  customer_id: 'cus_00000000000001',\n  card: { nonce: 'nonce-abc', expiry_month: 9, expiry_year: 32 }\n});",
    apiRef: 'createPaymentMethod',
  },
];
