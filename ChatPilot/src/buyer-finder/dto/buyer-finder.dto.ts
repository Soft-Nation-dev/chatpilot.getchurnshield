import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { BUYER_FINDER_ALLOWED_STATES } from '../buyer-finder.constants'

export class UpdateBuyerFinderSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsBoolean()
  shadow_mode?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsIn(BUYER_FINDER_ALLOWED_STATES, { each: true })
  target_states?: string[]

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  exclusivity_limit?: number

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(10)
  min_intent_score?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  daily_outreach_limit?: number
}

export class BuyerFinderActionDto {
  @IsIn([
    'profile_opened',
    'script_copied',
    'whatsapp_opened',
    'contacted',
    'dismissed',
    'do_not_contact',
  ])
  action: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  script?: string
}

export class BuyerFinderFeedQueryDto {
  @IsOptional()
  @IsIn(['all', 'whatsapp', 'instagram', 'facebook'])
  channel?: string

  @IsOptional()
  @IsIn(['all', 'shadow', 'allocated', 'contacted', 'dismissed', 'suppressed'])
  status?: string

  @IsOptional()
  @IsString()
  limit?: string
}
