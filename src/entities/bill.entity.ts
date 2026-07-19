import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Transaction } from './transaction.entity';

export enum BillType {
  AIRTIME = 'AIRTIME',
  DATA = 'DATA',
  ELECTRICITY = 'ELECTRICITY',
  TV = 'TV',
  INTERNET = 'INTERNET',
}

export enum BillStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('bills')
export class Bill extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  provider: string;

  @Column({
    type: 'enum',
    enum: BillType,
    enumName: 'bill_type_enum',
    name: 'bill_type',
  })
  billType: BillType;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'customer_reference',
    nullable: true,
  })
  customerReference: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'uuid', name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @Column({
    type: 'enum',
    enum: BillStatus,
    enumName: 'bill_status_enum',
    default: BillStatus.PENDING,
  })
  status: BillStatus;

  @Column({
    type: 'timestamp',
    name: 'paid_at',
    default: () => 'NOW()',
  })
  paidAt: Date;
}
