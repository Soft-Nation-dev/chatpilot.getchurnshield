import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalSection } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How GetChurnShield and Outbound Engine collect, use, protect, and delete personal and Meta Platform data.',
  alternates: { canonical: '/privacy' },
}

const CONTACT_EMAIL = 'getchurnshield@gmail.com'

const sections: LegalSection[] = [
  {
    id: 'scope',
    title: 'Who we are and scope',
    content: <p>This Privacy Policy explains how <strong>GetChurnShield</strong>, operating the <strong>Outbound Engine</strong> service (“we”, “us”, or “our”), handles information when businesses use our website, dashboard, AI automation, lead-management features, and connected WhatsApp, Facebook, and Instagram services. It applies to account owners, team members, prospects, and people who communicate with a customer using our service.</p>,
  },
  {
    id: 'information',
    title: 'Information we collect',
    content: <>
      <p>Depending on the features used, we may collect:</p>
      <ul>
        <li><strong>Account information:</strong> name, phone number, email address, company name, role, and authentication records.</li>
        <li><strong>Business information:</strong> business description, services, operating hours, property inventory, instructions, uploaded files, and AI configuration.</li>
        <li><strong>Customer and lead information:</strong> names, phone numbers, contact details, enquiry source, lead status, notes, appointment information, and conversation history.</li>
        <li><strong>Communication data:</strong> WhatsApp messages and media, Facebook Page or Instagram professional account identifiers, comments, direct messages, webhook events, and automated responses.</li>
        <li><strong>Connected-account data:</strong> Meta access tokens, Page IDs, Instagram account IDs, usernames, subscription status, and permission information needed to provide the integration.</li>
        <li><strong>Technical information:</strong> IP address, browser and device data, timestamps, error logs, security events, and service-usage information.</li>
      </ul>
    </>,
  },
  {
    id: 'use',
    title: 'How we use information',
    content: <>
      <p>We use information to provide and improve Outbound Engine, including to:</p>
      <ul>
        <li>authenticate users and administer company workspaces;</li>
        <li>connect approved social and messaging accounts;</li>
        <li>display, classify, and respond to enquiries, comments, and messages;</li>
        <li>generate and publish content only when directed by an authorised user;</li>
        <li>source, organise, qualify, and follow up with business leads;</li>
        <li>detect abuse, troubleshoot errors, secure the service, and comply with law; and</li>
        <li>communicate important service, security, and account updates.</li>
      </ul>
    </>,
  },
  {
    id: 'meta-data',
    title: 'Facebook and Instagram Platform data',
    content: <>
      <p>When an authorised business connects Facebook or Instagram, we request only the permissions needed for the selected features. This may let us read Page or professional-account details, receive subscribed comments and messages, send replies, and publish content at the user’s direction.</p>
      <p>We use Meta Platform data only to provide these customer-facing functions. We do not sell Meta Platform data, use it for unrelated advertising, or share it with data brokers. A business can disconnect an account from <Link href="/settings/social">Social channels</Link> and can request deletion using our <Link href="/data-deletion">Data Deletion Instructions</Link>.</p>
    </>,
  },
  {
    id: 'legal-basis',
    title: 'Legal bases and business responsibilities',
    content: <p>We process information as necessary to perform our contract with account holders, on the basis of legitimate interests such as service security and improvement, with consent where required, and to meet legal obligations. Businesses using Outbound Engine are responsible for providing appropriate notices to their own customers and for using messaging, lead, and automation features lawfully.</p>,
  },
  {
    id: 'sharing',
    title: 'When information is shared',
    content: <>
      <p>We do not sell personal information. We may share limited information with:</p>
      <ul>
        <li>hosting, database, cloud, AI, communications, monitoring, and security providers acting for us;</li>
        <li>Meta, WhatsApp, and other connected services when an authorised user requests an integration action;</li>
        <li>professional advisers, regulators, courts, or law enforcement where legally required; and</li>
        <li>a successor organisation in connection with a merger, financing, acquisition, or sale, subject to appropriate safeguards.</li>
      </ul>
    </>,
  },
  {
    id: 'retention',
    title: 'Retention and deletion',
    content: <p>We retain information while an account is active and for as long as reasonably necessary to provide the service, resolve disputes, maintain security, and meet legal obligations. When a verified deletion request is completed, we delete or anonymise covered account and connected-platform data from active systems. Residual backup copies may remain for a limited period until routine backup rotation, unless longer retention is legally required.</p>,
  },
  {
    id: 'security',
    title: 'Security',
    content: <p>We use administrative, technical, and organisational safeguards designed to protect information, including access controls, authentication, encryption or protected storage where appropriate, and monitoring. No internet or storage system is completely secure, so we cannot guarantee absolute security.</p>,
  },
  {
    id: 'rights',
    title: 'Your choices and rights',
    content: <>
      <p>Subject to applicable law, you may request access, correction, export, restriction, objection, or deletion of your personal information. Account owners can update business details, disconnect social accounts, and initiate company deletion from the dashboard.</p>
      <p>See the step-by-step <Link href="/data-deletion">Data Deletion Instructions</Link> or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We may ask for information needed to verify your identity and authority over the account.</p>
    </>,
  },
  {
    id: 'children',
    title: 'Children',
    content: <p>Outbound Engine is a business service and is not directed to children. We do not knowingly collect personal information directly from anyone under 18. Contact us if you believe a child’s information has been provided to the service.</p>,
  },
  {
    id: 'updates',
    title: 'Policy updates and contact',
    content: <>
      <p>We may update this Policy as our service or legal obligations change. The effective date above identifies the latest version. Material changes will be communicated through the service or another appropriate channel.</p>
      <p>Privacy questions may be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Please use the subject line “Privacy Request — Outbound Engine”.</p>
    </>,
  },
]

export default function PrivacyPage() {
  return <LegalShell eyebrow="Legal & trust" title="Privacy Policy" summary="A clear explanation of the information Outbound Engine processes, why we need it, and the choices available to you." effectiveDate="31 August 2026" sections={sections} />
}
