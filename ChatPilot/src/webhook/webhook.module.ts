import { Module, forwardRef } from '@nestjs/common'
import { WebhookService } from './webhook.service'
import { WebhookController } from './webhook.controller'
import { ContactModule } from 'src/contact/contact.module'
import { CompanyModule } from 'src/company/company.module'
import { SocialModule } from 'src/social/social.module'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { WebhookIngressService } from './webhook-ingress.service'
import { WebhookInboundProcessor } from './webhook-inbound.processor'

@Module({
  imports: [
    ContactModule,
    CompanyModule,
    forwardRef(() => SocialModule),
    BullModule.registerQueue({ name: BackgroundQueue.WHATSAPP_INBOUND }),
    BullBoardModule.forFeature({
      name: BackgroundQueue.WHATSAPP_INBOUND,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookIngressService, WebhookInboundProcessor],
})
export class WebhookModule {}
