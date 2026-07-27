import { Module, forwardRef } from '@nestjs/common'
import { WebhookService } from './webhook.service'
import { WebhookController } from './webhook.controller'
import { ContactModule } from 'src/contact/contact.module'
import { CompanyModule } from 'src/company/company.module'
import { SocialModule } from 'src/social/social.module'

@Module({
  imports: [ContactModule, CompanyModule, forwardRef(() => SocialModule)],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
