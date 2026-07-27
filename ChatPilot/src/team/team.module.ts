import { Module, forwardRef } from '@nestjs/common'
import { PrismaModule } from 'src/prisma/prisma.module'
import { CompanyModule } from 'src/company/company.module'
import { TeamController } from './team.controller'
import { TeamService } from './team.service'

@Module({
  imports: [PrismaModule, forwardRef(() => CompanyModule)],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
