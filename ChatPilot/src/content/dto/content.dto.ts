import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator'
import { CONTENT_KINDS } from '../constants/content-prompt'

export class GenerateContentDto {
  @ApiProperty({ enum: CONTENT_KINDS as unknown as string[] })
  @IsString()
  @IsIn(CONTENT_KINDS as unknown as string[])
  kind: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  property_id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  topic?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduled_at?: string

  @ApiPropertyOptional({ description: 'Comma-separated: facebook,instagram' })
  @IsOptional()
  @IsString()
  platforms?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auto_approve?: boolean
}

export class GenerateBatchDto {
  @ApiProperty({ description: 'How many posts to generate (1-14)' })
  @IsInt()
  @Min(1)
  @Max(14)
  count: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auto_approve?: boolean
}

export class UpdateContentPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hashtags?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image_urls?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platforms?: string

  @ApiPropertyOptional({ enum: ['draft', 'approved', 'scheduled'] })
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'approved', 'scheduled'])
  status?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduled_at?: string
}
