import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosRequestConfig } from 'axios'
import { companies } from '@prisma/client'
import { Contact } from '../constants/types'
import { DatesHelper } from './dates.service'

export type CalendarAvailabilityResult = {
  success: boolean
  slots: Record<string, Array<{ start: string; time: string }>>
  error: string | null
}

@Injectable()
export class CalComService {
  private readonly logger = new Logger(CalComService.name)
  private readonly baseUrl = 'https://api.cal.com/v2'

  constructor(private readonly datesHelper: DatesHelper) {}

  async getAvailableAppointments(
    company: companies,
    startDate: string,
    endDate: string,
  ): Promise<CalendarAvailabilityResult> {
    const url = `${this.baseUrl}/slots`

    const params: Record<string, string | number> = {
      start: startDate,
      end: endDate,
    }
    if (company.cal_booking_length) {
      params.duration = company.cal_booking_length.toString()
    }
    if (company.cal_event_type_id) {
      params.eventTypeId = company.cal_event_type_id.toString()
    } else if (company.cal_event_slug) {
      params.eventTypeSlug = company.cal_event_slug
    }

    const headers = {
      Authorization: `Bearer ${company.cal_api_key}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-09-04',
    }

    const config: AxiosRequestConfig = { headers, params }

    try {
      const response = await axios.get(url, config)
      const slots = response.data?.data || {}
      const formatted: Record<
        string,
        Array<{ start: string; time: string }>
      > = {}
      for (const [date, times] of Object.entries(slots)) {
        formatted[date] = (times as any[])
          .map((slot: any) => slot?.start)
          .filter(Boolean)
          .map((start: string) => ({
            start,
            time: String(this.datesHelper.convertFromZulu(start)),
          }))
      }
      return { success: true, slots: formatted, error: null }
    } catch (error: any) {
      const status = error?.response?.status
      const detail = error?.response?.data?.error?.message
      this.logger.error(
        `Failed to fetch available slots${status ? ` (${status})` : ''}: ${
          detail || error?.message || 'unknown error'
        }`,
      )
      return {
        success: false,
        slots: {},
        error: detail || error?.message || 'calendar unavailable',
      }
    }
  }

  async bookAppointment(
    company: companies,
    date: string,
    name: string,
    email: string,
    phone: number,
  ): Promise<{
    success: boolean
    error: string | null
    date: string | null
    provider: string
    data: any
  }> {
    const url = `${this.baseUrl}/bookings`

    const headers = {
      Authorization: `Bearer ${company.cal_api_key}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2026-02-25',
    }

    const payload = {
      start: date,
      eventTypeId: company.cal_event_type_id,
      attendee: {
        name,
        email,
        timeZone:
          (company as any).timezone ||
          process.env.DEFAULT_TIMEZONE ||
          'Africa/Lagos',
        language: (company as any).locale || process.env.DEFAULT_LOCALE || 'en',
      },
      bookingFieldsResponses: {
        phone: `+${phone}`,
      },
    }

    try {
      const response = await axios.post(url, payload, { headers })
      return response.status === 201
        ? {
            success: true,
            error: null,
            date: response.data.data.start,
            provider: 'cal.com',
            data: response.data,
          }
        : {
            success: false,
            error: response.data.error,
            date: null,
            provider: 'cal.com',
            data: response.data,
          }
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'booking failed to unknown reason try again',
        date: null,
        provider: 'cal.com',
        data: null,
      }
    }
  }

  async cancelAppointment(
    company: companies,
    contact: Contact,
  ): Promise<{
    success: boolean
    error: string | null
    provider: string
    data: any
  }> {
    const url = `${this.baseUrl}/bookings/${contact.crm_appointment_id}/cancel`

    const headers = {
      Authorization: `Bearer ${company.cal_api_key}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-08-13',
    }

    try {
      const response = await axios.post(
        url,
        {
          cancellationReason: 'User requested cancellation',
          cancelSubsequentBookings: false,
        },
        { headers },
      )
      return response.status === 200
        ? {
            success: true,
            error: null,
            provider: 'cal.com',
            data: response.data,
          }
        : {
            success: false,
            error: response.data.error,
            provider: 'cal.com',
            data: response.data,
          }
    } catch (error: any) {
      return {
        success: false,
        error:
          error?.message ||
          'cancel appointment failed to unknown reason try again',
        provider: 'cal.com',
        data: null,
      }
    }
  }
}
