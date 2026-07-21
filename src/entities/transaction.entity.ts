import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Wallet } from './wallet.entity';

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum TransactionCategory {
  FUNDING = 'FUNDING',
  TRANSFER = 'TRANSFER',
  BILL_PAYMENT = 'BILL_PAYMENT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('transactions')
export class Transaction extends BaseEntity {
  @Column({ type: 'uuid', name: 'wallet_id' })
  walletId!: string;

  @ManyToOne(() => Wallet, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @Column({ type: 'varchar', length: 255, unique: true })
  reference!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'monnify_reference',
    unique: true,
    nullable: true,
  })
  monnifyReference!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  fee!: number;

  @Column({
    type: 'enum',
    enum: TransactionType,
    enumName: 'transaction_type_enum',
  })
  type!: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionCategory,
    enumName: 'transaction_category_enum',
  })
  category!: TransactionCategory;

  @Column({ type: 'text', nullable: true })
  narration!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  counterparty!: string | null;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status_enum',
    default: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;
}
