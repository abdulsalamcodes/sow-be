import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { User } from './user.entity.js';

@Entity('email_otps')
export class EmailOtp extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text', name: 'code_hash' })
  codeHash!: string;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'int', name: 'attempt_count', default: 0 })
  attemptCount!: number;

  @Column({ type: 'timestamp', name: 'last_sent_at' })
  lastSentAt!: Date;
}
