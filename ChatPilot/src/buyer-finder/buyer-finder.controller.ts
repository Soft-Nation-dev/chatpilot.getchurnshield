import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CompanyAccessService } from '../company/company-access.service'
import {
  BuyerFinderActionDto,
  BuyerFinderFeedQueryDto,
  UpdateBuyerFinderSettingsDto,
} from './dto/buyer-finder.dto'
import { BuyerFinderService } from './services/buyer-finder.service'

@ApiTags('Buyer Finder')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:id/buyer-finder')
export class BuyerFinderController {
  constructor(
    private readonly buyerFinder: BuyerFinderService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  private async authorize(req: any, companyId: number) {
    await this.companyAccess.assertAccess(
      { userId: req.user.userId },
      companyId,
    )
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get Buyer Finder settings and safety mode' })
  async settings(
    @Request() req: any,
    @Param('id', ParseIntPipe) companyId: number,
  ) {
    await this.authorize(req, companyId)
    return this.buyerFinder.getSettings(companyId)
  }

  @Put('settings')
  @ApiOperation({
    summary: 'Update Buyer Finder targeting and safety settings',
  })
  async updateSettings(
    @Request() req: any,
    @Param('id', ParseIntPipe) companyId: number,
    @Body() body: UpdateBuyerFinderSettingsDto,
  ) {
    await this.authorize(req, companyId)
    return this.buyerFinder.updateSettings(companyId, body)
  }

  @Get('feed')
  @ApiOperation({
    summary: 'List Buyer Finder candidates allocated to this company',
  })
  async feed(
    @Request() req: any,
    @Param('id', ParseIntPipe) companyId: number,
    @Query() query: BuyerFinderFeedQueryDto,
  ) {
    await this.authorize(req, companyId)
    return this.buyerFinder.feed(companyId, {
      channel: query.channel,
      status: query.status,
      limit: Math.max(1, Math.min(100, Number(query.limit) || 50)),
    })
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get today’s Buyer Finder outreach usage' })
  async usage(
    @Request() req: any,
    @Param('id', ParseIntPipe) companyId: number,
  ) {
    await this.authorize(req, companyId)
    return this.buyerFinder.usage(companyId)
  }

  @Post('allocations/:allocationId/actions')
  @ApiOperation({ summary: 'Record a safe Buyer Finder outreach action' })
  async action(
    @Request() req: any,
    @Param('id', ParseIntPipe) companyId: number,
    @Param('allocationId', ParseIntPipe) allocationId: number,
    @Body() body: BuyerFinderActionDto,
  ) {
    await this.authorize(req, companyId)
    return this.buyerFinder.recordAction(companyId, allocationId, body)
  }
}
