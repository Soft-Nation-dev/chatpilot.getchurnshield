import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { PrismaModule } from '../prisma/prisma.module'
import { CompanyModule } from '../company/company.module'
import { SocialModule } from '../social/social.module'
import { BuyerFinderController } from './buyer-finder.controller'
import { BUYER_FINDER_QUEUE } from './buyer-finder.constants'
import { BuyerFinderProcessor } from './processors/buyer-finder.processor'
import { BuyerFinderAllocationService } from './services/buyer-finder-allocation.service'
import { BuyerFinderClassifierService } from './services/buyer-finder-classifier.service'
import { BuyerFinderConnectedSourceService } from './services/buyer-finder-connected-source.service'
import { BuyerFinderIngestionService } from './services/buyer-finder-ingestion.service'
import { BuyerFinderSchedulerService } from './services/buyer-finder-scheduler.service'
import { BuyerFinderService } from './services/buyer-finder.service'

@Module({
  imports: [
    PrismaModule,
    CompanyModule,
    SocialModule,
    BullModule.registerQueue({ name: BUYER_FINDER_QUEUE }),
    BullBoardModule.forFeature({
      name: BUYER_FINDER_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [BuyerFinderController],
  providers: [
    BuyerFinderService,
    BuyerFinderAllocationService,
    BuyerFinderClassifierService,
    BuyerFinderConnectedSourceService,
    BuyerFinderIngestionService,
    BuyerFinderSchedulerService,
    BuyerFinderProcessor,
  ],
  exports: [BuyerFinderService],
})
export class BuyerFinderModule {}
