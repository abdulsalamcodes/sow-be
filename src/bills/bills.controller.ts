import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BillsService } from './bills.service.js';

class ValidateCustomerDto {
  @IsString()
  productCode!: string;

  @IsString()
  customerId!: string;
}

class PayBillDto {
  @IsString()
  productCode!: string;

  @IsString()
  customerId!: string;

  @IsNumber()
  @Min(1)
  amountKobo!: number;

  @IsString()
  reference!: string;

  @IsOptional()
  @IsString()
  validationReference?: string;

  @IsString()
  provider!: string;

  @IsString()
  billType!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('bills')
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Get('categories')
  listCategories() {
    return this.billsService.listCategories();
  }

  @Get('billers')
  listBillers(@Query('categoryCode') categoryCode?: string) {
    return this.billsService.listBillers(categoryCode);
  }

  @Get('products')
  getProducts(@Query('billerCode') billerCode: string) {
    return this.billsService.getBillerProducts(billerCode);
  }

  @Post('validate-customer')
  validateCustomer(@Body() dto: ValidateCustomerDto) {
    return this.billsService.validateCustomer(dto.productCode, dto.customerId);
  }

  @Post('pay')
  payBill(
    @CurrentUser('id') userId: string,
    @Body() dto: PayBillDto,
  ) {
    return this.billsService.executeBillPayment({
      userId,
      productCode: dto.productCode,
      customerId: dto.customerId,
      amountKobo: dto.amountKobo,
      reference: dto.reference,
      validationReference: dto.validationReference,
      provider: dto.provider,
      billType: dto.billType,
    });
  }

  @Get('requery')
  requery(@Query('reference') reference: string) {
    return this.billsService.requeryBillPayment(reference);
  }
}
