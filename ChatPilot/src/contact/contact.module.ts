import { Module, forwardRef } from '@nestjs/common'
import { ContactService } from './contact.service'
import { ContactRedactionService } from './contact-redaction.service'
import { PrismaModule } from 'src/prisma/prisma.module'
import { UtilsModule } from 'src/utils/utils.module'
import { ChatLifecycleService } from './chat-lifecycle.service'
import { IntentTriageService } from './intent-triage.service'

@Module({
  imports: [PrismaModule, forwardRef(() => UtilsModule)],
  providers: [ContactService, ContactRedactionService, ChatLifecycleService, IntentTriageService],
  exports: [ContactService, ContactRedactionService, ChatLifecycleService, IntentTriageService],
})
export class ContactModule {}
