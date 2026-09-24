import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for Arsalynk, a technology ecosystem operated by PT Sinergi Muda Arsa.',
  alternates: {
    canonical: '/privacy-policy',
  },
};

const POLICY_SECTIONS = [
  {
    id: 'information-we-collect',
    title: '1. Information We Collect',
    content: (
      <>
        <p>
          We may collect information that you provide directly when you use our website,
          contact forms, customer service channels, or WhatsApp services. This may include
          your name, phone number, email address, company information, message content, and
          other information you voluntarily provide.
        </p>
        <p>
          We may also receive limited technical information generated when you access our
          digital services, such as browser information, device information, IP address,
          timestamps, and service logs used for security, reliability, and troubleshooting.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: '2. How We Use Information',
    content: (
      <>
        <p>We use information only where reasonably necessary to operate our services, including to:</p>
        <ul>
          <li>respond to enquiries and provide customer support;</li>
          <li>connect users with the appropriate Arsalynk team or representative;</li>
          <li>deliver, maintain, and improve our digital services;</li>
          <li>protect our systems against misuse, fraud, and security incidents;</li>
          <li>maintain operational records and troubleshoot service issues; and</li>
          <li>comply with applicable legal and regulatory obligations.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'whatsapp',
    title: '3. WhatsApp Business Platform',
    content: (
      <>
        <p>
          Arsalynk may use the WhatsApp Business Platform to receive and send messages to
          users who choose to communicate with us through WhatsApp. Messages and related
          identifiers may be processed to route conversations, respond to enquiries, and
          maintain customer service continuity.
        </p>
        <p>
          WhatsApp and Meta may process information in accordance with their own terms and
          privacy policies. Arsalynk does not control the independent processing activities
          of third-party platforms.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: '4. Sharing of Information',
    content: (
      <>
        <p>
          We do not sell personal information. Information may be shared with service
          providers that support our hosting, communications, security, analytics, or other
          operational functions, only to the extent reasonably required to provide our
          services.
        </p>
        <p>
          We may also disclose information where required by applicable law, regulation,
          legal process, or a valid request from an authorised public authority.
        </p>
      </>
    ),
  },
  {
    id: 'retention-security',
    title: '5. Data Retention & Security',
    content: (
      <>
        <p>
          We retain information for as long as reasonably necessary for the purposes
          described in this policy, including customer support, service reliability,
          security, record keeping, and legal compliance.
        </p>
        <p>
          We apply reasonable technical and organisational safeguards designed to protect
          information from unauthorised access, alteration, loss, misuse, or disclosure.
          No online service can guarantee absolute security, but we continuously work to
          maintain appropriate protections for our systems.
        </p>
      </>
    ),
  },
  {
    id: 'rights-deletion',
    title: '6. Your Rights & Data Deletion',
    content: (
      <>
        <p>
          Subject to applicable law, you may contact us to request access to, correction of,
          or deletion of personal information associated with your interactions with
          Arsalynk.
        </p>
        <p>
          To request deletion, email us at{' '}
          <a
            href="mailto:corporate.arsalynk@gmail.com?subject=Data%20Deletion%20Request"
            className="font-semibold text-[#1A3E9E] underline decoration-[#1A3E9E]/30 underline-offset-4 transition hover:decoration-[#1A3E9E]"
          >
            corporate.arsalynk@gmail.com
          </a>{' '}
          with the subject <strong>Data Deletion Request</strong> and provide enough
          information for us to identify the relevant interaction. We may need to verify
          your request before completing it.
        </p>
      </>
    ),
  },
  {
    id: 'third-party-services',
    title: '7. Third-Party Services',
    content: (
      <p>
        Our services may contain links to, or integrate with, third-party services. Their
        privacy practices are governed by their own policies. We encourage users to review
        the privacy terms of any third-party platform they choose to use.
      </p>
    ),
  },
  {
    id: 'changes',
    title: '8. Changes to This Policy',
    content: (
      <p>
        We may update this Privacy Policy from time to time to reflect changes to our
        services, technology, business practices, or legal requirements. The latest version
        will always be published on this page together with its most recent update date.
      </p>
    ),
  },
] as const;

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M3.5 8h8M8.5 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="w-full bg-[#F7F7F7] pt-[64px] text-[#101010] max-[1199px]:pt-[80px]">
      <section className="relative isolate overflow-hidden bg-[#050B18] py-[clamp(70px,8vw,145px)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 13% 20%, rgba(43,100,255,0.28), transparent 36%), radial-gradient(circle at 88% 18%, rgba(230,255,42,0.10), transparent 24%), linear-gradient(135deg, #050B18 0%, #081844 58%, #102A74 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-[8%] top-1/2 h-[clamp(260px,30vw,520px)] w-[clamp(260px,30vw,520px)] -translate-y-1/2 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-[3%] top-1/2 h-[clamp(180px,21vw,370px)] w-[clamp(180px,21vw,370px)] -translate-y-1/2 rounded-full border border-[#E6FF2A]/20"
        />

        <div className="site-shell relative z-10 px-0">
          <div className="max-w-[1050px]">
            <div className="mb-7 inline-flex items-center rounded-full border border-[#E6FF2A]/30 bg-[#E6FF2A]/10 px-4 py-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-[#E6FF2A]">
              Legal & Privacy
            </div>

            <h1 className="font-heading max-w-[920px] text-[clamp(48px,6vw,104px)] font-medium leading-[0.96] tracking-[-0.035em] text-[#F7F7F7]">
              Privacy Policy
            </h1>

            <p className="mt-7 max-w-[760px] font-body text-[clamp(15px,1.05vw,20px)] font-normal leading-[1.7] text-white/72">
              This policy explains how PT Sinergi Muda Arsa through Arsalynk collects,
              uses, stores, and protects information when you interact with our website,
              digital services, and customer support channels.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 font-body text-[12px] font-medium tracking-[0.02em] text-white/50">
              <span>PT Sinergi Muda Arsa — Arsalynk</span>
              <span className="h-1 w-1 rounded-full bg-[#E6FF2A]" aria-hidden="true" />
              <span>Last updated: 24 September 2026</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-[clamp(64px,7vw,120px)]">
        <div className="site-shell grid grid-cols-[minmax(220px,0.72fr)_minmax(0,1.85fr)] gap-[clamp(48px,7vw,120px)] px-0 max-[900px]:grid-cols-1">
          <aside className="self-start max-[900px]:order-2">
            <div className="sticky top-[104px] rounded-[28px] bg-[#101010] p-7 text-white max-[900px]:static">
              <p className="font-heading text-[22px] font-semibold tracking-[-0.02em]">
                Privacy at a glance
              </p>
              <p className="mt-3 font-body text-[13px] leading-[1.7] text-white/60">
                We use personal information to provide and protect our services. We do not
                sell your personal information.
              </p>

              <div className="mt-7 border-t border-white/10 pt-6">
                <p className="font-body text-[10px] font-bold uppercase tracking-[0.15em] text-[#E6FF2A]">
                  Need assistance?
                </p>
                <a
                  href="mailto:corporate.arsalynk@gmail.com"
                  className="mt-3 inline-flex items-center gap-2 font-body text-[13px] font-semibold text-white no-underline transition-colors hover:text-[#E6FF2A]"
                >
                  Contact our team <ArrowIcon />
                </a>
              </div>
            </div>
          </aside>

          <div className="max-[900px]:order-1">
            <div className="rounded-[clamp(24px,2vw,36px)] border border-black/[0.06] bg-white px-[clamp(24px,4vw,64px)] py-[clamp(34px,4.5vw,72px)] shadow-[0_24px_70px_rgba(16,16,16,0.06)]">
              <div className="border-b border-[#E5E5E5] pb-10">
                <p className="font-heading text-[clamp(25px,2.2vw,38px)] font-semibold leading-[1.2] tracking-[-0.025em] text-[#101010]">
                  Our commitment to your privacy
                </p>
                <p className="mt-4 max-w-[780px] font-body text-[15px] leading-[1.8] text-[#5F5F5F]">
                  Arsalynk is a technology ecosystem operated by PT Sinergi Muda Arsa. We
                  respect the privacy of our users, clients, partners, and website visitors
                  and aim to process information transparently and responsibly.
                </p>
              </div>

              <div className="divide-y divide-[#E8E8E8]">
                {POLICY_SECTIONS.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-[110px] py-[clamp(32px,3.2vw,52px)] first:pt-10 last:pb-0"
                  >
                    <h2 className="font-heading text-[clamp(22px,1.7vw,30px)] font-semibold leading-[1.25] tracking-[-0.02em] text-[#1A3E9E]">
                      {section.title}
                    </h2>
                    <div className="privacy-copy mt-5 space-y-4 font-body text-[15px] leading-[1.85] text-[#555555] [&_strong]:font-semibold [&_strong]:text-[#292929] [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
                      {section.content}
                    </div>
                  </section>
                ))}
              </div>

              <section className="mt-12 overflow-hidden rounded-[24px] bg-[#1A3E9E] p-[clamp(24px,3vw,42px)] text-white">
                <div className="max-w-[720px]">
                  <p className="font-body text-[10px] font-bold uppercase tracking-[0.15em] text-[#E6FF2A]">
                    Contact
                  </p>
                  <h2 className="font-heading mt-3 text-[clamp(25px,2vw,34px)] font-semibold tracking-[-0.025em]">
                    Questions about this Privacy Policy?
                  </h2>
                  <p className="mt-4 font-body text-[14px] leading-[1.75] text-white/70">
                    Contact PT Sinergi Muda Arsa — Arsalynk and our team will help with
                    privacy questions or data-related requests.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <a
                      href="mailto:corporate.arsalynk@gmail.com"
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#E6FF2A] px-6 font-body text-[12px] font-bold tracking-[0.02em] text-[#101010] no-underline transition hover:bg-[#F4FA51]"
                    >
                      EMAIL ARSALYNK <ArrowIcon />
                    </a>
                    <Link
                      href="/contact-us"
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-white/25 px-6 font-body text-[12px] font-semibold tracking-[0.02em] text-white no-underline transition hover:border-white/50 hover:bg-white/10"
                    >
                      CONTACT US <ArrowIcon />
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
