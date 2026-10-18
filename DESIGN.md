---
name: Workspace Manager Bibliothek
description: Karteikatalog im ComfyUI-Panel - Schubladenschrank, Karteikarten, Bernstein als einzige Aktionsfarbe.
colors:
  warmton: "#b07a3a"
  grund: "color-mix(in srgb, var(--comfy-menu-bg, #262729) 90%, #b07a3a 10%)"
  karte: "color-mix(in srgb, {colors.grund} 86%, var(--fg-color, #fff) 14%)"
  schrank: "color-mix(in srgb, {colors.grund} 78%, #000 22%)"
  linie: "color-mix(in srgb, {colors.grund} 70%, var(--fg-color, #fff) 30%)"
  linie-leise: "color-mix(in srgb, {colors.grund} 84%, var(--fg-color, #fff) 16%)"
  eingabe: "color-mix(in srgb, {colors.grund} 92%, #000 8%)"
  text: "var(--fg-color, #eee)"
  text-2: "color-mix(in srgb, {colors.text} 68%, {colors.grund} 32%)"
  bernstein: "#c77a12"
  auf-bernstein: "#1d1a17"
  bernstein-text: "color-mix(in srgb, #e0a04a 80%, {colors.text} 20%)"
  ocker: "color-mix(in srgb, #e8c27a 28%, {colors.grund} 72%)"
  ocker-linie: "color-mix(in srgb, #d3ab5c 45%, {colors.grund} 55%)"
typography:
  titel: {fontFamily: "var(--font-inter), Segoe UI, sans-serif", fontSize: "40px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.015em"}
  zeile: {fontFamily: "var(--font-inter), Segoe UI, sans-serif", fontSize: "14px", fontWeight: 400}
  steuerung: {fontFamily: "var(--font-inter), Segoe UI, sans-serif", fontSize: "13px", fontWeight: 400}
  signatur: {fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em"}
rounded: {standard: "2px"}
spacing: {xs: "4px", sm: "8px", md: "12px", lg: "16px", rand: "24px"}
components:
  knopf: {backgroundColor: "{colors.eingabe}", textColor: "{colors.text}", rounded: "{rounded.standard}", height: "28px", padding: "0 12px"}
  knopf-haupt: {backgroundColor: "{colors.bernstein}", textColor: "{colors.auf-bernstein}", rounded: "{rounded.standard}", height: "34px"}
  chip: {backgroundColor: "{colors.ocker}", textColor: "{colors.text}", rounded: "{rounded.standard}", height: "28px", padding: "0 9px"}
  chip-an: {backgroundColor: "{colors.bernstein}", textColor: "{colors.auf-bernstein}"}
  karteikarte: {backgroundColor: "{colors.karte}", textColor: "{colors.text}", rounded: "{rounded.standard}", width: "216px", height: "296px"}
  schrank-zeile: {textColor: "{colors.text}", height: "34px"}
  eingabe: {backgroundColor: "{colors.eingabe}", textColor: "{colors.text}", rounded: "{rounded.standard}", height: "30px", padding: "0 10px"}
---

# Design System: Workspace Manager Bibliothek

## Overview

**Creative North Star: "Der Karteikatalog"**

Die Bibliothek ist ein Zettelkatalog: links der Schubladenschrank mit Reitern, rechts das Findbuch mit Karteikarten. Jeder Eintrag (Modell, Medium, Rezept, Workflow) ist eine Karte mit Signaturzeile. Das Panel ist ein Werkzeug (Operate): dicht, ruhig, in Sekunden benutzt und wieder verlassen. Es gilt `.lib-root`; Quelle sind `ui/src/library/library.css` und `ui/src/model-manager/models.css`.

Das Warmton-Grau folgt dem ComfyUI-Theme: alle Flächen werden per `color-mix` aus `--comfy-menu-bg` und `--fg-color` mit 10 % Warmton (#b07a3a) abgeleitet. Hell und dunkel gibt es daher nicht als zwei Paletten, sondern als eine Ableitung.

**Key Characteristics:**
- Flächen entstehen durch Tonstufen und 1-px-Linien, nicht durch Schatten oder Glas.
- Eine Aktionsfarbe (Bernstein), eine Ordnungsfarbe (Ocker).
- Monospace nur für Signaturen, Zahlen, Gruppenbeschriftung, Fuß.
- Radius überall 2 px; Tabellenziffern auf der ganzen Wurzel.

## Colors

Warmes Steingrau, vom Host-Theme abgeleitet, mit Bernstein als einziger Aktionsfarbe.

### Primary
- **Bernstein** (#c77a12): aktive Lasche im Schrank, Hauptknopf, aktiver Chip, Fortschrittsbalken (5 px), Fokusring, Auswahlfarbe, Hover-Rand der Knöpfe, Topbar-Knopf „Bibliothek" im geöffneten Zustand.
- **Auf Bernstein** (#1d1a17): Text und Icons auf Bernstein.
- **Bernstein-Text** (Ableitung aus #e0a04a): Bernstein als Schriftfarbe (Treffer-Meta, Favorit, Sterne, gedrückter Knopf), weil #c77a12 auf Dunkel als Text zu schwach ist.

### Secondary
- **Ocker** (Ableitung aus #e8c27a, 28 %): Filter-Chips und Hover-Tönung; Linie 45 % aus #d3ab5c.

### Neutral
- **Grund / Karte / Schrank:** Grund = Menühintergrund + 10 % Warmton. Karte = Grund + 14 % Vordergrund (heller als Grund). Schrank = Grund + 22 % Schwarz (tiefer als Grund).
- **Linie / Linie leise:** Grund + 30 % bzw. 16 % Vordergrund. Linie für Rahmen, leise für Zeilentrenner.
- **Eingabe:** Grund + 8 % Schwarz für Eingaben, Knöpfe, Vorschaufläche.
- **Text / Text 2:** Host-Vordergrund; Text 2 = 68 % Text auf Grund für Zweitinfos, Zahlen, Signatur.

### Named Rules
**The Eine-Aktion Rule.** Bernstein markiert nur "hier bist du", "das ist die Hauptaktion" oder "das läuft". Nie Dekoration, nie Fläche größer als ein Knopf, eine Lasche oder ein Balken.
**The Host-Theme Rule.** Neue Flächen werden aus `--comfy-menu-bg`/`--fg-color` per color-mix abgeleitet, nie als feste Hex-Grautöne.

## Typography

**Schrift:** `--font-inter` des Hosts (Rückfall Segoe UI / Systemschrift), identisch zur ComfyUI-Oberfläche.
**Mono:** ui-monospace, Cascadia Mono, Consolas.

**Character:** Eine Sachschrift plus eine Maschinenschrift für alles, was Katalogangabe ist.

### Hierarchy
- **Titel** (700, 40px, 1.1, -0.015em): Findbuch-Kopf; 24 px im angedockten Zustand.
- **Zeile** (400/600, 14px): Schrankzeilen, Kartenname (600), Bestandszeile.
- **Steuerung** (13px; Chips/Meta 12px): Knöpfe, Eingaben, Kartenmeta.
- **Signatur** (Mono 600, 11px, 0.08em, Versalien): erste Zeile jeder Karte. Gruppenbeschriftung im Schrank Mono 600 11px, 0.14em; Zahlen und Fuß Mono 12px.

### Named Rules
**The Signatur Rule.** Was Mono ist, ist Katalogangabe (Art, Zahl, Pfad, Fuß). Fließtext und Namen nie in Mono.

## Layout

Fenster zentriert, Breite min(1440px, 100vw-48px), Oberkante max(64px,5vh), unten 24 px Rand. Innen: Schrank 240 px (schmal 52 px) und Hauptspalte aus Kopf, Werkzeugzeile, scrollendem Raster, Fuß (36 px).
Raster fester Karten: 216x296 px (kompakt 164x232), Abstand 14x16 px (kompakt 10x12), Seitenrand 24 px. Spacing-Rhythmus 4/8/12/16/24; Knopfhöhen 28/30/34 px. Dichte hoch, Kartengrößen nie fließend.

## Elevation & Depth

Tonal geschichtet: Schrank (tiefer) < Grund < Karte (heller), getrennt durch 1-px-Linien. Schatten nur für das schwebende Fenster (`0 12px 40px rgba(0,0,0,.45)`) und die angedockte Leiste (`±6px 0 24px rgba(0,0,0,.3)`). Das Fenster liegt über einer Abdunklung `rgba(20,18,16,.45)` ohne Unschärfe. Popover/Menüs im Bereich Modelle: kein Schatten, Karte + Linie.

**The Flach-im-Fenster Rule.** Innerhalb des Fensters kein Schatten; Tiefe nur durch Tonstufe und Linie.

## Shapes

Radius 2 px für alles (Knöpfe, Chips, Karten, Eingaben, Fenster); im Bereich Modelle werden Chakra-Radien md/lg/full auf 2 px gebogen. Keine Pillen. Laschen sind rechts gerundet (0 2px 2px 0). Rahmen 1 px.

## Components

### Schrank-Seitenleiste
Hintergrund Schrank, rechts Linie, 240 px. Gruppenköpfe (ARBEIT/MODELLE/SYSTEM) als Mono-Schubladenbeschriftung mit Unterlinie. Zeile 34 px: Lasche links (8x20, Linie), Name, Zahl rechts in Mono. Hover: Karte 55 %. Aktiv: Karte-Fläche, 600, Lasche 16 px breit in Bernstein. Schmal (52 px): nur Lasche und Icon, Gruppen als Haarlinie.

### Findbuch-Kopf
Titel 40 px, darunter Bestandszeile 14 px Text 2, Hauptaktion und Schließen rechts, Unterlinie. Brotkrumen in Mono 12 px.

### Werkzeugzeile
Flex, Umbruch, Abstand 10 px, Padding 12x24, leise Unterlinie: Suche (240 px), Typ-Chips, Auswahlen (max 200 px), Sortierung, Ansichtsumschalter (aria-pressed: Bernstein-Rand und -Text).

### Karteikarte
Karte-Fläche, 1-px-Linie, 2 px. Aufbau: Signatur (Mono, leise Unterlinie) / Name 14 px 600 / Vorschau (Rand leise, cover, Platzhalter Mono) / Meta 12 px. Meta "hot" = Bernstein-Text 600. Fortschrittsbalken 5 px Bernstein am unteren Rand. Aktionen (Favorit, Download) erscheinen erst bei Hover/Fokus in der Vorschau.

### Chips und Knöpfe
Knopf 28 px, Eingabe-Fläche, Linie, Hover: Bernstein-Rand. Hauptknopf 34 px Bernstein-Fläche, 600. Icon-Knopf 34x34. Chip 28 px Ocker, 12 px; an = Bernstein-Fläche, 600. Eingaben 30 px. Deaktiviert 50 % Deckkraft. Fokus: 2 px Bernstein, 1 px Abstand.

### Topbar in der ComfyUI-Actionbar
In ComfyUIs Leiste eingehängt (Portal), Schrift wie Host. Zwei Gruppen mit 1-px-Trenner: links Workflow (Titel-Menü, Galerie), rechts Bibliothek (Knopf Bernstein wenn offen, sonst Grau 18 %), Modell-Download-Ring, Andocken (offen = Bernstein 40 %), Einstellungen. Freischwebend: 42 px, Hintergrund Menü + 8 % Warmton, 2 px Radius, Ziehgriff mit Deckkraft .45.

### Dock-Modus
Fixiert rechts (oder links ab 60 px) unter der Leiste (Standard top 52 px), Breite ziehbar über 6-px-Griff (Hover Bernstein), keine Abdunklung, Linie + Schatten zur Leinwand. Schrank schmal, Titel 24 px, Umschalter oben (Seite wechseln, Fenster). Topbar tritt zurück, solange offen.

## Bewegung

Einzige Signatur: Lasche 8 auf 16 px, 120 ms, `cubic-bezier(.16,1,.3,1)`. Topbar-Ziehgriff 150 ms Deckkraft. `prefers-reduced-motion` schaltet die Lasche ab. Keine weiteren Animationen.

## Do's and Don'ts

### Do:
- **Do** neue Bereiche mit Schrank-Eintrag, Findbuch-Kopf, Werkzeugzeile und Karteikarten (Signatur zuerst) aufbauen.
- **Do** Fremdkomponenten (Chakra) im Bereich auf `--lib-*` umbiegen wie in `models.css`.
- **Do** Esc einen Schritt zurück gehen lassen; Zustand bleibt erhalten.

### Don't:
- **Don't** Unschärfe/Glas/Backdrop für Chrome; Abdunklung bleibt flach.
- **Don't** Pillen, runde Glanzkarten, Verläufe, Reiter oben oder ein Blau auf Grau (verweigertes Dashboard-Default).
- **Don't** Bernstein für Dekoration oder große Flächen.
- **Don't** feste Hex-Grautöne statt abgeleiteter Tokens.

## Bekannte Lücken (Stand 18.10.2026)

- Nur der Bereich Modelle (Installiert, Entdecken) ist im neuen Stil; Galerie, Prompts, Workflows und Einstellungen zeigen noch alten Inhalt im neuen Rahmen.
- Topbar-Knöpfe nutzen feste Werte (#c77a12, #1d1a17, rgba grau) statt `--lib-*`, da außerhalb `.lib-root`.
- Hell-Werte aus dem Contract (#e9e6e1 usw.) sind im Bau nur als Ableitung vorhanden, nicht als Festwerte.
- NSFW-Vorschauen nutzen `blur(20px)` als Inhaltsschutz; das ist keine Chrome-Unschärfe und kein Systemmuster.
- Kompaktleisten-Reiter (schmal) laut Contract noch offen.
