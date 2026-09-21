import { Global, Module } from '@nestjs/common'
import { PrismaModule } from 'src/prisma/prisma.module'
import { AiRoutingService } from './ai-routing.service'
import { AiProviderAdapterService } from './ai-provider-adapter.service'

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AiProviderAdapterService, AiRoutingService],
  exports: [AiRoutingService],
})
export class AiRoutingModule {}
