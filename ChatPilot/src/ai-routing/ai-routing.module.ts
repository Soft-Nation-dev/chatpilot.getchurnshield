import { Global, Module } from '@nestjs/common'
import { PrismaModule } from 'src/prisma/prisma.module'
import { AiRoutingService } from './ai-routing.service'

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AiRoutingService],
  exports: [AiRoutingService],
})
export class AiRoutingModule {}
