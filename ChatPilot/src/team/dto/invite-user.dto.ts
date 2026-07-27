import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

export class InviteUserDto {
  @ApiProperty()
  @IsString()
  phone: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  full_name?: string

  @ApiProperty({ enum: ['manager', 'agent'] })
  @IsString()
  @IsIn(['manager', 'agent'])
  role: string
}
