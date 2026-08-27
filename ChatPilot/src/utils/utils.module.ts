import { forwardRef, Global, Module } from '@nestjs/common'
import { DatesHelper } from './services/dates.service'
import { CalComService } from './services/calcom.service'
import { CompanyModule } from 'src/company/company.module'
import { WhatsAppFormatter } from './services/whatsapp-formatter.helper'
import { WhatsBaileyService } from './services/whats-bailey.service'
import { PromptHelper } from './services/prompt.helper'
import { StorageService } from './services/storage.service'

@Global()
@Module({
  imports: [forwardRef(() => CompanyModule)],
  controllers: [],
  providers: [
    DatesHelper,
    CalComService,
    WhatsAppFormatter,
    WhatsBaileyService,
    PromptHelper,
    StorageService,
  ],
  exports: [
    DatesHelper,
    CalComService,
    WhatsAppFormatter,
    WhatsBaileyService,
    PromptHelper,
    StorageService,
  ],
})
export class UtilsModule {}
