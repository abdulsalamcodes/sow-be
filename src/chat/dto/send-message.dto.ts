import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @Length(1, 2000)
  message: string;
}
