import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'

export class UpdateRoleDto {
  @ApiProperty({ enum: ['owner', 'manager', 'agent'] })
  @IsString()
  @IsIn(['owner', 'manager', 'agent'])
  role: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  can_view_contact_phone?: boolean
}
