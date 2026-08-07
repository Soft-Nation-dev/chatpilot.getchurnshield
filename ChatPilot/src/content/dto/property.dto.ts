import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

export class UpsertPropertyDto {
  @ApiProperty()
  @IsString()
  title: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  property_type?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string

  @ApiPropertyOptional({ description: 'Plain number, e.g. 25000000' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  price_max?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  size_sqm?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title_document?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payment_plan?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  features?: string

  @ApiPropertyOptional({ description: 'Comma-separated public image URLs' })
  @IsOptional()
  @IsString()
  image_urls?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  video_url?: string

  @ApiPropertyOptional({ enum: ['available', 'sold', 'hidden'] })
  @IsOptional()
  @IsString()
  status?: string
}
