export interface User {
  id: number
  phone: string
  full_name: string | null
  company_name: string
  company_id: number
  role: 'owner' | 'manager' | 'agent'
  status: 'active' | 'invited' | 'revoked'
  can_view_contact_phone: boolean
  created_at: string
  updated_at: string
  company: Company
}

export interface Company {
  id: number
  name: string
  phone: number
  email: string | null
  monthly_lead_quota: number | null
  daily_lead_limit: number | null
  is_bot_activated: boolean | null
  whatsapp_connection_status: boolean | null
  session_id: string | null
  business_details: BusinessDetails | null
  assistant_id: number | null
}

export interface Lead {
  id: number
  company_id: number
  name: string | null
  phone: number | null
  email: string | null
  website: string | null
  address: string | null
  source: string | null
  raw_text: string | null
  location_state: string | null
  status: string
  qual_score: number
  notes: string | null
  is_bot_activated: boolean
  contact_id: number | null
  last_contact_at: string | null
  created_at: string
}

export interface LeadUsage {
  used: number
  quota: number
  remaining: number
  daily_used: number
  daily_limit: number
  daily_remaining: number
}

export interface BusinessDetails {
  description?: string
  industry?: string
  services?: string
  hours?: string
  tone?: string
}

export interface Contact {
  id: number
  name: string | null
  phone: number | null
  whatsapp_profile_name: string | null
  photo_url: string | null
  total_messages: number
  is_bot_activated: boolean | null
  is_replies_activated: boolean | null
  is_follow_up_sent: boolean
  needs_review: boolean
  contact_stop_date: string | null
  crm_appointment_id: string | null
  crm_appointment_at: string | null
  last_message_received: string
  messages?: Message[]
}

export interface Message {
  id: number
  contact_id: number
  message: string
  image_url: string | null
  sent_at: string
  author_type: 'human' | 'bot' | 'user_whatsapp'
  message_type: string | null
}

export interface DashboardStats {
  contacts_count: number
  messages_count: number
  bot_messages_count: number
  is_bot_activated: boolean
  whatsapp_connected: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
}
