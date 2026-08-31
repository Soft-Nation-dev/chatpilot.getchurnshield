import type { Metadata } from 'next'
import { LegalShell, LegalSection } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing use of GetChurnShield Outbound Engine.',
  alternates: { canonical: '/terms' },
}

const CONTACT_EMAIL = 'getchurnshield@gmail.com'

const sections: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement and eligibility',
    content: <p>These Terms govern access to GetChurnShield’s Outbound Engine service. By creating an account or using the service, you agree to these Terms for yourself and the business you represent. You must be at least 18 and authorised to bind that business.</p>,
  },
  {
    id: 'service',
    title: 'The service',
    content: <p>Outbound Engine provides business lead, messaging, AI-assistance, content, automation, and connected-account tools. Features may change as we improve the service. Third-party services—including Meta, WhatsApp, hosting, and AI providers—remain governed by their own terms and availability.</p>,
  },
  {
    id: 'accounts',
    title: 'Accounts and connected channels',
    content: <p>You are responsible for accurate account information, safeguarding credentials, managing team access, and ensuring you have authority to connect each phone number, Facebook Page, Instagram account, calendar, or other channel. Notify us promptly of suspected unauthorised access.</p>,
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    content: <>
      <p>You must use the service lawfully and may not use it to:</p>
      <ul>
        <li>send spam, deceptive, abusive, discriminatory, or unlawful communications;</li>
        <li>collect or process personal information without an appropriate legal basis or notice;</li>
        <li>impersonate others, misrepresent property facts, or publish content you do not have rights to use;</li>
        <li>evade platform rules, access controls, rate limits, or security measures; or</li>
        <li>interfere with the service, introduce malicious code, or attempt unauthorised access.</li>
      </ul>
    </>,
  },
  {
    id: 'ai',
    title: 'AI and automated outputs',
    content: <p>AI-generated replies, classifications, lead scores, and content may be incomplete or inaccurate. You remain responsible for reviewing outputs, maintaining accurate business and property information, supervising automation, and deciding whether an output is appropriate before relying on or publishing it. The service does not provide legal, financial, or investment advice.</p>,
  },
  {
    id: 'customer-data',
    title: 'Customer data and permissions',
    content: <p>You retain ownership of content and data you submit. You grant us the limited rights necessary to host, process, transmit, and display that data to operate the service. You represent that you have all permissions required to provide the data and instruct us to process it. Our handling of personal information is described in the Privacy Policy.</p>,
  },
  {
    id: 'availability',
    title: 'Availability and suspension',
    content: <p>We aim to provide a reliable service but do not guarantee uninterrupted operation. We may suspend access to protect security, comply with law or platform requirements, prevent harm, address non-payment, or investigate a material breach. We will provide notice when reasonably possible.</p>,
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers and liability',
    content: <p>To the maximum extent permitted by law, the service is provided “as is” and “as available” without implied warranties of merchantability, fitness for a particular purpose, or non-infringement. We are not responsible for lost opportunities, platform outages, third-party actions, or decisions based on automated outputs. Nothing in these Terms excludes liability that cannot legally be excluded.</p>,
  },
  {
    id: 'termination',
    title: 'Termination and deletion',
    content: <p>You may stop using the service, disconnect integrations, or delete the company workspace from Settings. We may terminate access for a material or repeated breach. Sections that by their nature should survive termination—including ownership, disclaimers, liability, and dispute provisions—will survive.</p>,
  },
  {
    id: 'law-contact',
    title: 'Governing law, changes, and contact',
    content: <p>These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict-of-law principles. We may update these Terms and will identify the current effective date. Questions may be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>,
  },
]

export default function TermsPage() {
  return <LegalShell eyebrow="Legal & trust" title="Terms of Service" summary="The rules that keep Outbound Engine useful, secure, and fair for every business and customer using it." effectiveDate="31 August 2026" sections={sections} />
}
