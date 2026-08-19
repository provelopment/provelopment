import Link from "next/link";
import { siteConfig } from "@/config";

export function SiteHeader() {
    return (
        <header>
            <div>
                <Link href="/">{siteConfig.name}</Link>
            </div>

            <nav aria-label="Primary navigation">
                <ul>
                    {siteConfig.navigation.map((item) => (
                        <li key={item.href}>
                            <Link href={item.href}>{item.label}</Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </header>
    );
}