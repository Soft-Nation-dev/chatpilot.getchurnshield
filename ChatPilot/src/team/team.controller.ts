import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard'
import { CompanyScopeGuard } from 'src/auth/guards/company-scope.guard'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { TeamService } from './team.service'
import { InviteUserDto } from './dto/invite-user.dto'
import { UpdateRoleDto } from './dto/update-role.dto'

@ApiTags('Team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
@Controller('companies/:companyId/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @ApiOperation({ summary: 'List team members' })
  @Roles('owner', 'manager')
  @Get()
  list(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.teamService.list(companyId)
  }

  @ApiOperation({ summary: 'Invite a sales rep to this company' })
  @Roles('owner', 'manager')
  @Post('invite')
  invite(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: InviteUserDto,
  ) {
    return this.teamService.invite(companyId, req.user.userId, dto)
  }

  @ApiOperation({ summary: 'Change a team member role' })
  @Roles('owner')
  @Patch(':userId/role')
  updateRole(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.teamService.updateRole(companyId, req.user.userId, userId, dto)
  }

  @ApiOperation({ summary: 'Revoke a team member access immediately' })
  @Roles('owner')
  @Post(':userId/revoke')
  revoke(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.teamService.revoke(companyId, req.user.userId, userId)
  }

  @ApiOperation({ summary: 'Restore a revoked team member' })
  @Roles('owner')
  @Post(':userId/restore')
  restore(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.teamService.restore(companyId, req.user.userId, userId)
  }
}
