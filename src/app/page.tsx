import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        <header>
          <p>{siteConfig.name}</p>
          <h1>{siteConfig.tagline}</h1>
          <p>{siteConfig.description}</p>
        </header>

        <section aria-labelledby="contact-heading">
          <h2 id="contact-heading">Contact</h2>

          {siteConfig.contact.email ? (
            <p>
              <a href={`mailto:${siteConfig.contact.email}`}>
                {siteConfig.contact.email}
              </a>
            </p>
          ) : null}

          {siteConfig.contact.phone ? (
            <p>
              <a href={`tel:${siteConfig.contact.phone}`}>
                {siteConfig.contact.phone}
              </a>
            </p>
          ) : null}
        </section>

        <section aria-labelledby="social-heading">
          <h2 id="social-heading">Connect</h2>

          <ul>
            {siteConfig.socialLinks.map((socialLink) => (
              <li key={socialLink.platform}>
                <a
                  href={socialLink.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {socialLink.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}