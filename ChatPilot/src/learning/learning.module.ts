import { Global, Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { PrismaModule } from 'src/prisma/prisma.module'
import { CompanyModule } from 'src/company/company.module'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { LearningController } from './learning.controller'
import { LearningService } from './services/learning.service'
import { LearningSchedulerService } from './services/learning-scheduler.service'
import { LearningProcessor } from './processors/learning.processor'

@Global()
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => CompanyModule),
    BullModule.registerQueue({ name: BackgroundQueue.LEARNING }),
    BullBoardModule.forFeature({
      name: BackgroundQueue.LEARNING,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [LearningController],
  providers: [LearningService, LearningSchedulerService, LearningProcessor],
  exports: [LearningService],
})
export class LearningModule {}
