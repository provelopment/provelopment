import type { Metadata } from "next";
import { siteConfig } from "@/config";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <>
      <h1>About</h1>
      <p>{siteConfig.description}</p>
    </>
  );
}