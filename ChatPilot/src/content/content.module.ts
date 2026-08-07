import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { PrismaModule } from 'src/prisma/prisma.module'
import { CompanyModule } from 'src/company/company.module'
import { SocialModule } from 'src/social/social.module'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { ContentController } from './content.controller'
import { PropertyService } from './services/property.service'
import { ContentGeneratorService } from './services/content-generator.service'
import { ContentPublisherService } from './services/content-publisher.service'
import { ContentSchedulerService } from './services/content-scheduler.service'
import { ContentProcessor } from './processors/content.processor'

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => CompanyModule),
    forwardRef(() => SocialModule),
    BullModule.registerQueue({ name: BackgroundQueue.CONTENT }),
    BullBoardModule.forFeature({
      name: BackgroundQueue.CONTENT,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [ContentController],
  providers: [
    PropertyService,
    ContentGeneratorService,
    ContentPublisherService,
    ContentSchedulerService,
    ContentProcessor,
  ],
  exports: [ContentGeneratorService, ContentPublisherService],
})
export class ContentModule {}
