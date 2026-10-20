import { forwardRef, Module } from '@nestjs/common'
import { CompanyService } from './company.service'
import { CompanyAccessService } from './company-access.service'
import { CompanyController } from './company.controller'
import { ContactModule } from 'src/contact/contact.module'
import { PrismaModule } from 'src/prisma/prisma.module'
import { UtilsModule } from 'src/utils/utils.module'
import { BullModule } from '@nestjs/bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => UtilsModule),
    forwardRef(() => ContactModule),
    BullModule.registerQueue({ name: BackgroundQueue.CONTENT }),
  ],
  controllers: [CompanyController],
  providers: [CompanyService, CompanyAccessService],
  exports: [CompanyService, CompanyAccessService],
})
export class CompanyModule {}
