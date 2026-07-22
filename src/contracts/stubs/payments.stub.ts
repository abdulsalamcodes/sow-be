import { Injectable } from '@nestjs/common';
import {
  PaymentsServiceContract,
  TransferRequest,
  TransferResult,
} from '../financial-services.js';

@Injectable()
export class PaymentsServiceStub implements PaymentsServiceContract {
  executeTransfer(request: TransferRequest): Promise<TransferResult> {
    return Promise.resolve({
      reference: `stub-${request.idempotencyKey}`,
      status: 'SUCCESS',
    });
  }

  validateOtp(_otpReference: string, _otp: string): Promise<TransferResult> {
    return Promise.resolve({ reference: '', status: 'SUCCESS' });
  }
}
