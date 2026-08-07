import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { UpsertPropertyDto } from '../dto/property.dto'

@Injectable()
export class PropertyService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: number, status?: string) {
    return this.prisma.properties.findMany({
      where: { company_id: companyId, ...(status ? { status } : {}) },
      orderBy: { id: 'desc' },
    })
  }

  async detail(companyId: number, propertyId: number) {
    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, company_id: companyId },
    })
    if (!property) throw new NotFoundException('Property not found')
    return property
  }

  create(companyId: number, dto: UpsertPropertyDto) {
    return this.prisma.properties.create({
      data: { company_id: companyId, ...this.toData(dto) },
    })
  }

  async update(companyId: number, propertyId: number, dto: UpsertPropertyDto) {
    await this.detail(companyId, propertyId)
    return this.prisma.properties.update({
      where: { id: propertyId },
      data: this.toData(dto),
    })
  }

  async remove(companyId: number, propertyId: number) {
    await this.detail(companyId, propertyId)
    await this.prisma.properties.delete({ where: { id: propertyId } })
    return { deleted: true }
  }

  private toData(dto: UpsertPropertyDto) {
    return {
      title: dto.title,
      description: dto.description ?? null,
      property_type: dto.property_type ?? null,
      location: dto.location ?? null,
      state: dto.state ?? null,
      price: dto.price === undefined ? null : BigInt(dto.price),
      price_max: dto.price_max === undefined ? null : BigInt(dto.price_max),
      currency: dto.currency ?? 'NGN',
      size_sqm: dto.size_sqm ?? null,
      bedrooms: dto.bedrooms ?? null,
      bathrooms: dto.bathrooms ?? null,
      title_document: dto.title_document ?? null,
      payment_plan: dto.payment_plan ?? null,
      features: dto.features ?? null,
      image_urls: dto.image_urls ?? null,
      video_url: dto.video_url ?? null,
      status: dto.status ?? 'available',
    }
  }
}
