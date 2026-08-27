import { Injectable, Logger } from '@nestjs/common'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)
  private readonly uploadsDir = resolve(process.env.UPLOADS_DIR || '/app/uploads')
  private readonly publicBaseUrl = (
    process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '')

  private static readonly MIME_EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/pjpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/aac': 'aac',
    'audio/m4a': 'm4a',
    'audio/amr': 'amr',
    'audio/mpeg': 'mp3',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'text/plain': 'txt',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  }

  private safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  private async persist(
    relativePath: string,
    fileBuffer: Buffer,
  ): Promise<string | null> {
    const target = resolve(join(this.uploadsDir, relativePath))

    if (!target.startsWith(this.uploadsDir)) {
      this.logger.error('Rejected upload outside the uploads directory', {
        relativePath,
      })
      return null
    }

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, fileBuffer)

    const publicUrl = `${this.publicBaseUrl}/uploads/${relativePath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`

    this.logger.log(`Stored file: ${publicUrl}`)
    return publicUrl
  }

  async uploadCompanyAsset(
    companyId: number,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
  ): Promise<string | null> {
    try {
      const timestamp = Date.now()
      const sanitizedName = this.safeSegment(fileName)
      return await this.persist(
        `company-assets/${companyId}/${timestamp}-${sanitizedName}`,
        fileBuffer,
      )
    } catch (error) {
      this.logger.error('Upload failed', { error: error.message, contentType })
      return null
    }
  }

  async deleteCompanyAsset(fileUrl: string): Promise<boolean> {
    try {
      const marker = '/uploads/'
      const index = fileUrl.indexOf(marker)
      if (index === -1) return false

      const relativePath = decodeURIComponent(
        fileUrl.slice(index + marker.length),
      )
      const target = resolve(join(this.uploadsDir, relativePath))
      if (!target.startsWith(this.uploadsDir)) return false

      await unlink(target)
      return true
    } catch (error) {
      this.logger.error('Delete failed', { error: error.message })
      return false
    }
  }

  async upload(
    fileName: string,
    fileBuffer: Buffer,
    bucketName: string,
    contentType: string,
  ): Promise<string | null> {
    try {
      const timestamp = Date.now()
      const segments = fileName.split('/').filter(Boolean).map(s => this.safeSegment(s))
      const last = segments.pop() || 'file'
      const bucket = this.safeSegment(bucketName)
      const relativePath = [bucket, ...segments, `${timestamp}-${last}`].join('/')

      return await this.persist(relativePath, fileBuffer)
    } catch (error) {
      this.logger.error('Upload failed', {
        error: error.message,
        bucketName,
        fileName,
        contentType,
      })
      return null
    }
  }

  getMediaExtension(mimeType: string): string {
    const normalized = (mimeType || '').toLowerCase()
    return (
      StorageService.MIME_EXTENSIONS[normalized] ||
      StorageService.MIME_EXTENSIONS[normalized.split(';')[0].trim()] ||
      ''
    )
  }

  async uploadMedia(
    mediaBuffer: Buffer,
    mimeType: string,
    companyPhone: string,
    contactPhone: string,
  ): Promise<string | null> {
    try {
      const ext = this.getMediaExtension(mimeType)
      if (!ext) {
        this.logger.warn('Unknown mime type for media upload', { mimeType })
        return null
      }

      return await this.upload(
        `${companyPhone}/${contactPhone}/media.${ext}`,
        mediaBuffer,
        'chat-media',
        mimeType,
      )
    } catch (error) {
      this.logger.error('uploadMedia failed', {
        error: error.message,
        companyPhone,
        contactPhone,
      })
      return null
    }
  }
}
