import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { PrismaModule } from 'src/prisma/prisma.module'
import { CompanyModule } from 'src/company/company.module'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { SocialController } from './social.controller'
import { SocialOauthController } from './social-oauth.controller'
import { MetaWebhookService } from './services/meta-webhook.service'
import { GraphApiService } from './services/graph-api.service'
import { SocialAccountService } from './services/social-account.service'
import { IntentClassifierService } from './services/intent-classifier.service'
import { WaLinkService } from './services/wa-link.service'
import { SocialOauthService } from './services/social-oauth.service'
import { SocialReplyService } from './services/social-reply.service'
import { SocialAttributionService } from './services/social-attribution.service'
import { SocialInboundProcessor } from './processors/social-inbound.processor'

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => CompanyModule),
    BullModule.registerQueue({ name: BackgroundQueue.SOCIAL }),
    BullBoardModule.forFeature({
      name: BackgroundQueue.SOCIAL,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [SocialController, SocialOauthController],
  providers: [
    MetaWebhookService,
    GraphApiService,
    SocialAccountService,
    IntentClassifierService,
    WaLinkService,
    SocialOauthService,
    SocialReplyService,
    SocialAttributionService,
    SocialInboundProcessor,
  ],
  exports: [SocialAttributionService],
})
export class SocialModule {}
