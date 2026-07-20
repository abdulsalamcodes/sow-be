import { IsUUID } from 'class-validator';

export class IntentIdParam {
  @IsUUID()
  intentId: string;
}
