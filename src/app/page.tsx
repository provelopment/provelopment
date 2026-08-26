import { siteConfig } from "@/config";

export default function HomePage() {
  return (
    <>
      <header className="mx-auto max-w-4xl px-4 pt-16 pb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          {siteConfig.name}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {siteConfig.tagline}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {siteConfig.description}
        </p>
      </header>

      <section
        aria-labelledby="home-about-heading"
        className="mx-auto max-w-4xl px-4 pb-16"
      >
        <div className="rounded-lg border border-border bg-accent p-6">
          <h2 id="home-about-heading" className="text-xl font-semibold">
            About
          </h2>
          <p className="mt-2 text-muted-foreground">{siteConfig.description}</p>
        </div>
      </section>
    </>
  );
}