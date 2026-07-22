import { IsString, Length } from 'class-validator';

export class SubmitOtpDto {
  @IsString()
  @Length(6, 6)
  otp: string;
}
