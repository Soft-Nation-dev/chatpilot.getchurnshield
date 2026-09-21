import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AdminSecretGuard } from './admin-secret.guard'
import { AdminService } from './admin.service'

@ApiTags('Admin')
@UseGuards(AdminSecretGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: 'List all companies with usage' })
  @Get('companies')
  async companies() {
    return this.adminService.listCompanies()
  }

  @ApiOperation({ summary: 'Set a company monthly quota and daily limit' })
  @Put('companies/:companyId/limits')
  async setLimits(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: { monthly_lead_quota?: number; daily_lead_limit?: number },
  ) {
    return this.adminService.setLimits(companyId, body || {})
  }

  @ApiOperation({ summary: 'Assign leads to a company' })
  @Post('companies/:companyId/assign')
  async assign(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: { count?: number },
  ) {
    return this.adminService.assign(companyId, Number(body?.count) || 1)
  }

  @ApiOperation({ summary: 'Shared pool size' })
  @Get('pool')
  async pool() {
    return this.adminService.poolStats()
  }

  @ApiOperation({ summary: 'Harvest leads into the shared pool' })
  @Post('pool/harvest')
  async harvest(@Body() body: { count?: number }) {
    return this.adminService.harvestPool(Number(body?.count) || 25)
  }
}
