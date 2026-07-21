import { Global, Module } from '@nestjs/common';
import { MonnifyHttpClient } from './monnify-http-client.js';

@Global()
@Module({
  providers: [MonnifyHttpClient],
  exports: [MonnifyHttpClient],
})
export class MonnifyModule {}
