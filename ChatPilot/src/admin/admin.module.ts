import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { LeadsModule } from '../leads/leads.module'
import { BullModule } from '@nestjs/bullmq'
import { CompanyModule } from '../company/company.module'
import { ContentModule } from '../content/content.module'
import { BackgroundQueue } from '../utils/constants/background.constants'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [
    PrismaModule,
    LeadsModule,
    CompanyModule,
    ContentModule,
    BullModule.registerQueue({ name: BackgroundQueue.CONTENT }),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
