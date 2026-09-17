import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
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

  @ApiPropertyOptional({ enum: ['draft', 'approved', 'scheduled', 'rejected'] })
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'approved', 'scheduled', 'rejected'])
  status?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduled_at?: string
}

export class UpdateContentAutomationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional({ minimum: 2, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(3)
  posts_per_day?: number

  @ApiPropertyOptional({
    type: [String],
    example: ['09:00', '18:00'],
    description: 'Local posting times in HH:mm format',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  posting_times?: string[]

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2, 3, 4, 5],
    description: 'ISO weekdays: Monday=1, Sunday=7',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  posting_days?: number[]

  @ApiPropertyOptional({ description: 'Comma-separated: facebook,instagram' })
  @IsOptional()
  @IsString()
  @IsIn(['facebook', 'instagram', 'facebook,instagram', 'instagram,facebook'])
  platforms?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  approval_required?: boolean

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  property_ratio?: number

  @ApiPropertyOptional({ minimum: 0, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  min_reuse_days?: number

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string
}
