---
title: About this Foundation website
description: What this live reference site demonstrates, how its pages are created, what you can change, and how Foundation relates to optional Provelopment services.
---

This website is a live reference for the open-source Provelopment Foundation template. It is built from the publicly available Foundation code, which you can download, adapt to your needs and deploy from your own repository.

# What this site demonstrates

This is a Foundation reference site, not a client website. It uses a working website to show how the main parts of Foundation fit together:

- a Home page created with the declarative JSON page format
- this About page created with Markdown
- shared navigation and site configuration
- two websites in one Foundation Installation: this Global website and a demonstration Germany website
- multiple languages, currently English and German
- two demonstration locations inside the Germany website: Berlin and Frankfurt
- Sidebar and Menu-bar layouts
- controls for language, location and layout

The purpose is not simply to describe what Foundation can do. This site lets you see those capabilities working together and provides a practical starting point for understanding how your own site can be structured and extended.

# A website you control

Foundation is designed so that you remain in control of your website.

Pages, images and other site content are stored as files in your repository. Site settings and behaviour are defined through configuration files. The website is built from those files rather than being held inside a closed website-building account.

You can maintain the site yourself, ask another provider to maintain it, or use Provelopment services. The website and its content remain under your control.

# Two ways to create pages

Foundation provides two ways to create pages.

**Markdown** is intended for straightforward content pages. It remains easy-to-read text, using simple notation for headings, lists, links and emphasis.

**Declarative JSON** is intended for pages that need more structure. Instead of writing the entire page as prose, you define sections such as a hero, columns, cards, tables or question-and-answer sections.

This page is the Markdown example. The Home page is the JSON example.

Both are ordinary pages. The file contains the content, its location determines its route, and published pages are included in the site's sitemap automatically.

# Sites, languages, locations and layout

Foundation can support a simple website just as well as one serving several countries, languages, locations and markets. This reference deployment is configured so that the visitor dimensions can be seen working together:

- **Language** chooses how this website is read. This website Global offers English and German, and the Germany website offers the same two languages, because languages belong to a website rather than to a single page.
- **Location** chooses a physical or service context inside a website, without creating another page tree. This website Global has no locations of its own, so no Location control appears here; the Germany website demonstrates *Berlin* and *Frankfurt*.
- **Layout** changes only how the interface is presented — Sidebar or Menu bar. It is a visitor preference that belongs to no website, so it survives a change of language or location.

There is no **Site** control: which website you are reading is decided by its address, and the Germany website is reachable through an ordinary link in the footer. Every control appears only when the corresponding configuration exists, which is why this website Global shows two of them (**Layout** and **Language**) and the Germany website shows three (**Layout**, **Location** and **Language**).

# This configuration is an example

Sites, languages and locations are configuration. German, Berlin and Frankfurt are demonstration values — they are not statements about Provelopment's own offices, languages or markets.

An adopter replaces them with their own information, and can add or remove sites, languages and locations as their website develops.

# Open source as the foundation

**Foundation is free and open source: download it, deploy it, modify it and make it your own.**

Provelopment services are optional. Provelopment can build, extend or maintain a Foundation site, but you do not need those services to continue using the website.

Your repository remains the source of your site. You can operate it yourself, have someone else maintain it, or deploy it on different infrastructure.

# Learn more

Visit [foundation.provelopment.com](https://foundation.provelopment.com/) to learn more about Provelopment Foundation and what the platform provides.

The template source code, technical documentation and instruction manuals are available in the [public Provelopment Foundation repository](https://github.com/provelopment/provelopment-foundation).