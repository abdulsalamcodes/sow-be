import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Unique('beneficiary_user_name_unique', ['userId', 'name'])
@Entity('beneficiaries')
export class Beneficiary extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 10, name: 'account_number' })
  accountNumber!: string;

  @Column({ type: 'varchar', length: 10, name: 'bank_code' })
  bankCode!: string;

  @Column({ type: 'varchar', length: 100, name: 'bank_name' })
  bankName!: string;

  @Column({ type: 'varchar', length: 255, name: 'account_name' })
  accountName!: string;
}
