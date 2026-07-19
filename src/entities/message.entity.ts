import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Conversation } from './conversation.entity';

export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  TOOL = 'TOOL',
}

@Entity('messages')
export class Message extends BaseEntity {
  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: MessageRole,
    enumName: 'message_role_enum',
  })
  role: MessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'tool_called',
    nullable: true,
  })
  toolCalled: string | null;
}
