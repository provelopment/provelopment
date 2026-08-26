import { siteConfig } from "@/config";

export default function HomePage() {
  return (
    <>
      <header>
        <p>{siteConfig.name}</p>
        <h1>{siteConfig.tagline}</h1>
        <p>{siteConfig.description}</p>
      </header>

      <section aria-labelledby="home-about-heading">
        <h2 id="home-about-heading">About</h2>
        <p>{siteConfig.description}</p>
      </section>
    </>
  );
}