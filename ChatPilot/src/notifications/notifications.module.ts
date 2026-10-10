import { Global, Module } from '@nestjs/common'
import { CompanyModule } from 'src/company/company.module'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Global()
@Module({
  imports: [CompanyModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
