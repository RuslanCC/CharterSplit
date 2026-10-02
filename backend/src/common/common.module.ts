import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { ChatMembershipService } from './chat-membership.service';

@Global()
@Module({
  providers: [AccessService, ChatMembershipService],
  exports: [AccessService, ChatMembershipService],
})
export class CommonModule {}
