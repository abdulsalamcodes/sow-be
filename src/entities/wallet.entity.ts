import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum WalletStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

@Entity('wallets')
export class Wallet extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 100, name: 'wallet_name' })
  walletName!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'account_reference',
    unique: true,
    nullable: true,
  })
  accountReference!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'account_number',
    unique: true,
    nullable: true,
  })
  accountNumber!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'bank_name' })
  bankName!: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  @Column({ type: 'bigint', default: '0' })
  balance!: string;

  @Column({
    type: 'enum',
    enum: WalletStatus,
    enumName: 'wallet_status_enum',
    default: WalletStatus.ACTIVE,
  })
  status!: WalletStatus;
}
