import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

export class ConnectAccountDto {
  @ApiProperty({ enum: ['facebook', 'instagram'] })
  @IsString()
  @IsIn(['facebook', 'instagram'])
  platform: string

  @ApiProperty({ description: 'Page ID or Instagram Business Account ID' })
  @IsString()
  external_id: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page_id?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ig_user_id?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string

  @ApiProperty({ description: 'Long-lived Page access token' })
  @IsString()
  access_token: string
}
