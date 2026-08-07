import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { CompanyAccessService } from 'src/company/company-access.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { LearningService } from './services/learning.service'

@ApiTags('Learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies/:companyId/learning')
export class LearningController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly learningService: LearningService,
  ) {}

  @ApiOperation({ summary: 'What the AI has learned so far' })
  @Get()
  async list(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.prisma.learned_guidelines.findMany({
      where: { company_id: companyId },
      orderBy: { id: 'desc' },
      take: 20,
    })
  }

  @ApiOperation({ summary: 'Run the learning analysis now' })
  @Roles('owner', 'manager')
  @Post('run')
  async run(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    const conversation =
      await this.learningService.learnFromConversations(companyId)
    const content = await this.learningService.learnFromContent(companyId)
    return { conversation_updated: conversation, content_updated: content }
  }

  @ApiOperation({ summary: 'Turn a learned guideline set off' })
  @Roles('owner')
  @Post(':guidelineId/disable')
  async disable(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('guidelineId', ParseIntPipe) guidelineId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    await this.prisma.learned_guidelines.updateMany({
      where: { id: guidelineId, company_id: companyId },
      data: { is_active: false },
    })
    return { disabled: true }
  }
}
