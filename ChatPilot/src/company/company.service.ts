import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import { companies } from '@prisma/client'
import { Company } from 'src/utils/constants/types'
import { WhatsBaileyService } from 'src/utils/services/whats-bailey.service'
import { StorageService } from 'src/utils/services/storage.service'
import { AiRoutingService } from 'src/ai-routing/ai-routing.service'
import { AiWorkload } from 'src/ai-routing/ai-routing.types'
import { decryptMessagesInPlace } from 'src/common/crypto/message-crypto'
import {
  decryptContactFields,
  decryptContactsInPlace,
} from 'src/common/crypto/contact-crypto'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'

const OTP_TTL_MS = 60 * 1000

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WhatsBaileyService))
    private readonly whatsBaileyService: WhatsBaileyService,
    private readonly storageService: StorageService,
    private readonly aiRouting: AiRoutingService,
    @InjectQueue(BackgroundQueue.CONTENT)
    private readonly contentQueue: Queue,
  ) {}

  async findByPhone(targetPhone: number | string | bigint) {
    const digits = String(targetPhone).replace(/\D/g, '')
    if (!digits) return null

    const candidates = new Set<string>([digits])
    if (digits.startsWith('234') && digits.length === 13) {
      candidates.add(digits.slice(3))
      candidates.add(`0${digits.slice(3)}`)
    } else if (digits.startsWith('0') && digits.length === 11) {
      candidates.add(digits.slice(1))
      candidates.add(`234${digits.slice(1)}`)
    } else if (digits.length === 10) {
      candidates.add(`0${digits}`)
      candidates.add(`234${digits}`)
    }

    return await this.prisma.companies.findFirst({
      where: {
        OR: Array.from(candidates).map(phone => ({ phone: BigInt(phone) })),
      },
    })
  }

  async findBySessionId(sessionId: string) {
    return await this.prisma.companies.findFirst({
      where: { session_id: sessionId },
    })
  }

  async findById(id: number): Promise<Company | null> {
    return (await this.prisma.companies.findFirst({
      where: { id: Number(id) },
    })) as Company
  }

  async createCompany(createCompanyDto: CreateCompanyDto) {
    return await this.prisma.companies.create({
      data: {
        ...createCompanyDto,
      },
    })
  }

  async createSession(
    companyId: number,
    usePairingCode?: boolean,
    phoneNumber?: string,
  ) {
    const company = await this.findById(companyId)
    if (!company) throw new UnprocessableEntityException('company not found')

    if (usePairingCode && !phoneNumber) {
      throw new UnprocessableEntityException(
        'Phone number is required when using pairing code',
      )
    }

    if (usePairingCode) {
      phoneNumber = phoneNumber!.replace(/\D/g, '')
      if (phoneNumber.length < 8 || phoneNumber.length > 15) {
        throw new UnprocessableEntityException(
          'Enter the WhatsApp number with country code, using 8 to 15 digits and no leading +',
        )
      }
    }

    // If session already exists, check if truly active
    if (company.session_id) {
      const sessionStatus =
        await this.whatsBaileyService.getSessionStatus(company)
      if (sessionStatus.success) {
        throw new UnprocessableEntityException(sessionStatus.message)
      }
      if (sessionStatus.error === 'gateway_unavailable') {
        throw new ServiceUnavailableException(sessionStatus.message)
      }
      // Remove stale session so fresh QR is generated
      try {
        await this.whatsBaileyService.removeSession(company)
      } catch {
        /* ignore */
      }
      await this.updateCompany(company.id, {
        session_id: null,
        whatsapp_connection_status: false,
      } as any)
    }

    const session = await this.whatsBaileyService.startSession(
      company,
      usePairingCode,
      phoneNumber,
    )
    this.logger.log(`${session.success}`, 'company service')
    if (!session.success) {
      throw new UnprocessableEntityException(session.message)
    }

    await this.updateCompany(company.id, {
      session_id: companyId.toString(),
    })

    const result: any = {
      success: true,
      message: 'Session initiated successfully',
    }
    if (session.pairingCode) {
      result.pairingCode = session.pairingCode
    }
    return result
  }

  async getPairingCode(companyId: number) {
    const company = await this.findById(companyId)
    if (!company) throw new UnprocessableEntityException('company not found')
    if (!company.session_id) {
      throw new UnprocessableEntityException('no active session found')
    }
    return await this.whatsBaileyService.getPairingCode(company)
  }

  async updateCompany(
    companyId: number,
    updateCompanyDto: Partial<companies>,
  ): Promise<Company> {
    return (await this.prisma.companies.update({
      where: { id: companyId },
      data: updateCompanyDto as any,
    })) as Company
  }

  async setBotActivation(
    companyId: number,
    isActive: boolean,
  ): Promise<Company> {
    if (!isActive) {
      return this.updateCompany(companyId, { is_bot_activated: false } as any)
    }

    const [company] = await this.prisma.$transaction([
      this.prisma.companies.update({
        where: { id: companyId },
        data: { is_bot_activated: true },
      }),
      this.prisma.contacts.updateMany({
        where: { company_id: companyId },
        data: {
          is_bot_activated: true,
          is_replies_activated: true,
        },
      }),
      this.prisma.leads.updateMany({
        where: { company_id: companyId },
        data: { is_bot_activated: true },
      }),
    ])

    return company as Company
  }
  async getSessionQrCode(res, companyId: number) {
    const company = await this.findById(companyId)
    if (!company) throw new UnprocessableEntityException('company not found')
    if (!company.session_id) {
      res.setHeader('Content-Type', 'application/json')
      return res.send({
        statusCode: 200,
        data: null,
        message: 'No active session. Please create a session first.',
      })
    }
    return await this.whatsBaileyService.getSessionQrCode(res, company)
  }
  async getSessionStatus(companyId: number) {
    const company = await this.findById(companyId)
    if (!company) throw new UnprocessableEntityException('company not found')
    if (!company.session_id) {
      return {
        success: false,
        state: 'DISCONNECTED',
        message: 'No active session',
      }
    }
    return await this.whatsBaileyService.getSessionStatus(company)
  }

  async syncAllSessionStatus() {
    const companies = await this.prisma.companies.findMany({
      where: {
        session_id: { not: null },
      },
      orderBy: {
        id: 'asc',
      },
    })

    for (const company of companies) {
      const sessionResult = await this.whatsBaileyService.getSessionStatus(
        company as Company,
      )
      const status = sessionResult.state === 'CONNECTED'

      company.whatsapp_connection_status = (
        await this.updateCompany(company.id, {
          whatsapp_connection_status: status,
        })
      ).whatsapp_connection_status

      this.logger.log(
        `Connection status for companyId:${company.id} session:${company.session_id} status:${company.whatsapp_connection_status}`,
      )
    }
    return companies.map(company => ({
      id: company.id,
      whatsapp_connection_status: company.whatsapp_connection_status,
      session_id: company.session_id,
      phone: company.phone,
    }))
  }

  async removeSession(companyId: number) {
    const company = await this.findById(companyId)
    if (!company) throw new UnprocessableEntityException('company not found')
    if (!company.session_id) {
      return { success: true, message: 'No active session to remove' }
    }

    const result = await this.whatsBaileyService.removeSession(company)

    if (result.success) {
      await this.updateCompany(companyId, {
        session_id: null,
        whatsapp_connection_status: false,
      } as any)
    }

    return result
  }

  async userOwnsCompany(userId: number, companyId: number): Promise<boolean> {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, company_id: companyId },
      select: { id: true },
    })
    return !!user
  }

  async updateBusinessDetails(companyId: number, details: Record<string, any>) {
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { business_details: true },
    })
    if (!company) throw new UnprocessableEntityException('Company not found')

    const existing =
      company.business_details && typeof company.business_details === 'object'
        ? (company.business_details as Record<string, any>)
        : {}

    return await this.prisma.companies.update({
      where: { id: companyId },
      data: { business_details: { ...existing, ...details } },
    })
  }

  async generatePrompt(companyId: number) {
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      include: { assistant_instructions: true },
    })

    if (!company) throw new UnprocessableEntityException('Company not found')

    const details = company.business_details as Record<string, any> | null
    if (!details?.description) {
      throw new UnprocessableEntityException(
        'Please save business details first',
      )
    }

    const { text: generatedPrompt } = await this.aiRouting.generate({
      workload: AiWorkload.Prompt,
      companyId,
      prompt: `You are an expert at creating WhatsApp business chatbot system prompts. Based on the following business description, generate a comprehensive system prompt for a WhatsApp AI assistant. The prompt should define the bot's personality, knowledge, and behavior.

Business Description:
${details.description}

Generate ONLY the system prompt text, no explanations.`,
      maxOutputTokens: 1600,
    })

    if (company.assistant_id) {
      await this.prisma.assistant_instructions.update({
        where: { id: company.assistant_id },
        data: { system_prompt: generatedPrompt },
      })
    } else {
      const instructions = await this.prisma.assistant_instructions.create({
        data: { system_prompt: generatedPrompt },
      })
      await this.prisma.companies.update({
        where: { id: companyId },
        data: { assistant_id: instructions.id },
      })
    }

    return { success: true }
  }

  async getDashboardStats(companyId: number) {
    const [contactsCount, messagesCount, botMessagesCount, company] =
      await Promise.all([
        this.prisma.contacts.count({
          where: { company_id: companyId },
        }),
        this.prisma.messages.count({
          where: { contacts: { company_id: companyId } },
        }),
        this.prisma.messages.count({
          where: {
            contacts: { company_id: companyId },
            author_type: 'bot',
          },
        }),
        this.findById(companyId),
      ])

    let connectionStatus = company?.whatsapp_connection_status ?? false
    try {
      if (company?.session_id) {
        const status = await this.whatsBaileyService.getSessionStatus(
          company as Company,
        )
        connectionStatus = status.state === 'CONNECTED'
        if (company.whatsapp_connection_status !== connectionStatus) {
          this.updateCompany(company.id, {
            whatsapp_connection_status: connectionStatus,
          } as any).catch(() => {})
        }
      }
    } catch {
      connectionStatus = company?.whatsapp_connection_status ?? false
    }

    return {
      contacts_count: contactsCount,
      messages_count: messagesCount,
      bot_messages_count: botMessagesCount,
      is_bot_activated: company?.is_bot_activated ?? false,
      whatsapp_connected: connectionStatus,
    }
  }

  async getContacts(
    companyId: number,
    page: number,
    limit: number,
    search?: string,
    filters?: {
      needs_review?: string
      bot_activated?: string
      has_appointment?: string
      active_within?: string
    },
  ) {
    const skip = (page - 1) * limit
    const where: any = {
      company_id: companyId,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { whatsapp_profile_name: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (filters?.needs_review === 'true') {
      where.needs_review = true
    }

    if (filters?.bot_activated === 'true') {
      where.is_bot_activated = true
    } else if (filters?.bot_activated === 'false') {
      where.is_bot_activated = false
    }

    if (filters?.has_appointment === 'true') {
      where.crm_appointment_id = { not: null }
    }

    if (filters?.active_within === '24h') {
      where.last_message_received = {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      }
    } else if (filters?.active_within === '7d') {
      where.last_message_received = {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      }
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contacts.findMany({
        where,
        orderBy: { last_message_received: 'desc' },
        skip,
        take: limit,
        include: {
          messages: {
            orderBy: { sent_at: 'desc' },
            take: 1,
          },
          automation_events: {
            orderBy: { started_at: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.contacts.count({ where }),
    ])

    // Decrypt the latest-message preview on each contact so the dashboard
    // "Recent conversations" and the Contacts list show real text, not ciphertext.
    for (const contact of contacts) {
      if (contact.messages?.length) {
        decryptMessagesInPlace(contact.messages)
      }
    }

    decryptContactsInPlace(contacts)

    return {
      data: contacts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async getContactMessages(companyId: number, contactId: number) {
    const contact = await this.prisma.contacts.findFirst({
      where: { id: contactId, company_id: companyId },
    })
    if (!contact) throw new UnprocessableEntityException('Contact not found')

    const messages = await this.prisma.messages.findMany({
      where: { contact_id: contactId },
      orderBy: { sent_at: 'asc' },
    })

    return {
      contact: decryptContactFields(contact),
      messages: decryptMessagesInPlace(messages),
    }
  }

  async sendDeleteOtp(companyId: number) {
    const company = await this.findById(companyId)
    if (!company) throw new UnprocessableEntityException('Company not found')

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + OTP_TTL_MS)

    const user = await this.prisma.users.findFirst({
      where: { company_id: companyId },
    })
    if (!user) {
      throw new UnprocessableEntityException('No user found for this company')
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { otp_code: otp, otp_expires_at: expiresAt },
    })

    const otpCompany = await this.findById(1)
    if (otpCompany) {
      await this.whatsBaileyService.sendMessage(
        otpCompany,
        Number(user.phone),
        `Your ChatPilot delete verification code is: *${otp}*\n\nThis code expires in 1 minute. Do not share it with anyone.`,
      )
    } else {
      throw new UnprocessableEntityException('OTP service unavailable')
    }

    return { success: true, message: 'OTP sent to your WhatsApp' }
  }

  async deleteCompany(companyId: number, otp: string) {
    const company = await this.findById(companyId)
    if (!company) throw new UnprocessableEntityException('Company not found')

    // Verify OTP
    const user = await this.prisma.users.findFirst({
      where: { company_id: companyId },
      select: { id: true, otp_code: true, otp_expires_at: true },
    })
    if (!user) {
      throw new UnprocessableEntityException('No user found for this company')
    }

    if (
      !user.otp_code ||
      !user.otp_expires_at ||
      user.otp_code !== otp ||
      user.otp_expires_at < new Date()
    ) {
      throw new UnprocessableEntityException('Invalid or expired OTP')
    }

    // Clear OTP
    await this.prisma.users.update({
      where: { id: user.id },
      data: { otp_code: null, otp_expires_at: null },
    })

    if (company.session_id) {
      try {
        await this.whatsBaileyService.removeSession(company)
      } catch (e) {
        this.logger.warn(
          'Failed to remove WhatsApp session during company deletion',
          e?.message,
        )
      }
    }

    const assistantId = company.assistant_id

    await this.prisma.$transaction(async tx => {
      const contacts = await tx.contacts.findMany({
        where: { company_id: companyId },
        select: { id: true },
      })
      const contactIds = contacts.map(c => c.id)

      if (contactIds.length > 0) {
        await tx.messages.deleteMany({
          where: { contact_id: { in: contactIds } },
        })
      }

      await tx.contacts.deleteMany({
        where: { company_id: companyId },
      })

      await tx.companies.delete({
        where: { id: companyId },
      })

      if (assistantId) {
        const otherCompany = await tx.companies.findFirst({
          where: { assistant_id: assistantId },
          select: { id: true },
        })
        if (!otherCompany) {
          await tx.assistant_instructions.delete({
            where: { id: assistantId },
          })
        }
      }
    })

    return {
      success: true,
      message: 'Company and all related data deleted successfully',
    }
  }

  // ─── Company Assets (File Upload) ──────────────────────────────

  async uploadAsset(
    companyId: number,
    file: { originalname: string; buffer: Buffer; mimetype: string },
    description?: string,
  ) {
    const fileUrl = await this.storageService.uploadCompanyAsset(
      companyId,
      file.originalname,
      file.buffer,
      file.mimetype,
    )

    if (!fileUrl) {
      throw new UnprocessableEntityException('Failed to upload file')
    }

    const fileType = this.getFileType(file.mimetype, file.originalname)

    const asset = await this.prisma.company_assets.create({
      data: {
        company_id: companyId,
        file_url: fileUrl,
        file_type: fileType,
        file_name: file.originalname,
        description: description || null,
        mime_type: file.mimetype || null,
        content_hash: createHash('sha256').update(file.buffer).digest('hex'),
      },
    })

    const extracted = await this.extractDocumentImages(
      companyId,
      asset.id,
      file.originalname,
      file.buffer,
      fileType,
    )

    if (fileType === 'pdf') {
      await this.queueDocumentIndex(asset.id, companyId)
    }

    return {
      ...asset,
      extracted_images: extracted,
      property_indexing: fileType === 'pdf' ? 'queued' : 'not_applicable',
    }
  }

  async registerExternalMedia(
    companyId: number,
    input: {
      url: string
      name: string
      contentType: string
      key?: string
      size?: number
    },
  ) {
    if (!/^https:\/\//i.test(input.url)) {
      throw new UnprocessableEntityException('Media URL must use HTTPS')
    }
    const fileType =
      input.contentType === 'application/pdf'
        ? 'pdf'
        : input.contentType.startsWith('video/')
          ? 'video'
          : 'image'
    const asset = await this.prisma.company_assets.upsert({
      where: {
        company_id_file_url: { company_id: companyId, file_url: input.url },
      },
      create: {
        company_id: companyId,
        file_url: input.url,
        file_type: fileType,
        file_name: input.name.slice(0, 255),
        mime_type: input.contentType.slice(0, 120),
        source: 'media-library',
        source_ref: input.key?.slice(0, 120) || null,
      },
      update: {
        file_name: input.name.slice(0, 255),
        mime_type: input.contentType.slice(0, 120),
        source: 'media-library',
        source_ref: input.key?.slice(0, 120) || null,
      },
    })
    if (fileType === 'pdf') {
      const extractedChildren = await this.prisma.company_assets.count({
        where: {
          company_id: companyId,
          source: 'document-extract',
          source_ref: String(asset.id),
        },
      })
      if (!extractedChildren) {
        try {
          const response = await fetch(input.url, {
            signal: AbortSignal.timeout(20_000),
          })
          if (response.ok) {
            const length = Number(response.headers.get('content-length') || 0)
            if (!length || length <= 25 * 1024 * 1024) {
              const buffer = Buffer.from(await response.arrayBuffer())
              if (buffer.length <= 25 * 1024 * 1024) {
                await this.extractDocumentImages(
                  companyId,
                  asset.id,
                  asset.file_name,
                  buffer,
                  'pdf',
                )
              }
            }
          }
        } catch (error) {
          this.logger.warn(
            `Could not extract R2 PDF images for asset ${asset.id}: ${error?.message}`,
          )
        }
      }
      await this.queueDocumentIndex(asset.id, companyId)
    }
    return asset
  }

  async registerExternalMediaBatch(
    companyId: number,
    items: Array<{
      url: string
      name: string
      contentType: string
      key?: string
      size?: number
    }>,
  ) {
    const safe = items
      .slice(0, 100)
      .filter(item => /^https:\/\//i.test(item.url))
    const registered: unknown[] = []
    for (const item of safe) {
      registered.push(await this.registerExternalMedia(companyId, item))
    }
    return { registered: registered.length }
  }

  async unregisterExternalMedia(companyId: number, url: string) {
    const deleted = await this.prisma.company_assets.deleteMany({
      where: {
        company_id: companyId,
        file_url: url,
        source: 'media-library',
      },
    })
    return { deleted: deleted.count }
  }

  private async extractDocumentImages(
    companyId: number,
    parentId: number,
    fileName: string,
    buffer: Buffer,
    fileType: string,
  ): Promise<number> {
    const candidates: Array<{ name: string; buffer: Buffer; mime: string }> = []

    if (['doc', 'ppt', 'xls'].includes(fileType) && /x$/i.test(fileName)) {
      try {
        const archive = new AdmZip(buffer)
        for (const entry of archive.getEntries()) {
          if (!/(?:word|ppt|xl)\/media\//i.test(entry.entryName)) continue
          if (entry.isDirectory) continue
          const ext = entry.entryName.split('.').pop()?.toLowerCase() || ''
          const mime =
            ext === 'png'
              ? 'image/png'
              : ext === 'webp'
                ? 'image/webp'
                : ['jpg', 'jpeg'].includes(ext)
                  ? 'image/jpeg'
                  : ''
          if (!mime) continue
          const image = entry.getData()
          if (image.length >= 8_000) {
            candidates.push({ name: entry.entryName, buffer: image, mime })
          }
          if (candidates.length >= 8) break
        }
      } catch (error) {
        this.logger.warn(
          `Could not extract images from ${fileName}: ${error?.message}`,
        )
      }
    }

    if (fileType === 'pdf') {
      // Most marketing PDFs keep photographs as complete JPEG streams. Pull
      // those streams without rendering pages or consuming AI credits.
      let offset = 0
      while (candidates.length < 8) {
        const start = buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), offset)
        if (start < 0) break
        const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 3)
        if (end < 0) break
        const image = buffer.subarray(start, end + 2)
        if (image.length >= 12_000) {
          candidates.push({
            name: `pdf-image-${candidates.length + 1}.jpg`,
            buffer: image,
            mime: 'image/jpeg',
          })
        }
        offset = end + 2
      }
    }

    let created = 0
    const seen = new Set<string>()
    for (const [index, candidate] of candidates.entries()) {
      const hash = createHash('sha256').update(candidate.buffer).digest('hex')
      if (seen.has(hash)) continue
      seen.add(hash)
      const duplicate = await this.prisma.company_assets.findFirst({
        where: { company_id: companyId, content_hash: hash },
        select: { id: true },
      })
      if (duplicate) continue
      const ext =
        candidate.mime === 'image/png'
          ? 'png'
          : candidate.mime === 'image/webp'
            ? 'webp'
            : 'jpg'
      const extractedName = `${fileName.replace(/\.[^.]+$/, '')}-image-${index + 1}.${ext}`
      const url = await this.storageService.uploadCompanyAsset(
        companyId,
        extractedName,
        candidate.buffer,
        candidate.mime,
      )
      if (!url) continue
      await this.prisma.company_assets.create({
        data: {
          company_id: companyId,
          file_url: url,
          file_type: 'image',
          file_name: extractedName,
          description: `Image extracted from ${fileName}`,
          mime_type: candidate.mime,
          source: 'document-extract',
          source_ref: String(parentId),
          content_hash: hash,
        },
      })
      created++
    }
    return created
  }

  private async queueDocumentIndex(assetId: number, companyId: number) {
    await this.contentQueue.add(
      'index-document',
      { assetId, companyId },
      {
        jobId: `index-document-${assetId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    )
  }

  async getAssets(companyId: number) {
    return this.prisma.company_assets.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
    })
  }

  async deleteAsset(companyId: number, assetId: number) {
    const asset = await this.prisma.company_assets.findFirst({
      where: { id: assetId, company_id: companyId },
    })

    if (!asset) {
      throw new UnprocessableEntityException('Asset not found')
    }

    // Delete from local storage
    await this.storageService.deleteCompanyAsset(asset.file_url)

    // Delete from DB
    await this.prisma.company_assets.delete({
      where: { id: assetId },
    })

    return { success: true }
  }

  async updateAssetDescription(
    companyId: number,
    assetId: number,
    description: string,
  ) {
    const asset = await this.prisma.company_assets.findFirst({
      where: { id: assetId, company_id: companyId },
    })

    if (!asset) {
      throw new UnprocessableEntityException('Asset not found')
    }

    return this.prisma.company_assets.update({
      where: { id: assetId },
      data: { description },
    })
  }

  private getFileType(mimetype: string, filename: string): string {
    if (mimetype.startsWith('image/')) return 'image'
    if (mimetype.startsWith('video/')) return 'video'
    if (mimetype === 'application/pdf') return 'pdf'
    if (mimetype.includes('word') || mimetype.includes('document')) return 'doc'
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) {
      return 'xls'
    }
    if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) {
      return 'ppt'
    }

    // Fallback to extension
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image'
    if (['mp4', 'mov', '3gp'].includes(ext)) return 'video'
    if (ext === 'pdf') return 'pdf'
    if (['doc', 'docx'].includes(ext)) return 'doc'

    return ext || 'file'
  }
}
