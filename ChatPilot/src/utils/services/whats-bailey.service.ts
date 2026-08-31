import {
  forwardRef,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import axios, { AxiosError } from 'axios'
import { ConfigsService } from 'src/config'
import { Company, Contact } from '../constants/types'
import * as QRCode from 'qrcode'
import { CompanyService } from 'src/company/company.service'

@Injectable()
export class WhatsBaileyService {
  private readonly logger = new Logger(WhatsBaileyService.name)
  constructor(
    private readonly config: ConfigsService,
    @Inject(forwardRef(() => CompanyService))
    private readonly companyService: CompanyService,
  ) {}

  private get serverUrl(): string {
    try {
      return this.config.wbBaseUrl.replace(/\/+$/, '')
    } catch {
      throw new ServiceUnavailableException(
        'WhatsApp connection service is not configured. Set WB_BASE_URL and deploy the WB gateway.',
      )
    }
  }

  private unavailable(operation: string, error: unknown): never {
    if (error instanceof HttpException) throw error

    const axiosError = error as AxiosError<any>
    const upstreamStatus = axiosError.response?.status
    const upstreamMessage =
      axiosError.response?.data?.message || axiosError.response?.data?.error

    this.logger.error(`WhatsApp gateway ${operation} failed`, {
      status: upstreamStatus,
      error: axiosError.message,
      upstreamMessage,
    })

    throw new ServiceUnavailableException(
      upstreamMessage ||
        'WhatsApp connection service is unavailable. Please contact support or try again after the gateway is deployed.',
    )
  }

  async sendMessage(
    company: Company,
    phone: number,
    message: string,
    imageUrl?: string,
    videoUrl?: string,
    isFromLid: boolean = false,
  ): Promise<string | null> {
    const url = `${this.serverUrl}/api/v1/whatsapp/${company.session_id}/send-message`

    const config = {
      headers: { 'Content-Type': 'application/json' },
      timeout: 50000,
    }

    const requestData: any = imageUrl
      ? {
          number: `${phone}`,
          text: message,
          url: imageUrl,
          type: 'media',
          isFromLid,
        }
      : {
          number: `${phone}`,
          text: message,
          type: 'text',
          isFromLid,
        }

    this.logger.log('URL:', url)
    this.logger.log('Sending Bailey message:', requestData)

    try {
      const response = await axios.post(url, requestData, config)
      if (response.status !== 201) {
        const errorMessage = `Error sending message: ${response.status} ${JSON.stringify(response.data)} `
        this.logger.error(errorMessage)
        return null
      }

      return response.data?.result?.wb_id ?? null
    } catch (error) {
      let errorMessage = 'Unknown error occurred'

      if (error.response) {
        errorMessage = `HTTP Error ${error.response.status}: ${JSON.stringify(error.response.data)}`
      } else if (error.request) {
        errorMessage = `Request failed: ${error.message}`
      } else {
        errorMessage = `Error: ${error.message}`
      }

      this.logger.error('Error sending WhatsApp message:', errorMessage)
      return null
    }
  }

  async getLid(company: Company, phone: string): Promise<bigint | null> {
    try {
      if (!company.session_id) {
        return null
      }
      const url = `${this.serverUrl}/api/v1/whatsapp/${company.session_id}/is-on-whatsapp-with-lid`
      const response = await axios.post(url, { number: phone }, { timeout: 15000 })
      if (response.status === 201 && response.data?.length > 0) {
        const lid: string | null = response.data[0]?.lid ?? null
        if (lid) {
          const lidNumber = lid.split('@')[0]
          return BigInt(lidNumber)
        }
      }
      return null
    } catch (error) {
      this.logger.warn('Failed to get LID for phone:', phone)
      return null
    }
  }

  async getSessionStatus(company: Company): Promise<{
    success: boolean
    state?: string
    message?: string
    error?: string
  }> {
    try {
      if (!company.session_id) {
        this.logger.error('company session_id is not defined', {
          companyId: company.id,
          phone: company.phone,
          session_id: company.session_id,
          error: 'company session_id is not defined',
        })
        return { success: false, message: 'company session_id is not defined' }
      }
      const url = `${this.serverUrl}/api/v1/whatsapp/sessions/${company.session_id}/status`
      this.logger.log('URL:', url)
      const response = await axios.get(url, { timeout: 15000 })

      if (response.status !== 200) {
        this.logger.error('error while fetching bailey session status', {
          companyId: company.id,
          phone: company.phone,
          session_id: company.session_id,
          error: `Error starting session: ${response?.status} res.data: ${JSON.stringify(response?.data)} `,
        })
        return {
          success: false,
          error: 'error during WhatsBailey status api call',
        }
      }
      const isActive = response.data.status.isActive === true
      const state = isActive ? 'CONNECTED' : 'DISCONNECTED'
      return {
        success: isActive,
        state,
        message: response.data.status?.message || `Session ${state}`,
      }
    } catch (e) {
      this.logger.error('error while fetching WhatsBailey session status', {
        companyId: company.id,
        phone: company.phone,
        session_id: company.session_id,
        error: e?.message || 'Unknown error',
      })
      return {
        success: false,
        state: 'UNAVAILABLE',
        message: 'WhatsApp connection service is unavailable',
        error: 'gateway_unavailable',
      }
    }
  }

  async getSessionQrCode(
    res,
    company: Company,
  ): Promise<{
    success: boolean
    qr?: string
    error?: string
  }> {
    const url = `${this.serverUrl}/api/v1/whatsapp/sessions/qrcode/${company.session_id}`

    try {
      const response = await axios.get(url, { timeout: 15000 })
      if (response.status !== 200 || !response.data.success) {
        throw new ServiceUnavailableException(
          response.data?.message || 'WhatsApp QR code is not ready yet',
        )
      }
      if (!response.data.qr) {
        throw new ServiceUnavailableException(
          response.data?.message || 'WhatsApp QR code is not ready yet',
        )
      }

      const qrCodeImage = await QRCode.toBuffer(response.data.qr)

      res.setHeader('Content-Type', 'image/png')

      return res.send(qrCodeImage)
    } catch (error) {
      return this.unavailable('QR request', error)
    }
  }
  async startSession(
    company: Company,
    usePairingCode?: boolean,
    phoneNumber?: string,
  ): Promise<{
    success: boolean
    message?: string
    pairingCode?: string
    error?: string
  }> {
    const url = `${this.serverUrl}/api/v1/whatsapp/connect`

    const body: any = { id: `${company.id}` }
    if (usePairingCode) {
      body.usePairingCode = true
      body.phoneNumber = phoneNumber
    }

    try {
      const response = await axios.post(url, body, { timeout: 75000 })

      if (response.status !== 201 || !response.data?.success) {
        const message = response.data?.message || 'WhatsApp session could not be started'
        this.logger.error(message)
        return { success: false, message }
      }

      this.logger.log('Session started successfully:', response.data)
      return response.data
    } catch (error) {
      return this.unavailable('session start', error)
    }
  }

  async getPairingCode(company: Company): Promise<{
    success: boolean
    pairingCode?: string
    message?: string
  }> {
    try {
      const url = `${this.serverUrl}/api/v1/whatsapp/sessions/pairingcode/${company.session_id}`
      const response = await axios.get(url, { timeout: 15000 })
      return response.data
    } catch (error) {
      return this.unavailable('pairing-code request', error)
    }
  }

  async mockTypingState(contact: Contact): Promise<{
    success: boolean
    result?: string
    error?: string
  }> {
    const company: Company = contact.companies

    const url = `${this.serverUrl}/api/v1/whatsapp/chat/mock-typing`

    const contactNumber = contact.phone ? `${contact.phone}` : `${contact.lid}`
    const body = {
      number: contactNumber,
      session: company.session_id,
    }
    const response = await axios.post(url, body)

    if (response.status !== 201) {
      const errorMessage = `Error while setting typing state : ${response.status} ${response.data}`
      this.logger.error(errorMessage)
      return response.data
    }

    return response.data
  }

  async removeSession(company: Company): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    try {
      const url = `${this.serverUrl}/api/v1/whatsapp/sessions/${company.session_id}/remove`
      this.logger.log('Removing session, URL:', url)
      const response = await axios.get(url)

      if (response.status !== 200) {
        const errorMessage = `Error removing session: ${response.status} ${JSON.stringify(response.data)}`
        this.logger.error(errorMessage)
        return { success: false, message: errorMessage, error: errorMessage }
      }

      return { success: response.data.success, message: response.data.message }
    } catch (error) {
      const errorMessage = `Error removing session: ${error?.message || 'Unknown error'}`
      this.logger.error(errorMessage)
      return { success: false, message: errorMessage, error: errorMessage }
    }
  }

  // Set Typing
  async clearTypingState(contact: Contact): Promise<{
    success: boolean
    result?: string
    error?: string
  }> {
    const company: Company = contact.companies
    const url = `${this.serverUrl}/api/v1/whatsapp/chat/clear-mock-typing`

    const contactNumber = contact.phone ? `${contact.phone}` : `${contact.lid}`
    const body = {
      number: contactNumber,
      session: company.session_id,
    }

    const response = await axios.post(url, body)

    if (response.status !== 201) {
      const errorMessage = `Error while clearing typing state : ${response.status} ${response.data}`
      this.logger.error(errorMessage)
      return response.data
    }
    return response.data
  }
}
