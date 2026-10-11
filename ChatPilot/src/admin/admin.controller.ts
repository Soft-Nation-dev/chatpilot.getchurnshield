import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
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

  @Get('overview')
  overview() {
    return this.adminService.overview()
  }

  @ApiOperation({ summary: 'List all companies with usage and status' })
  @Get('companies')
  companies(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listCompanies({ search, status })
  }

  @Get('companies/:companyId')
  company(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.adminService.companyDetail(companyId)
  }

  @Patch('companies/:companyId')
  updateCompany(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: any,
  ) {
    return this.adminService.updateCompany(companyId, body || {}, req.ip)
  }

  @Get('users')
  users(@Query('search') search?: string, @Query('status') status?: string) {
    return this.adminService.listUsers({ search, status })
  }

  @Patch('users/:userId')
  updateUser(
    @Request() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: any,
  ) {
    return this.adminService.updateUser(userId, body || {}, req.ip)
  }

  @Post('users/:userId/revoke-sessions')
  revokeUserSessions(
    @Request() req: any,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.adminService.revokeUserSessions(userId, req.ip)
  }

  @Get('audit')
  audit(@Query('take') take?: string) {
    return this.adminService.auditLog(Number(take) || 100)
  }

  @Put('companies/:companyId/limits')
  setLimits(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: { monthly_lead_quota?: number; daily_lead_limit?: number },
  ) {
    return this.adminService.setLimits(companyId, body || {})
  }

  @Post('companies/:companyId/assign')
  assign(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: { count?: number },
  ) {
    return this.adminService.assign(companyId, Number(body?.count) || 1)
  }

  @Get('pool')
  pool() {
    return this.adminService.poolStats()
  }

  @Post('pool/harvest')
  harvest(@Body() body: { count?: number }) {
    return this.adminService.harvestPool(Number(body?.count) || 25)
  }
}
