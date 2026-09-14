import Link from "next/link";
import { locale } from "next/root-params";
import { getDictionary } from "@/config/i18n";
import { StatusGraphic } from "@/components/site/status-graphic";
import { Section } from "@/components/ui/section";

export default async function NotFound() {
  const currentLocale = await locale();
  const dictionary = getDictionary(currentLocale);

  return (
    <Section className="py-24 text-center">
      {/* P12-SG — optional decorative status graphic (ONE role shared with
          `error.tsx`, which renders this identical status frame). Renders
          NOTHING when unconfigured, so the heading/message/link below remain the
          complete expression of the state. */}
      <StatusGraphic />
      <h1 className="text-4xl font-bold tracking-tight">
        {dictionary.notFound.title}
      </h1>
      <p className="mt-4 text-muted-foreground">{dictionary.notFound.message}</p>
      <p className="mt-6">
        <Link
          href={`/${currentLocale}`}
          className="font-medium text-primary hover:underline"
        >
          {dictionary.notFound.returnHome}
        </Link>
      </p>
    </Section>
  );
}