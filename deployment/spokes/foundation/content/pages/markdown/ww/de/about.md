---
title: Über diese Foundation-Website
description: Was diese Live-Referenz zeigt, wie ihre Seiten erstellt werden, was Sie anpassen können und welche Rolle optionale Provelopment-Dienstleistungen spielen.
---

Diese Website ist eine Live-Referenz für die Open-Source-Vorlage Provelopment Foundation. Sie basiert auf dem öffentlich verfügbaren Foundation-Code, den Sie herunterladen, an Ihre Anforderungen anpassen und aus Ihrem eigenen Repository bereitstellen können.

# Was diese Website zeigt

Dies ist eine Referenzwebsite für Foundation und keine Kundenseite. Sie zeigt anhand einer tatsächlich betriebenen Website, wie die wichtigsten Bestandteile von Foundation zusammenspielen:

- eine Startseite im deklarativen JSON-Seitenformat
- diese Seite in Markdown
- gemeinsame Navigation und zentrale Website-Konfiguration
- zwei Sites: diese Website Global und eine Demonstrations-Website für Deutschland
- mehrere Sprachen, derzeit Deutsch und Englisch
- zwei Demonstrations-Standorte innerhalb der Website für Deutschland: Berlin und Frankfurt
- Seitenleisten- und Menüleistenansicht
- Auswahlmöglichkeiten für Site, Sprache, Standort und Layout

Die Website soll die Funktionen von Foundation nicht nur beschreiben, sondern praktisch zeigen. Gleichzeitig bietet sie einen brauchbaren Ausgangspunkt, an dem Sie sehen können, wie eine eigene Website aufgebaut und erweitert werden kann.

# Eine Website unter Ihrer Kontrolle

Foundation ist so aufgebaut, dass Sie die Kontrolle über Ihre Website behalten.

Seiten, Bilder und andere Inhalte liegen als Dateien in Ihrem Repository. Einstellungen und Verhalten der Website werden über Konfigurationsdateien festgelegt. Die Website wird aus diesen Dateien erstellt und ist nicht an einen geschlossenen Website-Baukasten gebunden.

Sie können die Website selbst betreuen, einen anderen Dienstleister damit beauftragen oder Provelopment-Dienstleistungen nutzen. Die Website und ihre Inhalte bleiben dabei unter Ihrer Kontrolle.

# Zwei Arten, Seiten zu erstellen

Foundation bietet zwei Möglichkeiten, Seiten zu erstellen.

**Markdown** eignet sich für einfache Inhaltsseiten. Es bleibt gut lesbarer Text und verwendet nur wenige Zeichen für Überschriften, Listen, Links und Hervorhebungen.

**Deklaratives JSON** eignet sich für Seiten, die stärker strukturiert werden sollen. Statt die gesamte Seite als Fließtext zu schreiben, legen Sie Bereiche wie einen Hero-Bereich, Spalten, Kacheln, Tabellen oder Frage-und-Antwort-Bereiche fest.

Diese Seite ist das Markdown-Beispiel. Die Startseite ist das JSON-Beispiel.

In beiden Fällen handelt es sich um normale Seiten. Die Datei enthält den Inhalt, ihr Speicherort bestimmt die Adresse, und veröffentlichte Seiten werden automatisch in die Sitemap aufgenommen.

# Sites, Sprachen, Standorte und Layout

Foundation kann eine einzelne Website ebenso abbilden wie eine Website für mehrere Länder, Sprachen, Standorte und Märkte. Diese Referenzinstallation ist so eingerichtet, dass die Besucher-Dimensionen im Zusammenspiel sichtbar werden:

- **Sprache** wählt, in welcher Sprache die aktive Website gelesen wird. Diese Website Global bietet Deutsch und Englisch, die Website für Deutschland dieselben zwei Sprachen — Sprachen gehören zu einer Website und nicht zu einer einzelnen Seite.
- **Standort** wählt einen physischen oder organisatorischen Kontext innerhalb einer Website, ohne einen zweiten Seitenbaum zu erzeugen. Diese Website Global besitzt keine eigenen Standorte, deshalb erscheint hier kein Standort-Bedienelement; die Website für Deutschland zeigt die Standorte *Berlin* und *Frankfurt*.
- **Layout** ändert nur die Darstellung der Oberfläche — Seitenleiste oder Menüleiste. Es ist eine Einstellung des Besuchers und gehört zu keiner Website; sie bleibt daher bei einem Wechsel von Sprache oder Standort erhalten.

Ein **Site**-Bedienelement gibt es nicht: welche Website Sie lesen, entscheidet die Adresse, und die Website für Deutschland ist über einen gewöhnlichen Link in der Fußzeile erreichbar. Jedes Bedienelement erscheint nur, wenn die entsprechende Konfiguration vorhanden ist: Diese Website Global zeigt deshalb zwei davon (**Layout** und **Sprache**), die Website für Deutschland drei (**Layout**, **Standort** und **Sprache**).

# Diese Konfiguration ist ein Beispiel

Sites, Sprachen und Standorte sind Konfiguration. Deutsch, Berlin und Frankfurt sind Demonstrationswerte — sie sind keine Aussagen über tatsächliche Standorte, Sprachen oder Märkte von Provelopment.

Wer Foundation einsetzt, ersetzt sie durch die eigenen Angaben und kann mit wachsender Website Sites, Sprachen und Standorte hinzufügen oder entfernen.

# Open Source als Grundlage

**Foundation ist kostenlos und Open Source: herunterladen, bereitstellen, anpassen und zu Ihrer eigenen Website machen.**

Provelopment-Dienstleistungen sind optional. Provelopment kann eine Foundation-Website aufbauen, erweitern oder pflegen, aber Sie benötigen diese Leistungen nicht, um die Website weiterhin zu nutzen.

Ihr Repository bleibt die Grundlage Ihrer Website. Dadurch können Sie sie selbst betreiben, von jemand anderem betreuen lassen oder auf einer anderen Infrastruktur bereitstellen.

# Mehr erfahren

Auf [foundation.provelopment.com](https://foundation.provelopment.com/) erfahren Sie mehr über Provelopment Foundation und die Möglichkeiten der Plattform.

Der Quellcode der Vorlage, die technische Dokumentation und die Anleitungen finden Sie im [öffentlichen Provelopment Foundation Repository](https://github.com/provelopment/provelopment-foundation).