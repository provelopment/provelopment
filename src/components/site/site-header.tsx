import Link from "next/link";
import { siteConfig } from "@/config";

export function SiteHeader() {
    return (
        <header className="border-b border-border">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
                <div>
                    <Link
                        href="/"
                        className="font-semibold tracking-tight hover:text-primary"
                    >
                        {siteConfig.name}
                    </Link>
                </div>

                <nav aria-label="Primary navigation">
                    <ul className="flex items-center gap-4">
                        {siteConfig.navigation.map((item) => (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>
    );
}