import axios from 'axios'
import { CalComService } from './calcom.service'

jest.mock('axios')

describe('CalComService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>
  const dates = {
    convertFromZulu: jest.fn(() => 'September 26 at 10:00'),
  } as any
  const service = new CalComService(dates)

  beforeEach(() => jest.clearAllMocks())

  it('uses the current v2 slots route and parses its current response shape', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 'success',
        data: {
          '2026-09-26': [{ start: '2026-09-26T09:00:00.000Z' }],
        },
      },
    } as any)

    const result = await service.getAvailableAppointments(
      {
        cal_api_key: 'test-key',
        cal_booking_length: BigInt(30),
        cal_event_type_id: BigInt(123),
        cal_event_slug: null,
      } as any,
      '2026-09-26',
      '2026-09-26',
    )

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.cal.com/v2/slots',
      expect.objectContaining({
        params: {
          start: '2026-09-26',
          end: '2026-09-26',
          duration: '30',
          eventTypeId: '123',
        },
        headers: expect.objectContaining({
          'cal-api-version': '2024-09-04',
        }),
      }),
    )
    expect(result).toEqual({
      success: true,
      error: null,
      slots: {
        '2026-09-26': [
          {
            start: '2026-09-26T09:00:00.000Z',
            time: 'September 26 at 10:00',
          },
        ],
      },
    })
  })

  it('hands scheduling back safely when calendar credentials are absent', async () => {
    const result = await service.getAvailableAppointments(
      {
        id: 6,
        cal_api_key: null,
        cal_booking_length: null,
        cal_event_type_id: BigInt(0),
        cal_event_slug: null,
      } as any,
      '2026-10-17',
      '2026-10-17',
    )

    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      slots: {},
      error: 'Calendar booking is not configured for this company.',
    })
  })
})
