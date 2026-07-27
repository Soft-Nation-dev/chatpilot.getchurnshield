import { forwardRef, Module } from '@nestjs/common'
import { CompanyService } from './company.service'
import { CompanyAccessService } from './company-access.service'
import { CompanyController } from './company.controller'
import { ContactModule } from 'src/contact/contact.module'
import { PrismaModule } from 'src/prisma/prisma.module'
import { UtilsModule } from 'src/utils/utils.module'

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => UtilsModule),
    forwardRef(() => ContactModule),
  ],
  controllers: [CompanyController],
  providers: [CompanyService, CompanyAccessService],
  exports: [CompanyService, CompanyAccessService],
})
export class CompanyModule {}
