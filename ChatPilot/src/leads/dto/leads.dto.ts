import { ApiProperty } from '@nestjs/swagger'

export class RequestLeadsDto {
  @ApiProperty({ example: 10 })
  count: number
}

export class SendLeadMessageDto {
  @ApiProperty({ example: 'Hello, are you still looking for land in Lekki?' })
  text: string
}

export class BotToggleDto {
  @ApiProperty({ example: true })
  is_bot_activated: boolean
}
