# Settings-Panel-Umbau — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Settings-Panel (`WorkspaceSettingsModal`) in nach Nutzen gruppierte Karten im Hausstil umbauen, mit Toggle-Switches + Live-Übernahme, den Civitai-API-Key hineinziehen, und die NSFW-Adult/Blur-Logik entkoppeln (Toolbar-Button → nur Host).

**Architecture:** Ein Modal mit gruppierten Karten (eine Spalte). Ein neuer `CommonToggleSetting` (Chakra `Switch`) löst die Checkbox ab und schreibt live via `userSettingsTable` ohne „please refresh"-Toast. Ein neuer `CivitaiApiKeySetting` kapselt das maskierte Key-Feld (localStorage via `setCivitApiKey`). `WorkspaceSettingsModal` hält den Adult-Zustand als State, um den Blur-Toggle abhängig zu deaktivieren. `NsfwToggleButton` wird auf Host-only zurückgebaut.

**Tech Stack:** React 18, Chakra UI, TypeScript, Vite. `@tabler/icons-react`. Keine neue Abhängigkeit.

## Global Constraints

- **Produktion nicht anfassen:** echte ComfyUI = Port 8188, `G:\ComfyUI`. Verifikation nur in Testumgebung Port **8189**.
- **Keine neue npm-Abhängigkeit.**
- **Hausstil:** dunkles Anthrazit + Blau als einziger heller Leitakzent; getönte Semantik (Warn-Rot, getönt-roter Schließen-Button `bg rgba(245,101,101,0.14)` / `border red.400` / `color red.300`). Tokens: `galleryPanelBg`, `rowBorderColor`, `hideScrollbarSx`.
- **Kein Unit-Test-Framework:** Verifikations-Gate ist `npm run build` (in `ui/`) ohne NEUE Fehler. `npm run lint`/`tsc` sind projektweit vorbestehend kaputt (~50 unrelated Fehler) — kein Blocker/Finding.
- **NSFW entkoppelt:** `civitaiIncludeAdultContent` = Host; `showNsfwModelThumbnail` = Blur (an = unverblurrt; Standard aus = verblurrt). Blur-Toggle deaktiviert, wenn Adult aus.
- **Commit-Konvention:** Source-Commit(s) + separater `dist`-Rebuild-Commit; beim Commit nur `ui/src/**`, **nicht** `dist/`. (dist liegt im Repo-Root unter `dist/workspace_web/`.)
- **Ablauf:** bauen → Screenshots zeigen → erst auf explizites „OK" committen/aufräumen; Testserver nicht sofort stoppen.
- **Per-Task-Gate:** `npm run build` grün; nur Source stagen.

## File Structure

- **Create** `ui/src/settings/CommonToggleSetting.tsx` — Switch-basiertes Toggle-Setting (löst Checkbox ab): Label + Hilfetext + optional Warnung/Note/Disabled, schreibt live, kein Refresh-Toast, optionaler `onAfterChange`-Callback.
- **Create** `ui/src/settings/CivitaiApiKeySetting.tsx` — maskiertes API-Key-Feld + Speichern/Löschen (via `getCivitApiKey`/`setCivitApiKey`).
- **Modify** `ui/src/settings/SettingsSection.tsx` — von Heading+Divider zu Hausstil-**Karte**.
- **Modify** `ui/src/settings/CommonNumberSetting.tsx` — „Setting saved"-Toast entfernen (stille Live-Übernahme).
- **Modify** `ui/src/RecentFilesDrawer/WorkspaceSettingsModal.tsx` — kompletter Umbau: Hausstil-Chrome, getönt-roter Schließen-Button, gruppierte Karten (Civitai zuerst), Toggles, API-Key, Blur-abhängig-deaktiviert, „Erweitert"-Accordion für Zwei-Wege-Sync.
- **Modify** `ui/src/model-manager/models-list-drawer/NsfwToggleButton.tsx` — auf Host-only zurückbauen.
- **Delete (falls ungenutzt)** `ui/src/settings/CommonCheckboxSettings.tsx` — ersetzt durch `CommonToggleSetting`.

`SelectMyWorkflowsDir`, `ShortcutSettings`, `TwoWaySyncSettings` bleiben **unverändert** (nur in die neuen Karten gesetzt).

---

### Task 1: `CommonToggleSetting` + Number-Toast entfernen

**Files:**
- Create: `ui/src/settings/CommonToggleSetting.tsx`
- Modify: `ui/src/settings/CommonNumberSetting.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface CommonToggleSettingProps {
    settingKey: keyof UserSettings;
    label: string;
    helpText?: string;
    warning?: string;
    note?: string;
    isDisabled?: boolean;
    onAfterChange?: (value: boolean) => void;
  }
  export default function CommonToggleSetting(props: CommonToggleSettingProps): JSX.Element
  ```

- [ ] **Step 1: Toggle-Komponente anlegen**

Create `ui/src/settings/CommonToggleSetting.tsx`:

```tsx
import { Box, Flex, Switch, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import type { UserSettings } from "../types/dbTypes";

interface CommonToggleSettingProps {
  settingKey: keyof UserSettings;
  label: string;
  helpText?: string;
  warning?: string;
  note?: string;
  isDisabled?: boolean;
  onAfterChange?: (value: boolean) => void;
}

export default function CommonToggleSetting({
  settingKey,
  label,
  helpText,
  warning,
  note,
  isDisabled = false,
  onAfterChange,
}: CommonToggleSettingProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    userSettingsTable?.getSetting(settingKey).then((res) => setChecked(!!res));
  }, [settingKey]);

  const onToggle = async (next: boolean) => {
    // The switch flipping IS the "saved" feedback - no intrusive toast.
    setChecked(next);
    await userSettingsTable?.upsert({ [settingKey]: next });
    onAfterChange?.(next);
  };

  return (
    <Flex
      align={"flex-start"}
      justify={"space-between"}
      gap={4}
      opacity={isDisabled ? 0.5 : 1}
    >
      <Box>
        <Text fontWeight={500} fontSize={"sm"}>
          {label}
        </Text>
        {helpText && (
          <Text fontSize={"xs"} color={"gray.500"} mt={0.5}>
            {helpText}
          </Text>
        )}
        {warning && (
          <Text fontSize={"xs"} color={"red.300"} mt={1}>
            ⛔️ {warning}
          </Text>
        )}
        {note && (
          <Text fontSize={"xs"} color={"blue.300"} mt={1}>
            {note}
          </Text>
        )}
      </Box>
      <Switch
        isChecked={checked}
        isDisabled={isDisabled}
        colorScheme={"blue"}
        onChange={(e) => onToggle(e.target.checked)}
        flexShrink={0}
        mt={1}
      />
    </Flex>
  );
}
```

- [ ] **Step 2: „Setting saved"-Toast aus `CommonNumberSetting` entfernen**

In `ui/src/settings/CommonNumberSetting.tsx` den `onBlur`-Toast entfernen. Ersetze die `onBlur`-Funktion durch:

```tsx
  const onBlur = async () => {
    if (inputNumber < 0) {
      setInputNumber(0);
    }
    await userSettingsTable?.upsert({
      [settingKey]: Number(inputNumber),
    });
  };
```

Danach ist `useToast` in der Datei ungenutzt — entferne `useToast` aus dem `@chakra-ui/react`-Import und die `const toast = useToast();`-Zeile.

- [ ] **Step 3: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler.

- [ ] **Step 4: Commit (nur Source)**

```bash
git add ui/src/settings/CommonToggleSetting.tsx ui/src/settings/CommonNumberSetting.tsx
git commit -m "feat(settings): Switch-basiertes Toggle-Setting, Number-Toast entfernt"
```

---

### Task 2: `CivitaiApiKeySetting`

**Files:**
- Create: `ui/src/settings/CivitaiApiKeySetting.tsx`

**Interfaces:**
- Consumes: `getCivitApiKey()`, `setCivitApiKey(apiKey: string)` from `../utils/civitUtils`.
- Produces: `export default function CivitaiApiKeySetting(): JSX.Element`

- [ ] **Step 1: Komponente anlegen**

Create `ui/src/settings/CivitaiApiKeySetting.tsx`:

```tsx
import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
} from "@chakra-ui/react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useState } from "react";
import { getCivitApiKey, setCivitApiKey } from "../utils/civitUtils";

export default function CivitaiApiKeySetting() {
  const [value, setValue] = useState(getCivitApiKey() ?? "");
  const [hasKey, setHasKey] = useState(!!getCivitApiKey());
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setCivitApiKey(value.trim());
    setHasKey(!!value.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const clear = () => {
    setCivitApiKey("");
    setValue("");
    setHasKey(false);
  };

  return (
    <Box>
      <Text fontWeight={500} fontSize={"sm"}>
        Civitai API-Key
      </Text>
      <Text fontSize={"xs"} color={"gray.500"} mt={0.5} mb={2}>
        Manche Civitai-Modelle erfordern zum Download einen API-Key (Login).
      </Text>
      <Flex gap={2} align={"center"} wrap={"wrap"}>
        <InputGroup size={"sm"} maxW={"420px"}>
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={"API-Key einfügen"}
            borderRadius={"md"}
          />
          <InputRightElement>
            <IconButton
              size={"xs"}
              variant={"ghost"}
              aria-label={"toggle key visibility"}
              icon={show ? <IconEyeOff size={15} /> : <IconEye size={15} />}
              onClick={() => setShow((s) => !s)}
            />
          </InputRightElement>
        </InputGroup>
        <Button
          size={"sm"}
          colorScheme={"blue"}
          onClick={save}
          isDisabled={!value.trim()}
        >
          {saved ? "Gespeichert ✓" : "Speichern"}
        </Button>
        {hasKey && (
          <Button size={"sm"} variant={"ghost"} onClick={clear}>
            Löschen
          </Button>
        )}
      </Flex>
    </Box>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler.

- [ ] **Step 3: Commit (nur Source)**

```bash
git add ui/src/settings/CivitaiApiKeySetting.tsx
git commit -m "feat(settings): Civitai-API-Key-Feld (maskiert, Speichern/Loeschen)"
```

---

### Task 3: `SettingsSection` als Hausstil-Karte

**Files:**
- Modify: `ui/src/settings/SettingsSection.tsx`

**Interfaces:**
- Produces (unverändert): `export default function SettingsSection({ title, children }: { title: string; children: ReactNode }): JSX.Element`

- [ ] **Step 1: Zu Karte umbauen**

Ersetze den kompletten Inhalt von `ui/src/settings/SettingsSection.tsx`:

```tsx
import { Box, Stack, Text } from "@chakra-ui/react";
import { ReactNode } from "react";

// House-style settings card: charcoal panel, hairline border, uppercase label.
export default function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      bg={"galleryPanelBg"}
      border={"1px solid"}
      borderColor={"rowBorderColor"}
      borderRadius={"lg"}
      p={4}
    >
      <Text
        fontSize={"xs"}
        textTransform={"uppercase"}
        letterSpacing={"wider"}
        color={"gray.500"}
        mb={3}
      >
        {title}
      </Text>
      <Stack spacing={4}>{children}</Stack>
    </Box>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler.

- [ ] **Step 3: Commit (nur Source)**

```bash
git add ui/src/settings/SettingsSection.tsx
git commit -m "feat(settings): SettingsSection als Hausstil-Karte"
```

---

### Task 4: `WorkspaceSettingsModal` neu aufbauen

**Files:**
- Modify: `ui/src/RecentFilesDrawer/WorkspaceSettingsModal.tsx`
- Delete (falls ungenutzt): `ui/src/settings/CommonCheckboxSettings.tsx`

**Interfaces:**
- Consumes: `CommonToggleSetting` (Task 1), `CivitaiApiKeySetting` (Task 2), `SettingsSection` (Task 3), `CommonNumberSetting`, `SelectMyWorkflowsDir`, `ShortcutSettings`, `TwoWaySyncSettings`, `hideScrollbarSx` (aus `../model-manager/utils`), `userSettingsTable`.

- [ ] **Step 1: Modal neu aufbauen**

Ersetze den kompletten Inhalt von `ui/src/RecentFilesDrawer/WorkspaceSettingsModal.tsx`:

```tsx
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { ShortcutSettings } from "../settings/ShortcutSettings";
import TwoWaySyncSettings from "../settings/TwoWaySyncSettings";
import CommonToggleSetting from "../settings/CommonToggleSetting";
import CivitaiApiKeySetting from "../settings/CivitaiApiKeySetting";
import SelectMyWorkflowsDir from "../settings/SelectMyWorkflowsDir";
import { CommonNumberSetting } from "../settings/CommonNumberSetting";
import SettingsSection from "../settings/SettingsSection";
import { hideScrollbarSx } from "../model-manager/utils";
import { userSettingsTable } from "../db-tables/WorkspaceDB";

export default function WorkspaceSettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  // Adult host state drives whether the NSFW-blur toggle is meaningful.
  const [adultOn, setAdultOn] = useState(false);
  useEffect(() => {
    userSettingsTable
      ?.getSetting("civitaiIncludeAdultContent")
      .then((r) => setAdultOn(!!r));
  }, []);

  return (
    <Modal isOpen={true} onClose={onClose} size={"2xl"} scrollBehavior={"inside"}>
      <ModalOverlay />
      <ModalContent maxH={"85vh"}>
        <Flex
          align={"center"}
          px={5}
          py={3}
          pr={14}
          bg={"galleryPanelBg"}
          borderBottom={"1px solid"}
          borderColor={"rowBorderColor"}
          borderTopRadius={"md"}
        >
          <Heading size={"md"}>Einstellungen</Heading>
        </Flex>
        <ModalCloseButton
          top={3}
          right={4}
          size={"md"}
          borderRadius={"md"}
          border={"1px solid"}
          borderColor={"red.400"}
          color={"red.300"}
          bg={"rgba(245, 101, 101, 0.14)"}
          _hover={{ bg: "rgba(245, 101, 101, 0.3)", color: "white" }}
          _active={{ bg: "rgba(245, 101, 101, 0.42)" }}
        />
        <ModalBody py={5} sx={hideScrollbarSx}>
          <VStack spacing={4} align={"stretch"}>
            <SettingsSection title={"Civitai"}>
              <CommonToggleSetting
                settingKey={"civitaiIncludeAdultContent"}
                label={"Adult-Inhalte (18+) anzeigen"}
                helpText={
                  "Nutzt civitai.red statt civitai.com für Suche, Hash-Lookup, Downloads und Links, sodass NSFW-Modelle gefunden und installiert werden können."
                }
                onAfterChange={(v) => {
                  setAdultOn(v);
                  window.dispatchEvent(new Event("civitaiIncludeAdultContent"));
                }}
              />
              <CommonToggleSetting
                settingKey={"showNsfwModelThumbnail"}
                label={"NSFW-Vorschau anzeigen"}
                helpText={
                  "Aus = NSFW-Vorschaubilder werden verblurrt (per Klick aufdecken). Nur wirksam, wenn Adult-Inhalte an sind."
                }
                isDisabled={!adultOn}
                onAfterChange={() =>
                  window.dispatchEvent(new Event("showNsfwModelThumbnail"))
                }
              />
              <CivitaiApiKeySetting />
            </SettingsSection>

            <SettingsSection title={"Speicher & Sync"}>
              <SelectMyWorkflowsDir />
            </SettingsSection>

            <SettingsSection title={"Anzeige"}>
              <CommonToggleSetting
                settingKey={"foldersOnTop"}
                label={"Ordner immer oben"}
              />
              <CommonToggleSetting
                settingKey={"hideCoverImage"}
                label={"Thumbnails in der Workflow-Liste ausblenden"}
              />
            </SettingsSection>

            <SettingsSection title={"Speichern"}>
              <CommonNumberSetting
                label={"Max. gespeicherte Änderungs-Historie"}
                settingKey={"maximumChangelogNumber"}
              />
              <CommonToggleSetting
                settingKey={"disableUnsavedWarning"}
                label={"‚Speichern/Verwerfen'-Warnung deaktivieren"}
                warning={
                  "Vorsicht: Ohne diese Warnung gehen ungespeicherte Änderungen beim Schließen eines Workflows verloren."
                }
              />
            </SettingsSection>

            <SettingsSection title={"Tastenkürzel"}>
              <ShortcutSettings />
            </SettingsSection>

            <Accordion allowToggle>
              <AccordionItem
                border={"1px solid"}
                borderColor={"rowBorderColor"}
                borderRadius={"lg"}
              >
                <AccordionButton px={4} py={3}>
                  <Box
                    flex={1}
                    textAlign={"left"}
                    fontSize={"xs"}
                    textTransform={"uppercase"}
                    letterSpacing={"wider"}
                    color={"gray.500"}
                  >
                    Erweitert
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel px={4} pb={4}>
                  <TwoWaySyncSettings />
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
```

- [ ] **Step 2: Ungenutzte `CommonCheckboxSettings` prüfen und ggf. löschen**

Run: `grep -rn "CommonCheckboxSettings" ui/src/`
Wenn nur noch die eigene Datei (`ui/src/settings/CommonCheckboxSettings.tsx`) auftaucht (keine Importe mehr), lösche sie:

```bash
git rm ui/src/settings/CommonCheckboxSettings.tsx
```

Falls sie noch woanders importiert wird, NICHT löschen — dann im Bericht vermerken.

- [ ] **Step 3: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler. Achte auf: alle Setting-Keys (`civitaiIncludeAdultContent`, `showNsfwModelThumbnail`, `foldersOnTop`, `hideCoverImage`, `maximumChangelogNumber`, `disableUnsavedWarning`) sind gültige `UserSettings`-Keys (verifiziert).

- [ ] **Step 4: Commit (nur Source)**

```bash
git add ui/src/RecentFilesDrawer/WorkspaceSettingsModal.tsx ui/src/settings/CommonCheckboxSettings.tsx
git commit -m "feat(settings): Panel-Umbau (Hausstil-Karten, Civitai zuerst, Toggles, API-Key, Erweitert-Accordion)"
```

---

### Task 5: `NsfwToggleButton` auf Host-only zurückbauen

**Files:**
- Modify: `ui/src/model-manager/models-list-drawer/NsfwToggleButton.tsx`

**Interfaces:**
- Produces (unverändert): `export default function NsfwToggleButton(): JSX.Element`

- [ ] **Step 1: Blur-Kopplung entfernen**

In `ui/src/model-manager/models-list-drawer/NsfwToggleButton.tsx` die `toggle`-Funktion ersetzen, sodass sie NUR den Host schaltet:

```tsx
  const toggle = () => {
    const next = !checked;
    userSettingsTable
      ?.upsert({ civitaiIncludeAdultContent: next })
      .then(() => {
        setChecked(next);
        window.dispatchEvent(new Event("civitaiIncludeAdultContent"));
      });
  };
```

(Entfernt wird das gleichzeitige Setzen von `showNsfwModelThumbnail` und dessen `window.dispatchEvent(new Event("showNsfwModelThumbnail"))`. Der `read()`/`useEffect`-Teil liest weiterhin `civitaiIncludeAdultContent` — unverändert.)

- [ ] **Step 2: Doc-Kommentar anpassen**

Ersetze den Datei-Kommentarblock über `export default function NsfwToggleButton()` durch:

```tsx
/**
 * Adult-content host switch. One click toggles ONLY
 * `civitaiIncludeAdultContent` (civitai.red vs .com) and fires the
 * `civitaiIncludeAdultContent` event so panels re-fetch from the new host.
 * NSFW thumbnail blur (`showNsfwModelThumbnail`) is a SEPARATE setting owned by
 * the Settings panel - deliberately not coupled here, so blur stays meaningful
 * (adult content available but previews blurred).
 */
```

- [ ] **Step 3: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler.

- [ ] **Step 4: Commit (nur Source)**

```bash
git add ui/src/model-manager/models-list-drawer/NsfwToggleButton.tsx
git commit -m "refactor(nsfw): Toolbar-Button schaltet nur noch Adult-Host, Blur entkoppelt"
```

---

### Task 6: Dist-Rebuild + visuelle Verifikation

**Files:**
- Modify: `dist/workspace_web/**` (Build-Artefakte, Repo-Root)

- [ ] **Step 1: Produktions-Build**

Run (in `ui/`): `npm run build`
Expected: `dist/workspace_web/` neu erzeugt, keine Fehler.

- [ ] **Step 2: Testserver sicherstellen (Port 8189)**

Prüfen, ob 8189 lauscht; falls nicht, in `G:\Weiterentwicklung\ComfyUI` starten:
`venv/Scripts/python.exe main.py --port 8189 --cpu`

- [ ] **Step 3: Visuelle Prüfung via Chrome DevTools MCP (8189)**

Settings öffnen (Zahnrad unten links / „settings"-Button). Checkliste:
1. **Hausstil**: Kopf `galleryPanelBg`, getönt-roter Schließen-Button, gruppierte Karten, versteckte Scrollbar.
2. **Civitai zuerst**: „Adult-Inhalte (18+)" (Switch), „NSFW-Vorschau anzeigen" (Switch, **ausgegraut wenn Adult aus**), API-Key-Feld (maskiert, Auge-Toggle, Speichern/Löschen).
3. **Adult umschalten** → Blur-Switch wird aktiv/inaktiv; Install-Panel lädt bei offener Ansicht neu (Event).
4. **Blur-Switch** an/aus → NSFW-Thumbnails im Install-Panel un-/verblurrt (live).
5. **Anzeige/Speichern/Tastenkürzel**-Karten korrekt; Zahl speichert ohne Toast; „Warnung deaktivieren" zeigt Warn-Hinweis.
6. **Erweitert** unten eingeklappt; aufklappen zeigt Zwei-Wege-Sync mit Legacy-Warnung.
7. **Toolbar-NSFW-Button** (Install/Models) schaltet jetzt nur Adult-Host (nicht mehr Blur) — Blur bleibt so, wie im Settings-Panel gesetzt.
8. Kein „Please refresh"-Toast bei Toggle-Änderungen.

- [ ] **Step 4: Screenshots dem User zeigen, auf „OK" warten**

Testserver nicht vorher stoppen. Erst nach explizitem „OK" committen.

- [ ] **Step 5: Dist-Commit (separat)**

```bash
git add dist
git commit -m "build(dist): rebuild fuer Settings-Panel-Umbau"
```

---

## Self-Review (durchgeführt)

**Spec-Abdeckung:**
- Layout gruppierte Karten + Hausstil-Chrome + getönt-roter Close → Task 3 + Task 4. ✅
- Toggle-Switches statt Checkboxen, Live-Übernahme, kein Refresh-Toast → Task 1 (+ Number-Toast weg). ✅
- NSFW entkoppelt (zwei Schalter, Blur-Standard verblurrt, Blur-abhängig-deaktiviert) → Task 4 (Modal) + Task 5 (Button). ✅
- Civitai-API-Key in Settings (localStorage, keine Migration) → Task 2 + Task 4. ✅
- Gruppen-Reihenfolge nach Nutzen (Civitai zuerst), Erweitert unten eingeklappt → Task 4. ✅
- Reuse SelectMyWorkflowsDir/ShortcutSettings/TwoWaySyncSettings unverändert → Task 4. ✅
- Commit-Konvention Source + separater dist → alle Tasks + Task 6. ✅

**Platzhalter-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code. ✅

**Typ-Konsistenz:** `CommonToggleSetting`-Props (Task 1) identisch in Task 4 verwendet; alle `settingKey`-Werte sind verifizierte `UserSettings`-Keys; `getCivitApiKey/setCivitApiKey`-Signaturen (Task 2) stimmen mit `civitUtils` überein; `NsfwToggleButton` behält `civitaiIncludeAdultContent`-Read (Task 5). ✅

**Offene Laufzeit-Risiken (bewusst, in Task 6 zu prüfen):**
- Live-Wirkung von `foldersOnTop`/`hideCoverImage`: falls deren Konsumenten nur beim Mount lesen, wirkt die Änderung erst nach Neuladen — visuell prüfen; falls nötig, im Modal einen `note`-Hinweis „wirkt nach Neuladen" an den betreffenden Toggle hängen (Prop existiert).
- `SelectMyWorkflowsDir`/`ShortcutSettings` behalten ihre eigenen Toasts (bewusst, außerhalb Scope).
