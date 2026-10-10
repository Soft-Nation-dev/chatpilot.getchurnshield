import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { CompanyAccessService } from 'src/company/company-access.service'
import { NotificationsService } from './notifications.service'

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  @Get()
  async list(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('take') take?: string,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.notifications.list(companyId, Number(take) || 30)
  }

  @Put('read-all')
  async markAllRead(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.notifications.markAllRead(companyId)
  }

  @Put(':notificationId/read')
  async markRead(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('notificationId', ParseIntPipe) notificationId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.notifications.markRead(companyId, notificationId)
  }
}
