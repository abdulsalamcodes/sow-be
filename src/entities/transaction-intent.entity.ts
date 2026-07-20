import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity.js';

export enum IntentType {
  TRANSFER = 'TRANSFER',
  BILL_PAYMENT = 'BILL_PAYMENT',
}

export enum IntentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface TransferIntentPayload {
  destinationAccountNumber: string;
  destinationBankCode: string;
  destinationBankName: string;
  accountName: string;
  narration: string;
}

@Entity('transaction_intents')
export class TransactionIntent extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: IntentType,
    enumName: 'intent_type_enum',
  })
  type!: IntentType;

  @Column({
    type: 'enum',
    enum: IntentStatus,
    enumName: 'intent_status_enum',
    default: IntentStatus.PENDING,
  })
  status!: IntentStatus;

  @Column({ type: 'bigint', name: 'amount_kobo' })
  amountKobo!: string;

  @Column({ type: 'jsonb' })
  payload!: TransferIntentPayload;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'varchar', length: 64, name: 'idempotency_key', unique: true })
  idempotencyKey!: string;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason!: string | null;
}
