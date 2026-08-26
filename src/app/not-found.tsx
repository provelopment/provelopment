import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-4 text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <p className="mt-6">
        <Link href="/" className="font-medium text-primary hover:underline">
          Return home
        </Link>
      </p>
    </section>
  );
}