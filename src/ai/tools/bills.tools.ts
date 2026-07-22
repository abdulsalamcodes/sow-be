import { z } from 'zod';
import type { BillsServiceContract } from '../../contracts/financial-services.js';
import type { ToolDefinition } from './types.js';

export const buildBillsTools = (
  billsService: BillsServiceContract,
): ToolDefinition[] => [
  {
    name: 'list-biller-categories',
    description:
      'List available bill payment categories (e.g. electricity, airtime, cable TV, internet).',
    inputSchema: z.object({}),
    execute: async () => {
      const categories = await billsService.listCategories();
      return { categories };
    },
  },
  {
    name: 'list-billers',
    description:
      'List billers for a category. REQUIRED: pass the categoryCode from list-biller-categories to filter billers (e.g. "AIRTIME" for airtime).',
    inputSchema: z.object({
      categoryCode: z
        .string()
        .describe(
          'Category code from list-biller-categories (e.g. AIRTIME, ELECTRICITY, DATA_BUNDLE, CABLE_TV)',
        ),
    }),
    execute: async (_userId, { categoryCode }) => {
      const billers = await billsService.listBillers(
        categoryCode as string | undefined,
      );
      return { billers };
    },
  },
  {
    name: 'list-products',
    description:
      'List available products (plans/packages) for a biller. REQUIRED: pass the billerCode from list-billers (e.g. "MTN" for MTN airtime). Must call list-biller-categories then list-billers first.',
    inputSchema: z.object({
      billerCode: z.string().describe('Biller code to get products for'),
    }),
    execute: async (_userId, { billerCode }) => {
      const products = await billsService.getBillerProducts(
        billerCode as string,
      );
      return { products };
    },
  },
  {
    name: 'validate-customer',
    description:
      'Validate a customer ID for a bill product (e.g. phone number for airtime, meter number for electricity). REQUIRED: pass the productCode from list-products. Must call list-biller-categories, list-billers, list-products first.',
    inputSchema: z.object({
      productCode: z.string().describe('Product code from list-products'),
      customerId: z
        .string()
        .describe(
          'Customer ID, meter number, phone number, or smart card number',
        ),
    }),
    execute: async (_userId, { productCode, customerId }) => {
      const result = await billsService.validateCustomer(
        productCode as string,
        customerId as string,
      );
      return result;
    },
  },
  {
    name: 'pay-bill',
    description:
      'DO NOT call this directly — call list-biller-categories, list-billers, list-products, and validate-customer FIRST in that order. ' +
      'Pay a bill (airtime, data, electricity, cable TV, etc.). This debits your wallet immediately. ' +
      'Use the productCode from list-products and the validationReference from validate-customer. ' +
      'Use a unique reference like "sow-" + Date.now().',
    inputSchema: z.object({
      productCode: z.string(),
      customerId: z.string(),
      amountKobo: z.coerce.number().int().positive(),
      reference: z.string().describe('Unique reference for this transaction'),
      validationReference: z
        .string()
        .optional()
        .describe('From validate-customer response'),
      provider: z.string().describe('Biller name or provider label'),
      billType: z
        .string()
        .describe(
          'Type of bill: AIRTIME, DATA, ELECTRICITY, CABLE, INTERNET, etc.',
        ),
    }),
    execute: async (userId, input) => {
      const data = input as {
        productCode: string;
        customerId: string;
        amountKobo: number;
        reference: string;
        validationReference?: string;
        provider: string;
        billType: string;
      };
      const result = await billsService.executeBillPayment({
        userId,
        productCode: data.productCode,
        customerId: data.customerId,
        amountKobo: data.amountKobo,
        reference: data.reference,
        validationReference: data.validationReference,
        provider: data.provider,
        billType: data.billType,
      });
      return result as unknown as Record<string, unknown>;
    },
  },
];
