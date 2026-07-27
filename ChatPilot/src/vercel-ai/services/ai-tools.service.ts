import { tool } from 'ai'
import { z } from 'zod'
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common'
import { ContactService } from '../../contact/contact.service'
import { DatesHelper } from 'src/utils/services/dates.service'
import {
  AiSdkToolConfig,
  AiSdkToolsNames,
  Contact,
} from 'src/utils/constants/types'
import { PrismaService } from 'src/prisma/prisma.service'
import { CalComService } from 'src/utils/services/calcom.service'

@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name)

  constructor(
    @Inject(forwardRef(() => ContactService))
    private readonly contactService: ContactService,
    private readonly datesHelperService: DatesHelper,
    private readonly prisma: PrismaService,
    private readonly calComService: CalComService,
  ) {}

  getContactTools(contact: Contact, excludeTools: AiSdkToolsNames[] = []) {
    const company = contact.companies
    const tools: AiSdkToolConfig = {
      save_name: tool({
        description: "Saves or updates the contact's name.",
        inputSchema: z.object({
          name: z.string().describe('The name of the contact.'),
        }),
        execute: async ({ name }) => {
          try {
            this.logger.log('tool call started', {
              context: 'save_name',
              parameters: {
                name,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
            })
            await this.contactService.updateField(contact, 'name', name)
            this.logger.log('tool call finished', {
              context: 'save_name',
              parameters: {
                name,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'success',
            })
            return 'success'
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'save_name',
              parameters: {
                name,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'failed',
              error: error.message,
            })
            return 'failed'
          }
        },
      }),

      // BOT & HUMAN INTERACTION
      set_needs_review: tool({
        description:
          'Flags a conversation for human review and can pause the bot.',
        inputSchema: z.object({
          value: z
            .boolean()
            .describe('True to flag for review, false otherwise.'),
          reason: z
            .string()
            .optional()
            .describe('The reason why review is needed.'),
        }),
        execute: async ({ value, reason }) => {
          try {
            this.logger.log('tool call started', {
              context: 'set_needs_review',
              parameters: {
                value,
                reason,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
            })

            const message = reason
              ? `This client needs assistance +${contact.phone}: ${reason}`
              : `User question needs human review. Phone: +${contact.phone}`

            await Promise.all([
              this.contactService.updateContact(contact.id, {
                needs_review: value,
                is_bot_activated: !value,
              }),
              this.contactService.sendMessageToCompany(contact, message),
            ])

            this.logger.log('tool call finished', {
              context: 'set_needs_review',
              parameters: {
                value,
                reason,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'success',
            })

            return 'success'
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'set_needs_review',
              parameters: {
                value,
                reason,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'failed to perform action',
              error,
            })
            return 'failed to perform action'
          }
        },
      }),

      change_bot_status: tool({
        description:
          'Activates or deactivates the bot for the current contact.',
        inputSchema: z.object({
          status: z
            .boolean()
            .describe('True to activate the bot, false to deactivate.'),
        }),
        execute: async ({ status }) => {
          try {
            this.logger.log('tool call started', {
              context: 'change_bot_status',
              parameters: {
                status,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
            })

            await this.contactService.updateContact(contact.id, {
              is_bot_activated: status,
            })

            this.logger.log('tool call finished', {
              context: 'change_bot_status',
              parameters: {
                status,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'success',
            })

            return 'success'
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'change_bot_status',
              parameters: {
                status,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'failed to perform action',
              error,
            })
            return 'failed to perform action'
          }
        },
      }),

      notify_company: tool({
        description: 'Sends a specified message to the company.',
        inputSchema: z.object({
          message: z.string().describe('The content of the message to send.'),
        }),
        execute: async ({ message }) => {
          try {
            this.logger.log('tool call started', {
              context: 'notify_company',
              parameters: {
                message,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
            })

            await this.contactService.sendMessageToCompany(
              contact,
              `${message}\n\n${contact.name ? `Client name: ${contact.name}` : ''}\nPhone: +${contact.phone}`,
            )

            this.logger.log('tool call finished', {
              context: 'notify_company',
              parameters: {
                message,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'success',
            })

            return 'success'
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'notify_company',
              parameters: {
                message,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'failed to perform action',
              error,
            })
            return 'failed to perform action'
          }
        },
      }),

      activate_replies: tool({
        description:
          'Activates or deactivates automatic replies for the contact.',
        inputSchema: z.object({
          is_replies_activated: z
            .boolean()
            .describe('True to activate replies, false to deactivate.'),
        }),
        execute: async ({ is_replies_activated }) => {
          try {
            this.logger.log('tool call started', {
              context: 'activate_replies',
              parameters: {
                is_replies_activated,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
            })

            await this.contactService.updateContact(contact.id, {
              is_replies_activated,
            })

            this.logger.log('tool call finished', {
              context: 'activate_replies',
              parameters: {
                is_replies_activated,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'success',
            })

            return 'success'
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'activate_replies',
              parameters: {
                is_replies_activated,
                contactId: contact.id,
                contactPhone: contact.phone,
                companyId: company.id,
                companyPhone: company.phone,
              },
              result: 'failed to perform action',
              error,
            })
            return 'failed to perform action'
          }
        },
      }),

      get_available_slots: tool({
        description:
          'Fetches available appointment slots from the calendar. Use this when the customer wants to schedule or book an appointment. Returns available time slots grouped by date.',
        inputSchema: z.object({
          startDate: z
            .string()
            .describe(
              'Start date in YYYY-MM-DD format for the search range.',
            ),
          endDate: z
            .string()
            .describe('End date in YYYY-MM-DD format for the search range.'),
        }),
        execute: async ({ startDate, endDate }) => {
          try {
            this.logger.log('tool call started', {
              context: 'get_available_slots',
              parameters: {
                startDate,
                endDate,
                contactId: contact.id,
                companyId: company.id,
              },
            })

            const result =
              await this.calComService.getAvailableAppointments(
                company,
                startDate,
                endDate,
              )

            if (typeof result === 'string') {
              return result
            }

            this.logger.log('tool call finished', {
              context: 'get_available_slots',
              result: 'success',
            })

            return JSON.stringify(result)
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'get_available_slots',
              error: error.message,
            })
            return 'Failed to fetch available slots. Please try again.'
          }
        },
      }),

      book_appointment: tool({
        description:
          'Books an appointment at a specific date and time. Use this after showing available slots and the customer confirms a time. The date must be one of the available slots returned by get_available_slots.',
        inputSchema: z.object({
          date: z
            .string()
            .describe(
              'The exact date and time for the appointment in ISO 8601 format (e.g. 2024-03-22T10:00:00).',
            ),
          name: z
            .string()
            .describe('The name of the person booking the appointment.'),
          email: z
            .string()
            .describe('The email address of the person booking.'),
        }),
        execute: async ({ date, name, email }) => {
          try {
            this.logger.log('tool call started', {
              context: 'book_appointment',
              parameters: {
                date,
                name,
                email,
                contactId: contact.id,
                companyId: company.id,
              },
            })

            const result = await this.calComService.bookAppointment(
              company,
              date,
              name,
              email,
              Number(contact.phone),
            )

            if (result.success) {
              await this.contactService.updateContact(contact.id, {
                schedule_event: result,
                crm_appointment_id: result.data?.data?.uid || null,
                crm_appointment_at: new Date(),
              })

              this.logger.log('tool call finished', {
                context: 'book_appointment',
                result: 'success',
              })

              return `Appointment booked successfully for ${result.date || date}.`
            }

            return `Booking failed: ${result.error}`
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'book_appointment',
              error: error.message,
            })
            return 'Failed to book appointment. Please try again.'
          }
        },
      }),

      cancel_appointment: tool({
        description:
          'Cancels the current appointment for this contact. Use this when the customer wants to cancel their existing booking.',
        inputSchema: z.object({
          reason: z
            .string()
            .optional()
            .describe('The reason for cancellation.'),
        }),
        execute: async ({ reason }) => {
          try {
            this.logger.log('tool call started', {
              context: 'cancel_appointment',
              parameters: {
                reason,
                contactId: contact.id,
                companyId: company.id,
                appointmentId: contact.crm_appointment_id,
              },
            })

            if (!contact.crm_appointment_id) {
              return 'No existing appointment found to cancel.'
            }

            const result = await this.calComService.cancelAppointment(
              company,
              contact,
            )

            if (result.success) {
              await this.contactService.updateContact(contact.id, {
                crm_appointment_at: null,
                schedule_event: null,
                crm_appointment_id: null,
              })

              this.logger.log('tool call finished', {
                context: 'cancel_appointment',
                result: 'success',
              })

              return 'Appointment cancelled successfully.'
            }

            return `Cancellation failed: ${result.error}`
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'cancel_appointment',
              error: error.message,
            })
            return 'Failed to cancel appointment. Please try again.'
          }
        },
      }),

      // LEAD QUALIFICATION VAULT
      save_budget: tool({
        description:
          "Saves the buyer's budget. Nigerian buyers use shorthand: '25m' or '25 million' means 25000000, '1.5b' means 1500000000, '450k' means 450000. '₦45m' means 45000000. Always convert to a plain number before calling. If the buyer gives a range, pass both min and max; if they give a single figure, pass it as max.",
        inputSchema: z.object({
          min: z
            .number()
            .optional()
            .describe('Lower bound of the budget as a plain number.'),
          max: z
            .number()
            .optional()
            .describe('Upper bound of the budget as a plain number.'),
          currency: z
            .string()
            .optional()
            .describe("Currency code, defaults to 'NGN'."),
          raw: z
            .string()
            .optional()
            .describe('The exact wording the buyer used, e.g. "around 25m".'),
        }),
        execute: async ({ min, max, currency, raw }) => {
          try {
            this.logger.log('tool call started', {
              context: 'save_budget',
              parameters: { min, max, currency, contactId: contact.id },
            })
            const result = await this.contactService.updateQualification(
              contact,
              {
                budget_min: min,
                budget_max: max,
                budget_currency: currency || 'NGN',
                budget_raw: raw,
              },
            )
            this.logger.log('tool call finished', {
              context: 'save_budget',
              result,
            })
            return result
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'save_budget',
              error: error.message,
            })
            return 'failed'
          }
        },
      }),

      save_property_preference: tool({
        description:
          'Saves what kind of property the buyer wants, where they want it, and which title document they require.',
        inputSchema: z.object({
          property_type: z
            .enum([
              'land',
              'plot',
              'bungalow',
              'duplex',
              'flat',
              'terrace',
              'shortlet',
              'commercial',
              'warehouse',
            ])
            .optional()
            .describe('The type of property the buyer is looking for.'),
          location: z
            .string()
            .optional()
            .describe(
              'The area or state the buyer wants, e.g. "Ibeju-Lekki" or "Lekki Phase 1".',
            ),
          bedrooms: z
            .number()
            .optional()
            .describe('Number of bedrooms required.'),
          title_preference: z
            .enum([
              'C of O',
              "Governor's Consent",
              'Deed of Assignment',
              'Excision',
              'Gazette',
              'Registered Survey',
            ])
            .optional()
            .describe('The title document the buyer requires.'),
        }),
        execute: async ({
          property_type,
          location,
          bedrooms,
          title_preference,
        }) => {
          try {
            this.logger.log('tool call started', {
              context: 'save_property_preference',
              parameters: { property_type, location, contactId: contact.id },
            })
            const result = await this.contactService.updateQualification(
              contact,
              {
                property_type,
                preferred_location: location,
                bedrooms,
                title_preference,
              },
            )
            this.logger.log('tool call finished', {
              context: 'save_property_preference',
              result,
            })
            return result
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'save_property_preference',
              error: error.message,
            })
            return 'failed'
          }
        },
      }),

      save_timeline: tool({
        description:
          'Saves how soon the buyer intends to purchase and how they intend to pay.',
        inputSchema: z.object({
          timeline: z
            .enum([
              'immediate',
              '1-3_months',
              '3-6_months',
              '6_plus_months',
              'just_browsing',
            ])
            .describe('How soon the buyer wants to purchase.'),
          payment_plan: z
            .enum(['outright', 'installment', 'mortgage'])
            .optional()
            .describe('How the buyer intends to pay.'),
        }),
        execute: async ({ timeline, payment_plan }) => {
          try {
            this.logger.log('tool call started', {
              context: 'save_timeline',
              parameters: { timeline, payment_plan, contactId: contact.id },
            })
            const result = await this.contactService.updateQualification(
              contact,
              {
                purchase_timeline: timeline,
                payment_plan,
              },
            )
            this.logger.log('tool call finished', {
              context: 'save_timeline',
              result,
            })
            return result
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'save_timeline',
              error: error.message,
            })
            return 'failed'
          }
        },
      }),

      save_qualification_notes: tool({
        description:
          'Appends a short private note about this buyer for the human sales team. Use it for anything important that does not fit the other fields, such as objections raised or a specific estate they asked about.',
        inputSchema: z.object({
          notes: z
            .string()
            .describe('The note to append. Keep it to one or two sentences.'),
        }),
        execute: async ({ notes }) => {
          try {
            this.logger.log('tool call started', {
              context: 'save_qualification_notes',
              parameters: { contactId: contact.id },
            })
            const result = await this.contactService.appendQualificationNotes(
              contact,
              notes,
            )
            this.logger.log('tool call finished', {
              context: 'save_qualification_notes',
              result,
            })
            return result
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'save_qualification_notes',
              error: error.message,
            })
            return 'failed'
          }
        },
      }),

      set_lead_stage: tool({
        description:
          "Updates where this buyer sits in the sales pipeline. Use 'engaged' once they answer questions, 'qualified' once budget and location are known, 'booked' once an inspection is scheduled, and 'lost' if they say they are no longer interested.",
        inputSchema: z.object({
          stage: z
            .enum(['new', 'engaged', 'qualified', 'booked', 'lost'])
            .describe('The pipeline stage for this buyer.'),
          score: z
            .number()
            .optional()
            .describe('Optional lead score from 0 to 100.'),
        }),
        execute: async ({ stage, score }) => {
          try {
            this.logger.log('tool call started', {
              context: 'set_lead_stage',
              parameters: { stage, score, contactId: contact.id },
            })
            const result = await this.contactService.updateQualification(
              contact,
              {
                qual_stage: stage,
                ...(score === undefined
                  ? {}
                  : { lead_score: Math.max(0, Math.min(100, Math.round(score))) }),
              },
            )
            this.logger.log('tool call finished', {
              context: 'set_lead_stage',
              result,
            })
            return result
          } catch (error) {
            this.logger.error('tool call failed', {
              context: 'set_lead_stage',
              error: error.message,
            })
            return 'failed'
          }
        },
      }),
    }

    // Filter out excluded tools
    const allTools = { ...tools }
    excludeTools.forEach(toolName => {
      if (toolName in allTools) {
        delete allTools[toolName]
      }
    })

    return allTools
  }
}
