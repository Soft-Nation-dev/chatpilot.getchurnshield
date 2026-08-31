import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalSection } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Data Deletion Instructions',
  description: 'How to delete Outbound Engine account data and connected Facebook and Instagram data.',
  alternates: { canonical: '/data-deletion' },
}

const CONTACT_EMAIL = 'getchurnshield@gmail.com'

const sections: LegalSection[] = [
  {
    id: 'dashboard',
    title: 'Delete your company from the dashboard',
    content: <>
      <p>If you are the company owner and can sign in, this is the fastest way to delete the workspace:</p>
      <ul>
        <li>Sign in at <Link href="/login">chatpilot.trygetchurnshield.com/login</Link>.</li>
        <li>Open <strong>Settings</strong> from the dashboard sidebar.</li>
        <li>Scroll to <strong>Danger Zone</strong> and select <strong>Delete Company</strong>.</li>
        <li>Select <strong>Send Verification Code</strong>.</li>
        <li>Enter the six-digit code sent to the owner’s WhatsApp number and confirm deletion.</li>
      </ul>
      <p>This action is irreversible and removes the company workspace and associated contacts, messages, user accounts, AI configuration, social-account records, stored integration tokens, and WhatsApp session data from active systems.</p>
    </>,
  },
  {
    id: 'meta-only',
    title: 'Disconnect Facebook or Instagram only',
    content: <>
      <p>To stop Meta access without deleting the entire Outbound Engine workspace:</p>
      <ul>
        <li>Sign in and open <Link href="/settings/social">Facebook &amp; Instagram settings</Link>.</li>
        <li>Select <strong>Disconnect</strong> beside each connected account.</li>
        <li>For an additional platform-level revocation, open Facebook Settings → Business Integrations, locate this app, and remove it.</li>
      </ul>
      <p>Disconnecting deactivates the integration and stops future webhook processing. You may then use the request method below if you also want previously stored Meta-related data deleted.</p>
    </>,
  },
  {
    id: 'email-request',
    title: 'Request deletion when you cannot sign in',
    content: <>
      <p>Email <a href={`mailto:${CONTACT_EMAIL}?subject=Data%20Deletion%20Request%20%E2%80%94%20Outbound%20Engine`}>{CONTACT_EMAIL}</a> with the subject <strong>“Data Deletion Request — Outbound Engine”</strong>.</p>
      <p>Include the company name, account phone number or email, and—if the request concerns Meta data—the Facebook Page name or Instagram username. Do not send passwords, access tokens, one-time codes, or identity documents unless our support team requests a specific verification method.</p>
      <p>We will acknowledge the request and may ask you to verify ownership. Verified requests are normally completed within 30 days, subject to legal, fraud-prevention, security, and backup-retention requirements.</p>
    </>,
  },
  {
    id: 'what-is-deleted',
    title: 'What deletion covers',
    content: <>
      <p>A verified full-workspace deletion covers data controlled by Outbound Engine, which may include:</p>
      <ul>
        <li>account, team, company, and business-profile information;</li>
        <li>contacts, leads, messages, notes, appointments, and uploaded assets;</li>
        <li>Facebook Page and Instagram account identifiers, webhook event records, comments or messages stored by the service, and stored access tokens;</li>
        <li>generated content, property inventory, automation settings, and AI configuration; and</li>
        <li>WhatsApp connection and session information.</li>
      </ul>
    </>,
  },
  {
    id: 'exceptions',
    title: 'Limited retention exceptions',
    content: <p>We may retain the minimum information necessary to comply with law, prevent fraud or abuse, enforce agreements, resolve disputes, or document completion of the request. Encrypted or restricted backup copies may persist until routine rotation and are not used for ordinary product operations.</p>,
  },
  {
    id: 'questions',
    title: 'Questions and confirmation',
    content: <p>For questions or confirmation of a completed request, contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See our <Link href="/privacy">Privacy Policy</Link> for more information about collection, use, retention, and your rights.</p>,
  },
]

export default function DataDeletionPage() {
  return <LegalShell eyebrow="Privacy control" title="Data Deletion Instructions" summary="Delete your full Outbound Engine workspace, disconnect Meta accounts, or send a verified deletion request if you cannot sign in." effectiveDate="31 August 2026" sections={sections} />
}
