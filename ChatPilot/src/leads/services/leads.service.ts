import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactService } from '../../contact/contact.service';
import { CompanyService } from '../../company/company.service';
import { AiGoogleService } from '../../vercel-ai/services/ai-google.service';
import { LeadSourcingService } from './lead-sourcing.service';
import { scraperConfig } from '../scrapers/scraper-config';
import { LEADS_OUTREACH_QUEUE, LeadJobKind } from '../leads.constants';
import { AUTHOR_TYPE, Company, Contact } from '../../utils/constants/types';
import { leads } from '@prisma/client';
import { withCompanyLock, withSourcingLock } from '../pool.mutex';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactService: ContactService,
    private readonly companyService: CompanyService,
    private readonly aiGoogleService: AiGoogleService,
    private readonly sourcingService: LeadSourcingService,
    @InjectQueue(LEADS_OUTREACH_QUEUE) private readonly outreachQueue: Queue,
  ) {}

  private monthStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private dayStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  async monthlyUsage(companyId: number) {
    const company = await this.companyService.findById(companyId);
    const quota = company?.monthly_lead_quota ?? scraperConfig.monthlyLeadQuota;
    const dailyLimit = company?.daily_lead_limit ?? scraperConfig.dailyLeadLimit;
    const used = await this.prisma.leads.count({
      where: { company_id: companyId, created_at: { gte: this.monthStart() } },
    });
    const dailyUsed = await this.prisma.leads.count({
      where: { company_id: companyId, created_at: { gte: this.dayStart() } },
    });
    return {
      used,
      quota,
      remaining: Math.max(0, quota - used),
      daily_used: dailyUsed,
      daily_limit: dailyLimit,
      daily_remaining: Math.max(0, dailyLimit - dailyUsed),
    };
  }

  async list(companyId: number, filters: { status?: string; bot?: string } = {}): Promise<leads[]> {
    return this.prisma.leads.findMany({
      where: {
        company_id: companyId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.bot === 'on' ? { is_bot_activated: true } : {}),
        ...(filters.bot === 'off' ? { is_bot_activated: false } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async detail(companyId: number, leadId: number) {
    const lead = await this.prisma.leads.findFirst({ where: { id: leadId, company_id: companyId } });
    if (!lead) throw new NotFoundException('lead not found');
    const messages = lead.contact_id ? await this.contactService.getAllMessages(lead.contact_id) : [];
    return { lead, messages };
  }

  async requestLeads(companyId: number, count: number) {
    return withCompanyLock(companyId, async () => {
      const usage = await this.monthlyUsage(companyId);
      const requested = Math.max(1, Math.floor(count) || 1);
      const allowed = Math.min(requested, usage.remaining, usage.daily_remaining);
      if (allowed <= 0) {
        return {
          started: false,
          quotaReached: usage.remaining <= 0,
          dailyReached: usage.daily_remaining <= 0,
          found: 0,
          ...usage,
        };
      }
      const request = await this.prisma.lead_requests.create({
        data: { company_id: companyId, target: allowed, status: 'running', sources: scraperConfig.apify.enabledSources.join(',') },
      });
      const found = await this.claimFromPool(companyId, allowed);
      await this.prisma.lead_requests.update({
        where: { id: request.id },
        data: { found, status: 'done' },
      });
      const after = await this.monthlyUsage(companyId);
      return { started: true, quotaReached: false, dailyReached: false, requestId: request.id, target: allowed, found, ...after };
    });
  }

  async poolStats() {
    return { size: await this.sourcingService.poolSize() };
  }

  async harvestPool(count: number) {
    const target = Math.max(1, Math.floor(count) || 1);
    const added = await withSourcingLock(() => this.sourcingService.topUpPool(target));
    const size = await this.sourcingService.poolSize();
    return { added, size };
  }

  private async claimFromPool(companyId: number, allowed: number): Promise<number> {
    const company = await this.prisma.companies.findUnique({ where: { id: companyId }, select: { pool_cursor: true } });
    const cursor = company?.pool_cursor ?? -1;
    const offset = cursor + 1;
    let size = await this.sourcingService.poolSize();
    let available = size - offset;
    if (available < allowed) {
      await withSourcingLock(async () => {
        let cycles = 0;
        while (cycles < scraperConfig.poolTopUpMaxCycles) {
          size = await this.sourcingService.poolSize();
          available = size - offset;
          if (available >= allowed) break;
          const added = await this.sourcingService.topUpPool(allowed - available);
          if (added <= 0) break;
          cycles += 1;
        }
      });
      size = await this.sourcingService.poolSize();
      available = size - offset;
    }
    const serve = Math.min(allowed, Math.max(0, available));
    if (serve <= 0) return 0;
    const rows = await this.prisma.pool.findMany({ orderBy: { id: 'asc' }, skip: offset, take: serve });
    if (!rows.length) return 0;
    const data = rows.map((r) => ({
      company_id: companyId,
      name: r.name,
      phone: r.phone,
      email: r.email,
      website: r.website,
      address: r.address,
      source: r.source,
      source_id: String(r.id),
      raw_text: r.raw_text,
      location_state: r.location_state,
      status: 'qualified',
      qual_score: 1,
      notes: 'High-intent buyer',
    }));
    await this.prisma.$transaction([
      this.prisma.leads.createMany({ data, skipDuplicates: true }),
      this.prisma.companies.update({ where: { id: companyId }, data: { pool_cursor: cursor + rows.length } }),
    ]);
    return rows.length;
  }

  async enqueueManual(companyId: number, leadId: number, text: string) {
    await this.outreachQueue.add(LeadJobKind.MANUAL, { companyId, leadId, text });
    return { queued: true };
  }

  async enqueueAiOpen(companyId: number, leadId: number) {
    await this.outreachQueue.add(LeadJobKind.AI_OPEN, { companyId, leadId });
    return { queued: true };
  }

  private async resolveLeads(companyId: number, target: { all?: boolean; leadIds?: number[] }): Promise<leads[]> {
    if (target.all) {
      return this.prisma.leads.findMany({ where: { company_id: companyId, phone: { not: null } } });
    }
    const ids = (target.leadIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (!ids.length) return [];
    return this.prisma.leads.findMany({ where: { company_id: companyId, id: { in: ids }, phone: { not: null } } });
  }

  private personalize(text: string, lead: leads): string {
    return text
      .replace(/\{\{\s*name\s*\}\}/gi, lead.name || 'there')
      .replace(/\{\{\s*location\s*\}\}/gi, lead.location_state || 'your area');
  }

  async blast(companyId: number, text: string, target: { all?: boolean; leadIds?: number[] }) {
    const body = (text || '').trim();
    if (!body) return { started: false, total: 0 };
    const leadsList = await this.resolveLeads(companyId, target);
    for (const lead of leadsList) {
      await this.outreachQueue.add(LeadJobKind.MANUAL, { companyId, leadId: lead.id, text: this.personalize(body, lead) });
    }
    return { started: true, total: leadsList.length };
  }

  async aiOutreach(companyId: number, target: { all?: boolean; leadIds?: number[] }) {
    let leadsList = await this.resolveLeads(companyId, target);
    if (target.all) leadsList = leadsList.filter((l) => l.status === 'qualified');
    for (const lead of leadsList) {
      await this.outreachQueue.add(LeadJobKind.AI_OPEN, { companyId, leadId: lead.id });
    }
    return { started: true, total: leadsList.length };
  }

  async toggleBot(companyId: number, leadId: number, value: boolean) {
    const lead = await this.prisma.leads.findFirst({ where: { id: leadId, company_id: companyId } });
    if (!lead) throw new NotFoundException('lead not found');
    const updated = await this.prisma.leads.update({
      where: { id: lead.id },
      data: { is_bot_activated: value },
    });
    if (lead.contact_id) {
      await this.prisma.contacts.update({
        where: { id: lead.contact_id },
        data: { is_bot_activated: value },
      });
    }
    return updated;
  }

  private async resolveContact(company: Company, lead: leads): Promise<Contact> {
    if (lead.phone == null) throw new NotFoundException('lead has no phone');
    const contact = await this.contactService.getOrCreateContact(company, Number(lead.phone), lead.name ?? null);
    if (!contact) throw new NotFoundException('could not resolve contact for lead');
    await this.prisma.contacts.update({
      where: { id: contact.id },
      data: { is_bot_activated: lead.is_bot_activated },
    });
    if (lead.contact_id !== contact.id) {
      await this.prisma.leads.update({ where: { id: lead.id }, data: { contact_id: contact.id } });
    }
    return contact;
  }

  async processManual(companyId: number, leadId: number, text: string): Promise<void> {
    const company = await this.companyService.findById(companyId);
    if (!company) throw new NotFoundException('company not found');
    const lead = await this.prisma.leads.findFirst({ where: { id: leadId, company_id: companyId } });
    if (!lead) throw new NotFoundException('lead not found');
    const contact = await this.resolveContact(company, lead);
    await this.contactService.sendMessage(contact, text, undefined, AUTHOR_TYPE.USER_WHATSAPP);
    await this.prisma.leads.update({
      where: { id: lead.id },
      data: { status: 'contacted', last_contact_at: new Date() },
    });
  }

  async processAiOpen(companyId: number, leadId: number): Promise<void> {
    const company = await this.companyService.findById(companyId);
    if (!company) throw new NotFoundException('company not found');
    const lead = await this.prisma.leads.findFirst({ where: { id: leadId, company_id: companyId } });
    if (!lead) throw new NotFoundException('lead not found');
    const contact = await this.resolveContact(company, lead);

    const systemPrompt = await this.buildSystemPrompt(company);
    const context = [lead.name ? `Name: ${lead.name}` : '', lead.location_state ? `Area: ${lead.location_state}` : '', lead.raw_text ? `They posted: ${lead.raw_text}` : '']
      .filter(Boolean)
      .join('\n');
    const prompt =
      `Write a short, friendly WhatsApp opening message to a new real-estate buyer lead to start a conversation. ` +
      `Keep it to one or two sentences, warm and natural, and invite them to reply. Do not use placeholders.\n\n${context}`;

    let text = '';
    try {
      const result = await this.aiGoogleService.processPrompts(contact, systemPrompt, prompt);
      text = (result?.text || '').trim();
    } catch (err) {
      this.logger.error(`AI open generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!text) {
      text = `Hello${lead.name ? ' ' + lead.name : ''}, this is ${company.name}. I saw you're looking for property${lead.location_state ? ' in ' + lead.location_state : ''} — happy to help. Are you still searching?`;
    }
    await this.contactService.sendMessage(contact, text, undefined, AUTHOR_TYPE.BOT);
    await this.prisma.leads.update({
      where: { id: lead.id },
      data: { status: 'contacted', last_contact_at: new Date() },
    });
  }

  private async buildSystemPrompt(company: Company): Promise<string> {
    if (company.assistant_id) {
      const assistant = await this.prisma.assistant_instructions.findFirst({ where: { id: company.assistant_id } });
      if (assistant?.system_prompt) return assistant.system_prompt;
    }
    return `You are a friendly WhatsApp sales representative for ${company.name}, a Nigerian real-estate agency. Speak naturally and help buyers find property.`;
  }
}
