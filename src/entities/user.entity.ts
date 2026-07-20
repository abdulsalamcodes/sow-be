import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

export enum KycStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', name: 'password_hash', nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'text', name: 'refresh_token_hash', nullable: true })
  refreshTokenHash!: string | null;

  @Column({ type: 'text', name: 'profile_image', nullable: true })
  profileImage!: string | null;

  @Column({
    type: 'enum',
    enum: KycStatus,
    enumName: 'kyc_status_enum',
    default: KycStatus.PENDING,
    name: 'kyc_status',
  })
  kycStatus!: KycStatus;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
