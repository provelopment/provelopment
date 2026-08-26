import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarkdownContent } from "@/components/site/markdown-content";

const pageContentRepository = createFileSystemPageContentRepository();

export async function generateMetadata(): Promise<Metadata> {
  const content = await pageContentRepository.findBySlug("about");
  return { title: content?.title ?? "About" };
}

export default async function AboutPage() {
  const content = await pageContentRepository.findBySlug("about");

  if (!content) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>
    </article>
  );
}