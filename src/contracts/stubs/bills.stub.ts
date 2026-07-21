import { Injectable } from '@nestjs/common';
import {
  BillsServiceContract,
  BillerCategory,
  Biller,
  BillerProduct,
  BillPaymentRequest,
  BillPaymentResult,
} from '../financial-services.js';

@Injectable()
export class BillsServiceStub implements BillsServiceContract {
  listCategories(): Promise<BillerCategory[]> {
    return Promise.resolve([
      { categoryCode: 'airtime', categoryName: 'Airtime' },
      { categoryCode: 'tv', categoryName: 'Cable TV' },
      { categoryCode: 'electricity', categoryName: 'Electricity' },
      { categoryCode: 'internet', categoryName: 'Internet' },
    ]);
  }

  listBillers(_categoryCode?: string): Promise<Biller[]> {
    return Promise.resolve([
      { billerCode: 'MTN', billerName: 'MTN Nigeria', categoryCode: 'airtime' },
      { billerCode: 'GLO', billerName: 'Glo', categoryCode: 'airtime' },
      { billerCode: 'DSTV', billerName: 'DSTV', categoryCode: 'tv' },
    ]);
  }

  getBillerProducts(_billerCode: string): Promise<BillerProduct[]> {
    return Promise.resolve([
      { productCode: 'mtn-100', productName: '₦100 Airtime', amount: 10000, fixedPrice: true },
      { productCode: 'mtn-500', productName: '₦500 Airtime', amount: 50000, fixedPrice: true },
    ]);
  }

  validateCustomer(
    _productCode: string,
    _customerId: string,
  ): Promise<{ valid: boolean; name?: string; validationReference?: string }> {
    return Promise.resolve({ valid: true, name: 'Test Customer' });
  }

  executeBillPayment(_request: BillPaymentRequest): Promise<BillPaymentResult> {
    return Promise.resolve({
      reference: 'stub-bill-ref',
      status: 'SUCCESS',
    });
  }

  requeryBillPayment(_reference: string): Promise<BillPaymentResult> {
    return Promise.resolve({
      reference: 'stub-bill-ref',
      status: 'SUCCESS',
    });
  }
}
