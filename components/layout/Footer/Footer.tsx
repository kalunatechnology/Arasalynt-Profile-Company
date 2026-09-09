import Link from 'next/link';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import {
  WHATSAPP_LINK,
  WHATSAPP_PHONE_DISPLAY,
} from '@/lib/constants';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
});

const ABOUT_LINKS = [
  { name: 'About Arsalynk', href: '/about-us' },
  { name: 'Corporate Profile', href: '/about-us/corporate-profile' },
  { name: 'Company Leadership', href: '/about-us/company-leadership' },
  { name: 'Ecosystem Philosophy', href: '/about-us/ecosystem-philosophy' },
  { name: 'Contact Us', href: '/contact-us' },
];

const EXPLORE_LINKS = [
  { name: 'Our Solution', href: '/our-solution' },
  { name: 'Our Works', href: '/our-works' },
  { name: 'Case Studies', href: '/insight-programs/case-studies' },
  { name: 'Leadership Thoughts', href: '/insight-programs/leadership-thoughts' },
];

const SERVICE_LINKS = [
  { name: 'Point of Sale (POS)', href: '/our-solution/point-of-sale-pos' },
  { name: 'HR & Talent Management', href: '/our-solution/hr-talent-management-engine' },
  { name: 'Financial Automation', href: '/our-solution/financial-accounting-automation-hub' },
  { name: 'Supply Chain Control', href: '/our-solution/supply-chain-inventory-control' },
  { name: 'Logistics & Fleet Tracker', href: '/our-solution/logistics-fleet-operations-tracker' },
  { name: 'Warehouse Management', href: '/our-solution/warehouse-management-system' },
];

const BrandLogo = () => (
  <svg
    aria-hidden="true"
    viewBox="110 96 402 109.185"
    className="block h-[70px] w-[258px] shrink-0 max-[767px]:h-auto max-[767px]:w-[190px]"
  >
    <path d="M218.792 150.595C218.792 153.457 217.667 156.13 215.68 158.125L203.342 170.512C200.642 173.261 197.192 174.992 193.48 175.595C193.292 172.395 192.467 169.383 191.042 166.597H191.455C193.48 166.371 195.392 165.429 196.855 163.999L209.23 151.612C209.492 151.311 209.642 150.972 209.642 150.595C209.642 150.219 209.492 149.88 209.23 149.579L196.892 137.192C193.405 133.728 187.78 133.728 184.255 137.192L174.28 147.207L167.867 140.806L177.73 130.678C178.63 129.812 179.567 129.059 180.542 128.382C183.505 126.386 186.955 125.332 190.555 125.332C191.605 125.332 192.617 125.407 193.63 125.596C197.305 126.236 200.68 127.968 203.342 130.641L215.68 143.028C217.667 145.023 218.792 147.734 218.792 150.558V150.595Z" fill="#E6FF2A" />
    <path d="M161.002 160.57L151.065 170.509C150.165 171.413 149.265 172.166 148.252 172.806C145.327 174.801 141.84 175.818 138.24 175.818C137.19 175.818 136.177 175.743 135.165 175.592C131.527 174.952 128.115 173.22 125.452 170.509L113.152 158.122C109.027 153.981 109.027 147.204 113.152 143.025L125.49 130.638C128.227 127.927 131.64 126.195 135.352 125.593C135.54 128.755 136.327 131.805 137.79 134.591H137.415C135.352 134.817 133.477 135.721 131.977 137.189L119.64 149.576C119.115 150.141 119.115 151.082 119.64 151.609L131.94 163.996C133.627 165.69 135.877 166.631 138.277 166.631C140.677 166.631 142.89 165.652 144.577 163.996L154.515 154.019L161.002 160.57Z" fill="#E6FF2A" />
    <path d="M184.217 163.954L173.68 153.412L169.442 149.158L165.767 145.468L161.492 141.214L150.992 130.672C147.505 127.17 147.505 121.485 150.992 117.984L163.33 105.634C163.892 105.07 164.792 105.07 165.355 105.634L177.692 117.984C179.155 119.452 180.055 121.41 180.242 123.443V123.857C183.017 122.389 186.092 121.56 189.242 121.372C188.642 117.645 186.88 114.181 184.18 111.47L171.842 99.0832C167.68 94.9417 160.967 94.9794 156.805 99.0832L144.467 111.432C141.805 114.143 140.042 117.532 139.442 121.221C139.255 122.238 139.18 123.255 139.18 124.309C139.18 127.923 140.23 131.425 142.18 134.399C142.855 135.416 143.605 136.319 144.467 137.223L155.005 147.765L159.242 152.019L162.917 155.709L167.155 159.963L177.692 170.505C181.18 174.007 181.18 179.73 177.692 183.193L165.355 195.543C164.792 196.107 163.892 196.107 163.33 195.543L150.992 183.156C149.53 181.687 148.63 179.73 148.442 177.697V177.282C145.63 178.751 142.63 179.579 139.442 179.767C140.042 183.532 141.805 186.958 144.505 189.669L156.842 202.056C158.905 204.127 161.642 205.143 164.342 205.143C167.042 205.143 169.78 204.127 171.842 202.019L184.18 189.669C186.842 186.996 188.605 183.608 189.205 179.918C189.392 178.901 189.467 177.885 189.467 176.793C189.467 173.179 188.417 169.677 186.467 166.703C185.792 165.686 185.042 164.783 184.18 163.879L184.217 163.954Z" fill="#E6FF2A" />
    <path d="M261.458 163.351H242.933L239.633 172.387H231.008L247.358 128.826H257.52L273.87 172.387H264.795L261.458 163.351ZM245.445 156.687H258.983L253.508 141.74L252.233 137.259L250.958 141.74L245.483 156.687H245.445Z" fill="white" />
    <path d="M280.957 138.015H289.132V143.022C291.382 138.919 294.795 137.074 298.507 137.074C299.895 137.074 301.17 137.45 301.807 138.053V145.168C300.72 144.83 299.52 144.717 298.057 144.717C291.87 144.717 289.132 148.444 289.132 154.129V172.389H280.957V138.053V138.015Z" fill="white" />
    <path d="M337.134 162.259C337.134 168.847 331.059 173.328 322.509 173.328C313.959 173.328 308.034 169.412 306.797 161.167H314.972C315.534 164.894 318.497 167.003 322.772 167.003C326.784 167.003 328.884 165.271 328.884 162.786C328.884 155.105 307.772 161.694 307.772 147.801C307.772 142.229 312.122 137.108 321.047 137.108C328.884 137.108 334.847 140.836 335.859 149.345H327.684C327.047 145.166 324.609 143.509 320.747 143.509C317.484 143.509 315.572 145.128 315.572 147.274C315.572 155.143 337.134 148.479 337.134 162.259Z" fill="white" />
    <path d="M344.895 149.31C345.982 141.667 351.532 137.074 360.157 137.074C369.682 137.074 374.52 142.721 374.52 150.665V163.994C374.52 168.21 374.895 170.582 375.532 172.389H367.057C366.607 171.222 366.42 169.566 366.345 167.721C363.532 171.712 359.332 173.368 355.245 173.368C348.532 173.368 343.77 170.018 343.77 163.429C343.77 158.76 346.395 155.221 351.607 153.489C356.145 151.946 360.532 151.569 366.27 151.494V150.665C366.27 146.26 364.17 143.888 359.632 143.888C355.732 143.888 353.632 146.072 353.107 149.348H344.857L344.895 149.31ZM357.345 167.269C362.37 167.269 366.27 163.165 366.27 158.045V156.576C354.645 156.765 351.982 159.513 351.982 162.977C351.982 165.612 354.007 167.269 357.345 167.269Z" fill="white" />
    <path d="M384.871 128.791H393.046V172.352H384.871V128.791Z" fill="white" />
    <path d="M402.266 186.656V180.369H404.179C407.891 180.369 409.616 179.616 412.204 173.064L413.029 170.956L399.566 138.012H408.304L415.916 157.929L417.304 162.937L418.691 157.929L425.966 138.012H434.329L419.254 175.738C415.729 184.661 412.691 187.409 406.429 187.409C404.779 187.409 403.054 186.957 402.229 186.656H402.266Z" fill="white" />
    <path d="M441.043 138.015H449.218V142.646C451.468 138.919 455.03 137.074 459.38 137.074C466.205 137.074 470.855 141.178 470.855 149.498V172.389H462.68V151.193C462.68 146.524 460.693 143.888 456.568 143.888C452.03 143.888 449.218 147.879 449.218 152.473V172.389H441.043V138.053V138.015Z" fill="white" />
    <path d="M480.905 128.791H489.08V152.36L501.455 138.015H511.017L497.217 153.264L511.955 172.352H501.942L489.042 155.748V172.352H480.867V128.791H480.905Z" fill="white" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg aria-hidden="true" viewBox="1310.5 635.185 27 27" className="h-[19px] w-[19px] shrink-0">
    <path fillRule="evenodd" clipRule="evenodd" fill="#D9D9D9" d="M1324 636.185C1317.37 636.185 1312 641.557 1312 648.185C1312 650.453 1312.63 652.577 1313.73 654.387L1312.66 658.025C1312.59 658.234 1312.59 658.456 1312.64 658.667C1312.7 658.878 1312.81 659.07 1312.96 659.224C1313.11 659.378 1313.31 659.488 1313.52 659.542C1313.73 659.595 1313.95 659.591 1314.16 659.53L1317.8 658.459C1319.67 659.591 1321.81 660.188 1324 660.185C1330.63 660.185 1336 654.813 1336 648.185C1336 641.557 1330.63 636.185 1324 636.185ZM1321.29 650.901C1323.71 653.327 1326.03 653.647 1326.85 653.677C1328.09 653.723 1329.31 652.773 1329.78 651.67C1329.84 651.533 1329.86 651.382 1329.84 651.234C1329.82 651.085 1329.76 650.945 1329.67 650.826C1329.01 649.986 1328.12 649.383 1327.26 648.783C1327.07 648.657 1326.85 648.606 1326.63 648.642C1326.42 648.677 1326.22 648.796 1326.09 648.972L1325.37 650.07C1325.33 650.129 1325.27 650.171 1325.2 650.188C1325.14 650.205 1325.06 650.196 1325 650.161C1324.51 649.882 1323.8 649.407 1323.29 648.895C1322.78 648.384 1322.33 647.705 1322.08 647.248C1322.05 647.19 1322.04 647.122 1322.06 647.058C1322.07 646.994 1322.11 646.938 1322.16 646.899L1323.27 646.075C1323.43 645.938 1323.53 645.747 1323.56 645.539C1323.59 645.331 1323.53 645.12 1323.42 644.947C1322.88 644.16 1322.25 643.159 1321.34 642.496C1321.23 642.411 1321.09 642.359 1320.94 642.343C1320.8 642.327 1320.66 642.349 1320.52 642.406C1319.42 642.879 1318.46 644.091 1318.51 645.337C1318.54 646.156 1318.86 648.473 1321.29 650.901Z" />
  </svg>
);

const MailIcon = () => (
  <svg aria-hidden="true" viewBox="1310.5 674.185 27 27" className="h-[19px] w-[19px] shrink-0">
    <path fill="#DCDCDC" d="M1334.75 682.662V693.31C1334.75 694.171 1334.42 694.999 1333.83 695.625C1333.24 696.252 1332.43 696.629 1331.57 696.679L1331.38 696.685H1315.62C1314.76 696.685 1313.94 696.356 1313.31 695.765C1312.68 695.175 1312.31 694.367 1312.26 693.508L1312.25 693.31V682.662L1322.88 689.746L1323.01 689.82C1323.16 689.895 1323.33 689.934 1323.5 689.934C1323.67 689.934 1323.84 689.895 1323.99 689.82L1324.12 689.746L1334.75 682.662Z" />
    <path fill="#DCDCDC" d="M1331.37 678.685C1332.59 678.685 1333.65 679.326 1334.25 680.29L1323.5 687.457L1312.75 680.29C1313.03 679.832 1313.42 679.448 1313.88 679.17C1314.34 678.893 1314.86 678.729 1315.4 678.693L1315.62 678.685H1331.37Z" />
  </svg>
);

const InstagramIcon = () => (
  <svg aria-hidden="true" viewBox="1460.913 893.098 26.174 26.174" className="h-[19px] w-[19px]">
    <path fill="currentColor" d="M1483.76 902.154C1483.75 901.328 1483.59 900.51 1483.3 899.738C1483.05 899.085 1482.66 898.493 1482.17 897.998C1481.67 897.504 1481.08 897.118 1480.43 896.866C1479.66 896.58 1478.86 896.425 1478.04 896.408C1476.99 896.361 1476.66 896.348 1474 896.348C1471.33 896.348 1470.99 896.348 1469.95 896.408C1469.14 896.425 1468.33 896.58 1467.57 896.866C1466.92 897.118 1466.32 897.504 1465.83 897.998C1465.34 898.493 1464.95 899.085 1464.7 899.738C1464.41 900.5 1464.26 901.306 1464.24 902.121C1464.19 903.171 1464.18 903.503 1464.18 906.167C1464.18 908.83 1464.18 909.17 1464.24 910.213C1464.26 911.028 1464.41 911.833 1464.7 912.598C1464.95 913.25 1465.34 913.842 1465.83 914.337C1466.33 914.831 1466.92 915.216 1467.57 915.468C1468.33 915.766 1469.14 915.932 1469.95 915.959C1471 916.006 1471.34 916.02 1474 916.02C1476.66 916.02 1477 916.02 1478.05 915.959C1478.86 915.943 1479.67 915.788 1480.43 915.502C1481.08 915.249 1481.67 914.863 1482.17 914.368C1482.66 913.874 1483.05 913.282 1483.3 912.63C1483.59 911.867 1483.74 911.062 1483.76 910.245C1483.8 909.196 1483.82 908.864 1483.82 906.199C1483.82 903.536 1483.82 903.198 1483.76 902.154ZM1473.99 911.203C1471.21 911.203 1468.95 908.946 1468.95 906.161C1468.95 903.376 1471.21 901.119 1473.99 901.119C1475.33 901.119 1476.61 901.651 1477.56 902.596C1478.5 903.542 1479.03 904.824 1479.03 906.161C1479.03 907.498 1478.5 908.781 1477.56 909.726C1476.61 910.672 1475.33 911.203 1473.99 911.203ZM1479.23 902.109C1479.08 902.109 1478.93 902.078 1478.78 902.019C1478.64 901.96 1478.51 901.874 1478.4 901.765C1478.29 901.655 1478.21 901.526 1478.15 901.383C1478.09 901.24 1478.06 901.087 1478.06 900.933C1478.06 900.779 1478.09 900.626 1478.15 900.483C1478.21 900.341 1478.29 900.211 1478.4 900.102C1478.51 899.993 1478.64 899.906 1478.78 899.847C1478.93 899.788 1479.08 899.758 1479.23 899.758C1479.39 899.758 1479.54 899.788 1479.68 899.847C1479.83 899.906 1479.96 899.993 1480.06 900.102C1480.17 900.211 1480.26 900.341 1480.32 900.483C1480.38 900.626 1480.41 900.779 1480.41 900.933C1480.41 901.583 1479.88 902.109 1479.23 902.109Z" />
    <path fill="currentColor" d="M1473.99 909.437C1475.8 909.437 1477.27 907.971 1477.27 906.162C1477.27 904.353 1475.8 902.887 1473.99 902.887C1472.19 902.887 1470.72 904.353 1470.72 906.162C1470.72 907.971 1472.19 909.437 1473.99 909.437Z" />
  </svg>
);

const LinkedinIcon = () => (
  <svg aria-hidden="true" viewBox="1612.913 893.098 26.174 26.174" className="h-[19px] w-[19px]">
    <path fill="currentColor" d="M1618.35 900.949C1619.66 900.949 1620.73 899.88 1620.73 898.562C1620.73 897.245 1619.66 896.176 1618.35 896.176C1617.03 896.176 1615.96 897.245 1615.96 898.562C1615.96 899.88 1617.03 900.949 1618.35 900.949Z" />
    <path fill="currentColor" d="M1622.99 902.753V915.992H1627.1V909.445C1627.1 907.718 1627.42 906.045 1629.56 906.045C1631.68 906.045 1631.7 908.02 1631.7 909.554V915.993H1635.82V908.733C1635.82 905.167 1635.05 902.426 1630.88 902.426C1628.88 902.426 1627.54 903.524 1626.99 904.564H1626.93V902.753H1622.99ZM1616.29 902.753H1620.41V915.992H1616.29V902.753Z" />
  </svg>
);

const FacebookIcon = () => (
  <svg aria-hidden="true" viewBox="1764.913 893.098 26.174 26.174" className="h-[19px] w-[19px]">
    <path fill="currentColor" d="M1789.1 905.313C1789.1 899.226 1784.17 894.286 1778.1 894.286C1772.03 894.286 1767.1 899.226 1767.1 905.313C1767.1 910.651 1770.89 915.095 1775.9 916.12V908.621H1773.7V905.313H1775.9V902.556C1775.9 900.428 1777.63 898.697 1779.75 898.697H1782.5V902.005H1780.3C1779.7 902.005 1779.2 902.501 1779.2 903.108V905.313H1782.5V908.621H1779.2V916.286C1784.76 915.734 1789.1 911.037 1789.1 905.313Z" />
  </svg>
);

const FooterTitle = ({ children, href }: { children: string; href?: string }) => {
  const content = (
    <h3 className="m-0 h-[21px] text-[13px] font-semibold uppercase leading-[20.6px] tracking-[0.13px] text-[#717171] transition-colors hover:text-[#E6FF2A]">
      {children}
    </h3>
  );
  if (href) {
    return (
      <Link href={href} className="no-underline">
        {content}
      </Link>
    );
  }
  return content;
};

const FooterLink = ({ href, children }: { href: string; children: string }) => (
  <Link
    href={href}
    className="block h-[19px] whitespace-nowrap text-[13px] font-normal leading-[19.3px] tracking-[0.26px] text-[#D9D9D9] no-underline transition-colors duration-200 hover:text-[#E6FF2A]"
  >
    {children}
  </Link>
);

const SocialLink = ({ href, label, children }: { href: string; label: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    aria-label={label}
    className="flex h-[46px] w-[46px] shrink-0 items-center justify-center text-[#F7F7F7] transition-colors duration-200 hover:text-[#E6FF2A]"
  >
    {children}
  </a>
);

export default function Footer() {
  return (
    <footer
      role="contentinfo"
      className={`${manrope.className} w-full bg-[#101010] text-[#D9D9D9]`}
      style={{ fontSynthesis: 'none', textRendering: 'geometricPrecision' }}
    >
      <div className="site-shell px-0 pt-[60px] max-[767px]:pt-[40px]">
        <div className="flex flex-col gap-[40px] max-[767px]:gap-[34px]">
          <div className="flex h-[70px] items-start max-[767px]:h-auto">
            <Link href="/" aria-label="Arsalynk home" className="inline-flex no-underline">
              <BrandLogo />
            </Link>
          </div>

          <div className="grid grid-cols-[minmax(220px,.85fr)_minmax(280px,1fr)_minmax(340px,1.35fr)] gap-x-[clamp(36px,5vw,96px)] max-[1100px]:grid-cols-2 max-[1100px]:gap-y-[46px] max-[767px]:grid-cols-1 max-[767px]:gap-y-[40px]">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3.5">
                <FooterTitle href="/about-us">ABOUT US</FooterTitle>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {ABOUT_LINKS.map((link) => (
                    <li key={link.href}>
                      <FooterLink href={link.href}>{link.name}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-3.5">
                <FooterTitle>EXPLORE</FooterTitle>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {EXPLORE_LINKS.map((link) => (
                    <li key={link.href}>
                      <FooterLink href={link.href}>{link.name}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-2.5">
                <FooterTitle href="/our-solution">CORE SOLUTIONS</FooterTitle>
                <FooterLink href="/our-solution#enterprise-resource-planning">Enterprise Resource Planning</FooterLink>
                <FooterLink href="/our-solution#internet-of-things">Internet of Things</FooterLink>
              </div>

              <div className="flex flex-col gap-3.5">
                <FooterTitle>OUR SERVICES</FooterTitle>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {SERVICE_LINKS.map((link) => (
                    <li key={link.href}>
                      <FooterLink href={link.href}>{link.name}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-3">
                <FooterTitle>JAKARTA OFFICE</FooterTitle>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Menara+Rajawali+Mega+Kuningan+Jakarta"
                  target="_blank"
                  rel="noreferrer"
                  className="m-0 text-[13px] font-normal leading-[19.3px] tracking-[0.26px] text-[#D9D9D9] no-underline transition-colors hover:text-[#E6FF2A]"
                >
                  <span className="block max-[1799px]:inline">Menara Rajawali 26th Floor Jl. DR. Ide Anak Agung Gde</span>{' '}
                  <span className="block max-[1799px]:inline">Agung, Jakarta, Indonesia 12950 →</span>
                </a>
              </div>

              {/* <div className="flex flex-col gap-3">
                <FooterTitle>SEMARANG HQ</FooterTitle>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=MG+Setos+Semarang+Indonesia"
                  target="_blank"
                  rel="noreferrer"
                  className="m-0 text-[13px] font-normal leading-[19.3px] tracking-[0.26px] text-[#D9D9D9] no-underline transition-colors hover:text-[#E6FF2A]"
                >
                  <span className="block max-[1799px]:inline">MG Setos, Jl. Inspeksi, 3rd Floor Kembangsari Subdistrict,</span>{' '}
                  <span className="block max-[1799px]:inline">Semarang Tengah District, Semarang City, Central Java</span>{' '}
                  <span className="block max-[1799px]:inline">50133, Indonesia →</span>
                </a>
              </div> */}

              <div className="flex flex-col gap-3">
                <FooterTitle>CONTACT</FooterTitle>
                <div className="flex flex-col gap-2.5">
                  <a
                    href={WHATSAPP_LINK}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-[9px] text-[13px] font-normal leading-[19.3px] tracking-[0.26px] text-[#D9D9D9] no-underline transition-colors hover:text-[#E6FF2A]"
                  >
                    <WhatsAppIcon />
                    <span>{WHATSAPP_PHONE_DISPLAY}</span>
                  </a>

                  <a
                    href="mailto:corporate.arsalynk@gmail.com"
                    className="flex items-center gap-[9px] text-[13px] font-normal leading-[19.3px] tracking-[0.26px] text-[#D9D9D9] no-underline transition-colors hover:text-[#E6FF2A]"
                  >
                    <MailIcon />
                    <span>corporate.arsalynk@gmail.com</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[52px] flex h-[78px] items-center justify-between border-t-[0.5px] border-t-[rgba(245,245,245,0.5)] py-[16px] max-[1100px]:mt-[46px] max-[767px]:mt-[42px] max-[767px]:h-auto max-[767px]:flex-col-reverse max-[767px]:items-center max-[767px]:gap-[14px] max-[767px]:py-[17px]">
          <p className="m-0 h-[19px] whitespace-nowrap text-[13px] font-normal leading-[19.3px] tracking-[0.26px] text-[#D9D9D9]">
            © 2026 PT Sinergi Muda Arsa
          </p>

          <div className="flex h-[46px] w-auto items-center gap-[9px] max-[767px]:h-auto max-[767px]:gap-[3px]">
            <SocialLink href="https://www.instagram.com/arsalynk?igsh=am8xZ3FpMncweXYz" label="Instagram"><InstagramIcon /></SocialLink>
            <SocialLink href="https://www.linkedin.com/company/arsalynk-group/" label="LinkedIn"><LinkedinIcon /></SocialLink>
            <SocialLink href="https://www.facebook.com/share/1bbYtBuoUd/" label="Facebook"><FacebookIcon /></SocialLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
