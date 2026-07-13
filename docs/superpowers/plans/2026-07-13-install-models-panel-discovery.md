# Install-Models-Panel als Entdeckungs-Zentrale — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Install-Models-Panel vom „Download-Knopf-Regal" zu einer app-store-artigen Entdeckungs-Zentrale umbauen — reiche Karte mit Stats + „Installiert"-Erkennung, Detailansicht mit Version-Install, Browser-Toolbar (Suche/Sort/Basismodell-Filter) und Trending-Feed beim Öffnen.

**Architecture:** Dieselbe Grid↔Detail-Umschaltung wie im fertigen Models-Panel. `InstallModelsModal` hält den Zustand, rendert `InstallToolbar` + Grid aus `InstallModelCard` oder — bei gesetztem `detailItem` — `InstallDetailView`. Civitai-Detail-Bausteine (`SectionLabel`, `ImageMeta`, NSFW-Helfer) werden aus `ModelDetailView` in ein gemeinsames Modul extrahiert und von beiden Detailansichten genutzt. Download-Fortschritt kommt über das bestehende `download_progress`-Event und wird per Datei-Basename der Karte zugeordnet.

**Tech Stack:** React 18, Chakra UI, TypeScript, Vite. `@tabler/icons-react`. Keine neuen Abhängigkeiten.

## Global Constraints

- **Produktion nicht anfassen:** echte ComfyUI = Port 8188, `G:\ComfyUI`. Verifikation ausschließlich in Testumgebung `G:\Weiterentwicklung\ComfyUI`, Port **8189** (`venv/Scripts/python.exe main.py --port 8189 --cpu`).
- **Keine neue npm-Abhängigkeit.**
- **Hausstil:** dunkles Anthrazit + Blau als einziger heller Leitakzent; semantische Farben getönt (NSFW-Pink, Favorit-Gold, Schließen-Rot, Installiert-Grün als `subtle`). Tokens: `galleryPanelBg`, `galleryActiveBg`, `rowHoverBg`, `rowBorderColor`.
- **Keine Live-Civitai-Verifikation im Dev** — visuelle Checks mit Mock/Cache-Daten (Fetch-Stub + `indexdb`-Seed).
- **Commit-Konvention:** je Task ein **Source-Commit** (nur `ui/src/**`), am Ende ein **separater `dist`-Rebuild-Commit** (`npm run build` in `ui/`, dann `ui/dist/**` committen).
- **Ablauf:** bauen → Screenshots zeigen → erst auf explizites „OK" des Users committen/aufräumen; Testserver **nicht sofort stoppen**.
- **Per-Task-Green-Gate:** `npm run build` (in `ui/`) läuft fehlerfrei durch. Beim Commit nur die Source-Dateien stagen, **nicht** `ui/dist/`.

## File Structure

- **Create** `ui/src/model-manager/components/CivitDetailShared.tsx` — gemeinsame Detail-Bausteine: `SectionLabel`, `ImageMeta`, `NSFW_BLUR_FILTER`, `NSFW_STRING_TO_LEVEL`, `nsfwLevelNum`.
- **Modify** `ui/src/model-manager/models-list-drawer/ModelDetailView.tsx` — lokale Kopien dieser Bausteine durch Import aus `CivitDetailShared` ersetzen (keine Verhaltensänderung).
- **Modify** `ui/src/model-manager/utils.tsx` — `formatCount` hinzufügen.
- **Modify** `ui/src/model-manager/install-models/util/getModelFromCivitAPI.ts` — `sort` + `baseModels` unterstützen, `types=undefined` nicht mehr senden, `limit` 40.
- **Create** `ui/src/model-manager/install-models/InstallModelCard.tsx` — reiche Entdecker-Karte (ersetzt `ModelCard.tsx`).
- **Create** `ui/src/model-manager/install-models/InstallToolbar.tsx` — Browser-Toolbar (Suche/Tabs/Sort/Basismodell/NSFW/⋯-Menü).
- **Create** `ui/src/model-manager/install-models/InstallDetailView.tsx` — Detailansicht mit Version-Install.
- **Modify** `ui/src/model-manager/install-models/InstallModelsModal.tsx` — Umbau: Toolbar + Grid + Detail verdrahten, Sort/Basismodell/Installiert/Progress-Zustand.
- **Delete** `ui/src/model-manager/install-models/ModelCard.tsx` — ersetzt durch `InstallModelCard`.
- **Delete** `ui/src/model-manager/install-models/InstallModelSearchBar.tsx` — ersetzt durch `SearchInput` in der Toolbar (nur falls nach Umbau ungenutzt; sonst behalten).
- `ui/src/model-manager/install-models/InstallProgress.tsx` bleibt als Datenquellen-Referenz erhalten, wird aber im Modal nicht mehr gerendert.

---

### Task 1: Civitai-API um Sortierung & Basismodell-Filter erweitern

**Files:**
- Modify: `ui/src/model-manager/install-models/util/getModelFromCivitAPI.ts`

**Interfaces:**
- Produces: `getModelFromCivitAPi(types?: MODEL_TYPE, query?: string, sort?: string, baseModels?: string): Promise<CivitiModel[]>`

- [ ] **Step 1: Signatur + Query-Parameter erweitern**

Ersetze in `getModelFromCivitAPI.ts` den `CivitModelQueryParams`-Typ und die Funktions-Signatur/Parameter-Bildung:

```ts
type CivitModelQueryParams = {
  types?: MODEL_TYPE;
  query?: string;
  limit?: string;
  nsfw?: string;
  sort?: string;
  baseModels?: string;
};

export async function getModelFromCivitAPi(
  types?: MODEL_TYPE,
  query?: string,
  sort?: string,
  baseModels?: string,
): Promise<CivitiModel[]> {
  const params: CivitModelQueryParams = {
    limit: "40",
  };
  if (types) params.types = types;
  if (query) params.query = query;
  if (sort) params.sort = sort;
  if (baseModels) params.baseModels = baseModels;

  const includeAdultContent = await userSettingsTable?.getSetting(
    "civitaiIncludeAdultContent",
  );
  if (includeAdultContent) {
    params.nsfw = "true";
  }
  // ... Rest (queryString, baseUrl, Cache, fetch) unverändert ...
```

Der übrige Funktionskörper (ab `const queryString = ...`) bleibt unverändert.

- [ ] **Step 2: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build läuft ohne neue Fehler durch (vorbestehende, unrelated tsc-Warnungen z. B. in `mediaMetadataUtils.ts` ignorieren).

- [ ] **Step 3: Commit (nur Source)**

```bash
git add ui/src/model-manager/install-models/util/getModelFromCivitAPI.ts
git commit -m "feat(install): Civitai-Suche um sort und baseModels erweitern"
```

---

### Task 2: Gemeinsame Detail-Bausteine extrahieren + `formatCount`

**Files:**
- Create: `ui/src/model-manager/components/CivitDetailShared.tsx`
- Modify: `ui/src/model-manager/models-list-drawer/ModelDetailView.tsx`
- Modify: `ui/src/model-manager/utils.tsx`

**Interfaces:**
- Produces:
  - `SectionLabel({ children }: { children: ReactNode }): JSX.Element`
  - `ImageMeta({ meta, onCopy }: { meta?: CivitImageWithMeta["meta"]; onCopy: (text: string, label: string) => void }): JSX.Element`
  - `NSFW_BLUR_FILTER: string`
  - `NSFW_STRING_TO_LEVEL: Record<string, number>`
  - `nsfwLevelNum(lvl?: number | string): number`
  - `formatCount(n?: number): string`

- [ ] **Step 1: Shared-Modul anlegen**

Create `ui/src/model-manager/components/CivitDetailShared.tsx`:

```tsx
import {
  Box,
  HStack,
  IconButton,
  Text,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { IconCopy } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { CivitImageWithMeta } from "../api/civitDetailApi";

export const NSFW_BLUR_FILTER = "blur(20px)";

// Civitai's numeric browsing level: 1=PG, 2=PG13, 4=R, 8=X, 16=XXX.
export const NSFW_STRING_TO_LEVEL: Record<string, number> = {
  None: 1,
  Soft: 2,
  Mature: 4,
  X: 8,
};

export function nsfwLevelNum(lvl?: number | string): number {
  if (typeof lvl === "number") return lvl;
  if (typeof lvl === "string") return NSFW_STRING_TO_LEVEL[lvl] ?? 1;
  return 1;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      fontSize={"xs"}
      textTransform={"uppercase"}
      letterSpacing={"wider"}
      color={"gray.500"}
      mb={2}
    >
      {children}
    </Text>
  );
}

export function ImageMeta({
  meta,
  onCopy,
}: {
  meta?: CivitImageWithMeta["meta"];
  onCopy: (text: string, label: string) => void;
}) {
  if (!meta || (!meta.prompt && !meta.sampler && meta.seed == null)) {
    return (
      <Text fontSize={"xs"} color={"gray.500"} mt={1}>
        Keine Prompt-Daten hinterlegt.
      </Text>
    );
  }
  return (
    <Box
      mt={1}
      p={2}
      borderRadius={"md"}
      border={"1px solid"}
      borderColor={"rowBorderColor"}
      fontSize={"xs"}
    >
      {meta.prompt && (
        <Box mb={2}>
          <HStack justify={"space-between"} mb={1}>
            <Text color={"gray.500"}>Prompt</Text>
            <IconButton
              size={"xs"}
              variant={"ghost"}
              aria-label={"copy prompt"}
              icon={<IconCopy size={13} />}
              onClick={() => onCopy(meta.prompt ?? "", "Prompt")}
            />
          </HStack>
          <Text noOfLines={4}>{meta.prompt}</Text>
        </Box>
      )}
      <Wrap spacing={2} color={"gray.500"}>
        {meta.sampler && <WrapItem>Sampler: {meta.sampler}</WrapItem>}
        {meta.steps != null && <WrapItem>Steps: {meta.steps}</WrapItem>}
        {meta.cfgScale != null && <WrapItem>CFG: {meta.cfgScale}</WrapItem>}
        {meta.seed != null && <WrapItem>Seed: {meta.seed}</WrapItem>}
      </Wrap>
    </Box>
  );
}
```

- [ ] **Step 2: `formatCount` in `utils.tsx` ergänzen**

Füge ans Ende von `ui/src/model-manager/utils.tsx` an:

```ts
// Compact human-readable counts for the discovery cards, e.g. 12_400 -> "12.4k".
export function formatCount(n?: number): string {
  if (n == null) return "0";
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
```

- [ ] **Step 3: `ModelDetailView.tsx` auf die geteilten Bausteine umstellen**

In `ui/src/model-manager/models-list-drawer/ModelDetailView.tsx`:

1. Import ergänzen (nach den bestehenden Imports):

```ts
import {
  ImageMeta,
  NSFW_BLUR_FILTER,
  nsfwLevelNum,
  SectionLabel,
} from "../components/CivitDetailShared";
```

2. Diese lokalen Definitionen **entfernen**: die Konstante `NSFW_BLUR_FILTER` (Zeile ~39), die Konstante `NSFW_STRING_TO_LEVEL` (Zeilen ~46-52), sowie die Funktionen `SectionLabel` (~408-420) und `ImageMeta` (~422-468) am Dateiende. `FallbackLocalInfo` bleibt.

3. Die lokale `levelNum`-Hilfe im Component-Body ersetzen: lösche den `levelNum`-Block und ersetze in `isBlur` den Aufruf:

```ts
  const isBlur = (lvl?: number | string) => nsfwLevelNum(lvl) >= 4 && !showNsfw;
```

- [ ] **Step 4: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler. (Visuelle Gegenprüfung der Models-Detailansicht erfolgt im Schluss-Task.)

- [ ] **Step 5: Commit (nur Source)**

```bash
git add ui/src/model-manager/components/CivitDetailShared.tsx ui/src/model-manager/models-list-drawer/ModelDetailView.tsx ui/src/model-manager/utils.tsx
git commit -m "refactor(model-manager): Civitai-Detail-Bausteine teilen, formatCount ergaenzen"
```

---

### Task 3: `InstallModelCard` — reiche Entdecker-Karte

**Files:**
- Create: `ui/src/model-manager/install-models/InstallModelCard.tsx`

**Interfaces:**
- Consumes: `useInView` (`{ ref, inView }`), `findImageFromModel(model, size)`, `civitThumbUrl`, `formatCount`, `NSFW_BLUR_FILTER`.
- Produces:
  ```ts
  interface InstallModelCardProps {
    model: CivitiModel;
    installed: boolean;
    progress?: number;               // 0..100 wenn diese Datei gerade lädt
    installing: boolean;             // ausgelöst, aber noch kein Prozentwert
    onQuickInstall: (model: CivitiModel) => void;
    onOpenDetail: (model: CivitiModel) => void;
  }
  export default function InstallModelCard(props: InstallModelCardProps): JSX.Element
  ```

- [ ] **Step 1: Karte anlegen**

Create `ui/src/model-manager/install-models/InstallModelCard.tsx`:

```tsx
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Flex,
  HStack,
  Image,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconDownload, IconHeart } from "@tabler/icons-react";
import type { CivitiModel } from "../types";
import { findImageFromModel } from "../../utils/findSfwImage";
import { civitThumbUrl } from "../api/civitDetailApi";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { useInView } from "../hooks/useInView";
import { formatCount } from "../utils";
import { NSFW_BLUR_FILTER } from "../components/CivitDetailShared";

interface InstallModelCardProps {
  model: CivitiModel;
  installed: boolean;
  progress?: number;
  installing: boolean;
  onQuickInstall: (model: CivitiModel) => void;
  onOpenDetail: (model: CivitiModel) => void;
}

export default function InstallModelCard({
  model,
  installed,
  progress,
  installing,
  onQuickInstall,
  onOpenDetail,
}: InstallModelCardProps) {
  const { ref, inView } = useInView<HTMLDivElement>("400px");
  const [showNsfw, setShowNsfw] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const picked = useMemo(() => findImageFromModel(model, 450), [model]);
  const baseModel = model.modelVersions?.[0]?.baseModel;
  const blurred = picked.isNsfw && !showNsfw && !revealed;
  const downloading = progress != null || installing;

  useEffect(() => {
    const update = () => {
      userSettingsTable
        ?.getSetting("showNsfwModelThumbnail")
        .then((r) => setShowNsfw(r ?? false));
    };
    update();
    window.addEventListener("showNsfwModelThumbnail", update);
    return () => window.removeEventListener("showNsfwModelThumbnail", update);
  }, []);

  return (
    <Box
      ref={ref}
      role={"group"}
      position={"relative"}
      w={"100%"}
      sx={{ aspectRatio: "3 / 4" }}
      borderRadius={"lg"}
      overflow={"hidden"}
      bg={"galleryPanelBg"}
      cursor={"pointer"}
      onClick={() => onOpenDetail(model)}
    >
      {inView && picked.url ? (
        <Image
          src={civitThumbUrl(picked.url, 450)}
          loading={"lazy"}
          alt={model.name ?? "model"}
          w={"100%"}
          h={"100%"}
          objectFit={"cover"}
          filter={blurred ? NSFW_BLUR_FILTER : undefined}
        />
      ) : (
        <Box w={"100%"} h={"100%"} />
      )}

      {/* Top: Typ/Basismodell links, Stats rechts */}
      <Flex
        position={"absolute"}
        top={0}
        left={0}
        right={0}
        p={2}
        gap={1}
        justify={"space-between"}
        align={"flex-start"}
        bgGradient={"linear(to-b, blackAlpha.700, transparent)"}
      >
        <HStack gap={1} flexWrap={"wrap"}>
          {model.type && (
            <Badge
              colorScheme={"blackAlpha"}
              bg={"blackAlpha.600"}
              color={"whiteAlpha.900"}
              borderRadius={"full"}
              textTransform={"none"}
              fontSize={"10px"}
              px={2}
            >
              {model.type}
            </Badge>
          )}
          {baseModel && (
            <Badge
              bg={"blackAlpha.600"}
              color={"whiteAlpha.900"}
              borderRadius={"full"}
              textTransform={"none"}
              fontSize={"10px"}
              px={2}
            >
              {baseModel}
            </Badge>
          )}
        </HStack>
        <HStack gap={2} color={"whiteAlpha.900"} fontSize={"11px"} flexShrink={0}>
          <HStack gap={0.5}>
            <IconDownload size={12} />
            <Text>{formatCount(model.stats?.downloadCount)}</Text>
          </HStack>
          <HStack gap={0.5}>
            <IconHeart size={12} />
            <Text>{formatCount(model.stats?.favoriteCount)}</Text>
          </HStack>
        </HStack>
      </Flex>

      {/* NSFW-Reveal */}
      {blurred && (
        <Button
          position={"absolute"}
          top={"50%"}
          left={"50%"}
          transform={"translate(-50%, -50%)"}
          size={"sm"}
          bg={"rgba(237,100,166,0.16)"}
          color={"pink.100"}
          _hover={{ bg: "rgba(237,100,166,0.3)" }}
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
        >
          Anzeigen
        </Button>
      )}

      {/* Bottom: Name + Install/Installiert */}
      <Flex
        position={"absolute"}
        bottom={0}
        left={0}
        right={0}
        direction={"column"}
        gap={1}
        p={2}
        bgGradient={"linear(to-t, blackAlpha.800, transparent)"}
      >
        <Text color={"white"} fontWeight={600} fontSize={"sm"} noOfLines={1}>
          {model.name}
        </Text>
        {installed ? (
          <Badge
            alignSelf={"flex-start"}
            colorScheme={"green"}
            variant={"subtle"}
            borderRadius={"full"}
            display={"flex"}
            alignItems={"center"}
            gap={1}
            px={2}
          >
            <IconCheck size={12} /> Installiert
          </Badge>
        ) : (
          <Button
            alignSelf={"flex-start"}
            size={"xs"}
            colorScheme={"blue"}
            leftIcon={<IconDownload size={14} />}
            isDisabled={downloading}
            opacity={0}
            _groupHover={{ opacity: 1 }}
            transition={"opacity 0.12s"}
            onClick={(e) => {
              e.stopPropagation();
              onQuickInstall(model);
            }}
          >
            Installieren
          </Button>
        )}
      </Flex>

      {/* Download-Fortschritt auf der Karte */}
      {downloading && (
        <Flex
          position={"absolute"}
          inset={0}
          bg={"blackAlpha.700"}
          direction={"column"}
          align={"center"}
          justify={"center"}
          gap={2}
        >
          {progress != null ? (
            <>
              <CircularProgress
                value={progress}
                color={"blue.400"}
                size={"48px"}
              />
              <Text color={"white"} fontSize={"sm"}>
                {progress.toFixed(0)}%
              </Text>
            </>
          ) : (
            <Spinner color={"blue.400"} />
          )}
        </Flex>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler. (Die Karte wird in Task 6 verdrahtet; hier zählt nur, dass sie kompiliert.)

- [ ] **Step 3: Commit (nur Source)**

```bash
git add ui/src/model-manager/install-models/InstallModelCard.tsx
git commit -m "feat(install): reiche Entdecker-Karte mit Stats, NSFW-Reveal, Installiert-Status und Karten-Fortschritt"
```

---

### Task 4: `InstallToolbar` — Browser-Toolbar

**Files:**
- Create: `ui/src/model-manager/install-models/InstallToolbar.tsx`

**Interfaces:**
- Consumes: `CategoryTabs`, `SearchInput`, `NsfwToggleButton`, `AddApiKeyPopover`, `ALL_MODEL_TYPES`, `MODEL_TYPE`.
- Produces:
  ```ts
  export const SORT_OPTIONS: { key: string; label: string }[];       // key = Civitai sort-Wert
  export const BASE_MODEL_OPTIONS: { key: string; label: string }[]; // key = Civitai baseModels-Wert ("" = Alle)
  interface InstallToolbarProps {
    searchQuery: string;
    setSearchQuery: (v: string) => void;
    onSearch: () => void;
    modelType?: MODEL_TYPE;
    onSelectModelType: (t?: MODEL_TYPE) => void;
    sortBy: string;
    setSortBy: (v: string) => void;
    baseModel: string;
    setBaseModel: (v: string) => void;
    onCustomUrlInstall: () => void;
    resultCount: number;
    loading: boolean;
  }
  export default function InstallToolbar(props: InstallToolbarProps): JSX.Element
  ```

- [ ] **Step 1: Toolbar anlegen**

Create `ui/src/model-manager/install-models/InstallToolbar.tsx`:

```tsx
import {
  Box,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import {
  IconChevronDown,
  IconDotsVertical,
  IconLink,
} from "@tabler/icons-react";
import SearchInput from "../../components/SearchInput";
import CategoryTabs from "../components/CategoryTabs";
import NsfwToggleButton from "../models-list-drawer/NsfwToggleButton";
import AddApiKeyPopover from "./AddApiKeyPopover";
import { ALL_MODEL_TYPES, type MODEL_TYPE } from "./util/modelTypes";

export const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: "Most Downloaded", label: "Meiste Downloads" },
  { key: "Highest Rated", label: "Beste Bewertung" },
  { key: "Newest", label: "Neueste" },
];

// key = exakter Civitai-`baseModels`-Wert; "" = kein Filter.
export const BASE_MODEL_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Alle Basismodelle" },
  { key: "SD 1.5", label: "SD 1.5" },
  { key: "SDXL 1.0", label: "SDXL" },
  { key: "Pony", label: "Pony" },
  { key: "Flux.1 D", label: "Flux" },
  { key: "Illustrious", label: "Illustrious" },
];

interface InstallToolbarProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onSearch: () => void;
  modelType?: MODEL_TYPE;
  onSelectModelType: (t?: MODEL_TYPE) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  baseModel: string;
  setBaseModel: (v: string) => void;
  onCustomUrlInstall: () => void;
  resultCount: number;
  loading: boolean;
}

export default function InstallToolbar({
  searchQuery,
  setSearchQuery,
  onSearch,
  modelType,
  onSelectModelType,
  sortBy,
  setSortBy,
  baseModel,
  setBaseModel,
  onCustomUrlInstall,
  resultCount,
  loading,
}: InstallToolbarProps) {
  const sortLabel =
    SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? SORT_OPTIONS[0].label;
  const baseLabel =
    BASE_MODEL_OPTIONS.find((o) => o.key === baseModel)?.label ??
    BASE_MODEL_OPTIONS[0].label;

  return (
    <Box flexShrink={0}>
      {/* Zeile 1: Titel + Suche + NSFW + ⋯ */}
      <Flex
        align={"center"}
        gap={3}
        px={4}
        py={3}
        pr={14}
        bg={"galleryPanelBg"}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <Text fontWeight={700} fontSize={"lg"} flexShrink={0}>
          Install Models
        </Text>
        <Box flex={1} maxW={"640px"}>
          <SearchInput
            searchInput={searchQuery}
            onChange={setSearchQuery}
            onEnter={onSearch}
            variant={"filled"}
            borderRadius={"full"}
            mb={0}
          />
        </Box>
        <NsfwToggleButton />
        <Menu>
          <MenuButton
            as={IconButton}
            aria-label={"more install options"}
            icon={<IconDotsVertical size={18} />}
            size={"sm"}
            variant={"ghost"}
          />
          <MenuList>
            <MenuItem
              icon={<IconLink size={16} />}
              onClick={onCustomUrlInstall}
            >
              Custom URL Install
            </MenuItem>
            <Box px={3} py={1}>
              <AddApiKeyPopover />
            </Box>
          </MenuList>
        </Menu>
      </Flex>

      {/* Zeile 2: Kategorie-Tabs */}
      <Box bg={"galleryActiveBg"} px={2}>
        <CategoryTabs
          items={[
            { key: "", label: "All" },
            ...ALL_MODEL_TYPES.map((t) => ({ key: t, label: t })),
          ]}
          value={modelType ?? ""}
          onChange={(key) =>
            onSelectModelType(key === "" ? undefined : (key as MODEL_TYPE))
          }
        />
      </Box>

      {/* Zeile 3: Sort + Basismodell + Trefferzahl */}
      <Flex
        align={"center"}
        gap={2}
        px={4}
        py={2}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <Menu>
          <MenuButton
            as={IconButton}
            aria-label={"sort"}
            icon={<IconChevronDown size={16} />}
            display={"none"}
          />
        </Menu>
        <Menu>
          <MenuButton
            as={Box}
            cursor={"pointer"}
            px={3}
            py={1}
            borderRadius={"md"}
            border={"1px solid"}
            borderColor={"rowBorderColor"}
            _hover={{ bg: "rowHoverBg" }}
          >
            <HStack gap={1}>
              <Text fontSize={"sm"}>Sortierung: {sortLabel}</Text>
              <IconChevronDown size={14} />
            </HStack>
          </MenuButton>
          <MenuList>
            {SORT_OPTIONS.map((o) => (
              <MenuItem key={o.key} onClick={() => setSortBy(o.key)}>
                {o.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Menu>
          <MenuButton
            as={Box}
            cursor={"pointer"}
            px={3}
            py={1}
            borderRadius={"md"}
            border={"1px solid"}
            borderColor={baseModel ? "blue.400" : "rowBorderColor"}
            color={baseModel ? "blue.300" : undefined}
            _hover={{ bg: "rowHoverBg" }}
          >
            <HStack gap={1}>
              <Text fontSize={"sm"}>{baseLabel}</Text>
              <IconChevronDown size={14} />
            </HStack>
          </MenuButton>
          <MenuList>
            {BASE_MODEL_OPTIONS.map((o) => (
              <MenuItem key={o.key} onClick={() => setBaseModel(o.key)}>
                {o.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Box flex={1} />
        <Text fontSize={"sm"} color={"gray.500"}>
          {loading ? "Lädt…" : `${resultCount} Treffer`}
        </Text>
      </Flex>
    </Box>
  );
}
```

> Hinweis: Der erste (versteckte) `Menu`-Block ist überflüssig — beim Einbau entfernen, falls er beim Übertragen mitkopiert wurde. Nur die zwei sichtbaren Menüs (Sortierung, Basismodell) gehören in Zeile 3.

- [ ] **Step 2: `SearchInput`-Props verifizieren**

Öffne `ui/src/components/SearchInput.tsx` und prüfe die Prop-Namen (`searchInput`/`onChange`/`onEnter`/`variant`/`borderRadius`/`mb`). Falls sie abweichen, die Verwendung oben entsprechend anpassen (Prop-Namen an die reale Signatur angleichen — Verhalten bleibt: kontrollierter Wert + Enter löst `onSearch` aus).

- [ ] **Step 3: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler.

- [ ] **Step 4: Commit (nur Source)**

```bash
git add ui/src/model-manager/install-models/InstallToolbar.tsx
git commit -m "feat(install): Browser-Toolbar mit Suche, Sortierung, Basismodell-Filter und Aufraeum-Menue"
```

---

### Task 5: `InstallDetailView` — Detailansicht mit Version-Install

**Files:**
- Create: `ui/src/model-manager/install-models/InstallDetailView.tsx`

**Interfaces:**
- Consumes: `getCivitVersionImages`, `civitThumbUrl`, `civitDescriptionToText`, `CivitImageWithMeta`, `SectionLabel`, `ImageMeta`, `NSFW_BLUR_FILTER`, `nsfwLevelNum`, `getFileEssential`, `KBtoGB`, `hideScrollbarSx`, `getCivitModelPageUrl`.
- Produces:
  ```ts
  interface InstallDetailViewProps {
    model: CivitiModel;
    installedVersionIds: Set<string>;               // civitModelVersionID-Menge
    installingNames: string[];                       // Dateinamen im Download
    onInstallVersion: (version: CivitiModelVersion, model: CivitiModel) => void;
    onBack: () => void;
  }
  export default function InstallDetailView(props: InstallDetailViewProps): JSX.Element
  ```

- [ ] **Step 1: Detailansicht anlegen**

Create `ui/src/model-manager/install-models/InstallDetailView.tsx`:

```tsx
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Image,
  Spinner,
  Stack,
  Tag,
  Text,
  Tooltip,
  useToast,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconCopy,
  IconDownload,
  IconExternalLink,
} from "@tabler/icons-react";
import type { CivitiModel, CivitiModelVersion } from "../types";
import {
  civitDescriptionToText,
  civitThumbUrl,
  getCivitVersionImages,
  type CivitImageWithMeta,
} from "../api/civitDetailApi";
import { getCivitModelPageUrl } from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { KBtoGB, hideScrollbarSx } from "../utils";
import { getFileEssential } from "./util/modelTypes";
import {
  ImageMeta,
  NSFW_BLUR_FILTER,
  nsfwLevelNum,
  SectionLabel,
} from "../components/CivitDetailShared";

interface InstallDetailViewProps {
  model: CivitiModel;
  installedVersionIds: Set<string>;
  installingNames: string[];
  onInstallVersion: (version: CivitiModelVersion, model: CivitiModel) => void;
  onBack: () => void;
}

export default function InstallDetailView({
  model,
  installedVersionIds,
  installingNames,
  onInstallVersion,
  onBack,
}: InstallDetailViewProps) {
  const versions = useMemo(() => model.modelVersions ?? [], [model]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | undefined>(
    versions[0]?.id,
  );
  const [showNsfw, setShowNsfw] = useState(false);
  const [openMetaIdx, setOpenMetaIdx] = useState<number>();
  const [versionImages, setVersionImages] = useState<CivitImageWithMeta[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const toast = useToast();

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) ?? versions[0];
  const descriptionText = useMemo(
    () => civitDescriptionToText(model.description),
    [model.description],
  );

  useEffect(() => {
    userSettingsTable?.getSetting("showNsfwModelThumbnail").then((r) => {
      setShowNsfw(r ?? false);
    });
  }, []);

  // Beispielbilder MIT Prompt-Meta für die gewählte Version nachladen.
  useEffect(() => {
    let cancelled = false;
    setOpenMetaIdx(undefined);
    setVersionImages([]);
    const vid = selectedVersion?.id;
    if (vid == null) {
      setImagesLoading(false);
      return;
    }
    setImagesLoading(true);
    getCivitVersionImages(vid).then((imgs) => {
      if (!cancelled) {
        setVersionImages(imgs);
        setImagesLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVersion?.id]);

  const galleryImages: CivitImageWithMeta[] = versionImages.length
    ? versionImages
    : imagesLoading
      ? []
      : (selectedVersion?.images ?? []).map((im) => ({
          url: im.url,
          nsfwLevel: im.nsfwLevel,
        }));

  const isBlur = (lvl?: number | string) =>
    nsfwLevelNum(lvl) >= 4 && !showNsfw;

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: `${label} kopiert`, status: "success", duration: 1400 });
  };

  const openCivit = async () => {
    const win = window.open();
    if (win) {
      win.location.href = await getCivitModelPageUrl(
        String(model.id),
        selectedVersion?.id ? String(selectedVersion.id) : undefined,
      );
    }
  };

  const versionSize = (v: CivitiModelVersion) => {
    const file = v.files?.find((f) => f.primary) ?? v.files?.[0];
    return file?.sizeKB ? KBtoGB(file.sizeKB) : undefined;
  };

  const versionFileName = (v: CivitiModelVersion) =>
    getFileEssential(v, model.name)?.name;

  const cover = selectedVersion?.images?.[0];

  return (
    <Flex direction={"column"} h={"100%"} minH={0}>
      {/* Kopfleiste */}
      <Flex
        align={"center"}
        gap={2}
        px={4}
        py={2}
        pr={12}
        flexShrink={0}
        bg={"galleryPanelBg"}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <Tooltip label={"Zurück zur Übersicht"}>
          <IconButton
            size={"sm"}
            variant={"ghost"}
            icon={<IconArrowLeft size={19} />}
            aria-label={"back to install list"}
            onClick={onBack}
          />
        </Tooltip>
        <Heading size={"sm"} noOfLines={1}>
          {model.name}
        </Heading>
        <Button
          size={"xs"}
          variant={"ghost"}
          leftIcon={<IconExternalLink size={15} />}
          onClick={openCivit}
          flexShrink={0}
        >
          Auf Civitai öffnen
        </Button>
      </Flex>

      <Box flex={1} minH={0} overflowY={"auto"} p={4} sx={hideScrollbarSx}>
        <Flex gap={4} align={"stretch"} wrap={"wrap"}>
          {/* Links: Cover + Typ/Basismodell + Trigger-Wörter */}
          <Box w={"320px"} flexShrink={0}>
            {cover?.url && (
              <Image
                src={civitThumbUrl(cover.url, 512)}
                loading={"lazy"}
                w={"100%"}
                borderRadius={"md"}
                objectFit={"cover"}
                maxH={"320px"}
                filter={isBlur(cover.nsfwLevel) ? NSFW_BLUR_FILTER : undefined}
                alt={"model cover"}
              />
            )}
            <Text fontSize={"sm"} color={"gray.500"} mt={3}>
              {[model.type, selectedVersion?.baseModel]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {selectedVersion?.trainedWords?.length ? (
              <Box mt={3}>
                <SectionLabel>Trigger-Wörter</SectionLabel>
                <Wrap>
                  {selectedVersion.trainedWords.map((w, i) => (
                    <WrapItem key={i}>
                      <Tag
                        size={"md"}
                        borderRadius={"full"}
                        cursor={"pointer"}
                        onClick={() => copy(w, "Trigger-Wort")}
                        gap={1}
                      >
                        {w}
                        <IconCopy size={13} />
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            ) : null}
          </Box>

          {/* Rechts: Versionsliste mit Install je Version */}
          <Box flex={1} minW={"300px"}>
            <SectionLabel>
              Versionen{versions.length ? ` (${versions.length})` : ""}
            </SectionLabel>
            <Box
              maxH={"360px"}
              overflowY={"auto"}
              border={"1px solid"}
              borderColor={"rowBorderColor"}
              borderRadius={"md"}
              sx={hideScrollbarSx}
            >
              <Stack spacing={0}>
                {versions.map((v) => {
                  const active = v.id === selectedVersion?.id;
                  const fileName = versionFileName(v);
                  const installed = installedVersionIds.has(String(v.id));
                  const busy = fileName
                    ? installingNames.includes(fileName)
                    : false;
                  return (
                    <Flex
                      key={v.id}
                      justify={"space-between"}
                      align={"center"}
                      gap={2}
                      px={3}
                      py={2}
                      borderLeft={"2px solid"}
                      borderColor={active ? "blue.400" : "transparent"}
                      bg={active ? "galleryActiveBg" : "transparent"}
                      _hover={{ bg: active ? "galleryActiveBg" : "rowHoverBg" }}
                      cursor={"pointer"}
                      onClick={() => setSelectedVersionId(v.id)}
                    >
                      <Box minW={0}>
                        <HStack gap={2} minW={0}>
                          <Text fontWeight={500} fontSize={"sm"} noOfLines={1}>
                            {v.name}
                          </Text>
                          {v.baseModel && (
                            <Text
                              fontSize={"xs"}
                              color={"gray.500"}
                              flexShrink={0}
                            >
                              {v.baseModel}
                            </Text>
                          )}
                        </HStack>
                        {versionSize(v) && (
                          <Text fontSize={"xs"} color={"gray.500"}>
                            {versionSize(v)}
                          </Text>
                        )}
                      </Box>
                      {installed ? (
                        <Badge
                          colorScheme={"green"}
                          variant={"subtle"}
                          borderRadius={"full"}
                          flexShrink={0}
                        >
                          installiert
                        </Badge>
                      ) : (
                        <Button
                          size={"xs"}
                          colorScheme={"blue"}
                          leftIcon={<IconDownload size={14} />}
                          flexShrink={0}
                          isDisabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            onInstallVersion(v, model);
                          }}
                        >
                          Installieren
                        </Button>
                      )}
                    </Flex>
                  );
                })}
              </Stack>
            </Box>
          </Box>
        </Flex>

        {/* Beschreibung */}
        {descriptionText && (
          <Box mt={5}>
            <SectionLabel>Beschreibung</SectionLabel>
            <Box
              maxH={"460px"}
              overflowY={"auto"}
              border={"1px solid"}
              borderColor={"rowBorderColor"}
              borderRadius={"md"}
              p={3}
              sx={hideScrollbarSx}
            >
              <Text fontSize={"sm"} whiteSpace={"pre-wrap"}>
                {descriptionText}
              </Text>
            </Box>
          </Box>
        )}

        {/* Beispielbilder mit Prompts */}
        <Box mt={5}>
          <SectionLabel>Beispielbilder – zum Prompt anklicken</SectionLabel>
          {imagesLoading ? (
            <Flex py={8} justify={"center"}>
              <Spinner size={"sm"} />
            </Flex>
          ) : galleryImages.length ? (
            <Flex wrap={"wrap"} gap={3} align={"flex-start"}>
              {galleryImages.map((img, idx) => {
                const open = openMetaIdx === idx;
                return (
                  <Box key={idx} w={"180px"}>
                    <Image
                      src={civitThumbUrl(img.url)}
                      loading={"lazy"}
                      w={"180px"}
                      h={"180px"}
                      objectFit={"cover"}
                      borderRadius={"md"}
                      cursor={"pointer"}
                      filter={
                        isBlur(img.nsfwLevel) ? NSFW_BLUR_FILTER : undefined
                      }
                      onClick={() => setOpenMetaIdx(open ? undefined : idx)}
                      alt={"example"}
                    />
                    {open && <ImageMeta meta={img.meta} onCopy={copy} />}
                  </Box>
                );
              })}
            </Flex>
          ) : (
            <Text fontSize={"sm"} color={"gray.500"}>
              Keine Beispielbilder verfügbar.
            </Text>
          )}
        </Box>
      </Box>
    </Flex>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler. Falls `im.nsfwLevel` an `selectedVersion.images` typseitig fehlt: In `types.ts` hat `CivitiModelVersionImage` ein `nsfwLevel?`. Sollte der Typ abweichen, den Fallback-Map-Ausdruck an die reale Feldbezeichnung angleichen.

- [ ] **Step 3: Commit (nur Source)**

```bash
git add ui/src/model-manager/install-models/InstallDetailView.tsx
git commit -m "feat(install): Detailansicht mit Versionsliste, Install je Version, Beschreibung und Beispiel-Prompts"
```

---

### Task 6: `InstallModelsModal` — alles verdrahten

**Files:**
- Modify: `ui/src/model-manager/install-models/InstallModelsModal.tsx`
- Delete: `ui/src/model-manager/install-models/ModelCard.tsx`

**Interfaces:**
- Consumes: `InstallToolbar` (+ `SORT_OPTIONS`), `InstallModelCard`, `InstallDetailView`, `getModelFromCivitAPi(types, query, sort, baseModels)`, `download_progress`-Event (`{ save_path, progress }[]`), `indexdb.models`.

- [ ] **Step 1: Modal umbauen**

Ersetze den Inhalt von `ui/src/model-manager/install-models/InstallModelsModal.tsx` vollständig:

```tsx
import {
  Box,
  Grid,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
} from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { installModelsApi } from "../api/modelsApi";
import InstallModelCard from "./InstallModelCard";
import InstallToolbar, { SORT_OPTIONS } from "./InstallToolbar";
import InstallDetailView from "./InstallDetailView";
import ChooseFolder from "./ChooseFolder";
import {
  getCivitApiKey,
  getCivitModelDownloadUrl,
} from "../../utils/civitUtils";
import { useStateRef } from "../../customHooks/useStateRef";
import {
  FileEssential,
  MODEL_TYPE,
  MODEL_TYPE_TO_FOLDER_MAPPING,
  getFileEssential,
} from "./util/modelTypes";
import { getModelFromCivitAPi } from "./util/getModelFromCivitAPI";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { getAllFoldersList } from "../../Api";
import { indexdb } from "../../db-tables/indexdb";
import { hideScrollbarSx } from "../utils";
import { api } from "../../utils/comfyapp";
import type { CivitiModel, CivitiModelVersion } from "../types";

interface Props {
  onclose: () => void;
  searchQuery?: string;
  modelType?: MODEL_TYPE;
}

type ProgressEntry = { save_path: string; progress: number };

const basename = (p: string) => p.replace(/^.*[\\/]/, "");

export default function InstallModelsModal({
  onclose: onCloseInstallModelsModal,
  searchQuery: searchQueryProp = "",
  modelType: modelTypeProp,
}: Props) {
  const [models, setModels] = useState<CivitiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelType, setModelType] = useState<MODEL_TYPE | undefined>(
    modelTypeProp,
  );
  const [searchQuery, setSearchQuery] = useState(searchQueryProp);
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0].key);
  const [baseModel, setBaseModel] = useState("");
  const [installing, setInstalling] = useState<string[]>([]);
  const [progressQueue, setProgressQueue] = useState<ProgressEntry[]>([]);
  const [installedModelIds, setInstalledModelIds] = useState<Set<string>>(
    new Set(),
  );
  const [installedVersionIds, setInstalledVersionIds] = useState<Set<string>>(
    new Set(),
  );
  const [detailItem, setDetailItem] = useState<CivitiModel | null>(null);

  const { isOpen, onOpen, onClose: onCloseChooseFolderModal } = useDisclosure();
  const [fileState, setFile, file] = useStateRef<FileEssential>();
  const [defaultFolders, setDefaultFolders] = useState<
    Record<MODEL_TYPE, string>
  >(MODEL_TYPE_TO_FOLDER_MAPPING);

  const loadData = useCallback(async () => {
    setLoading(true);
    const result = await getModelFromCivitAPi(
      modelType,
      searchQuery,
      sortBy,
      baseModel || undefined,
    );
    setModels(result);
    const df = await userSettingsTable?.getSetting("defaultFolders");
    df && setDefaultFolders(df);
    setLoading(false);
  }, [modelType, searchQuery, sortBy, baseModel]);

  // Trending-Feed beim Öffnen + Neuladen bei Typ/Sort/Basismodell.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelType, sortBy, baseModel]);

  // Lokale Modelle -> „installiert"-Mengen (Modell- und Versions-IDs).
  useEffect(() => {
    (async () => {
      const local = await indexdb.models.toArray();
      setInstalledModelIds(
        new Set(
          local
            .map((m) => m.civitModelID)
            .filter((x): x is string => x != null),
        ),
      );
      setInstalledVersionIds(
        new Set(
          local
            .map((m) => m.civitModelVersionID)
            .filter((x): x is string => x != null),
        ),
      );
    })();
  }, [models]);

  // Download-Fortschritt (globales Event) für die Karten-Anzeige.
  useEffect(() => {
    const onProgress = (e: { detail: ProgressEntry[] }) => {
      setProgressQueue(e.detail ?? []);
    };
    api.addEventListener("download_progress", onProgress);
    return () => api.removeEventListener("download_progress", onProgress);
  }, []);

  const progressForFile = (fileName?: string): number | undefined => {
    if (!fileName) return undefined;
    const entry = progressQueue.find((q) => basename(q.save_path) === fileName);
    return entry?.progress;
  };

  const doDownload = async (
    fileEssential: FileEssential,
    folderPath: string,
  ) => {
    setFile(fileEssential);
    let url = await getCivitModelDownloadUrl(String(fileEssential.id));
    let version = fileEssential.name ?? url.split("/").pop();
    if (!version) return;
    setInstalling((cur) => [...cur, version as string]);
    const apiKey = getCivitApiKey();
    if (apiKey) {
      try {
        const u = new URL(url);
        if (!u.searchParams.has("token")) u.searchParams.set("token", apiKey);
        url = u.toString();
      } catch {
        if (!/[?&]token=/.test(url)) {
          url += `${url.includes("?") ? "&" : "?"}token=${apiKey}`;
        }
      }
    }
    installModelsApi({
      file_hash: fileEssential.SHA256,
      filename: version,
      save_path: folderPath,
      url,
    });
    setFile(undefined);
  };

  const installVersion = async (
    version: CivitiModelVersion,
    model: CivitiModel,
  ) => {
    const fileEssential = getFileEssential(version, model.name);
    const folderPath = defaultFolders[model.type as MODEL_TYPE];
    if (!fileEssential) return;
    if (folderPath == null) {
      setFile(fileEssential);
      onOpen();
    } else {
      doDownload(fileEssential, folderPath);
    }
  };

  const quickInstall = (model: CivitiModel) => {
    const latest = model.modelVersions?.[0];
    if (latest) installVersion(latest, model);
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onCloseInstallModelsModal}
        blockScrollOnMount={true}
      >
        <ModalOverlay />
        <ModalContent
          width={"90%"}
          maxWidth={"90vw"}
          height={"90vh"}
          display={"flex"}
          flexDirection={"column"}
        >
          <ModalCloseButton
            zIndex={3}
            top={2}
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
          <ModalBody
            p={0}
            overflow={"hidden"}
            display={"flex"}
            flexDirection={"column"}
            flex={1}
            minHeight={0}
          >
            {detailItem ? (
              <Box flex={1} minHeight={0}>
                <InstallDetailView
                  model={detailItem}
                  installedVersionIds={installedVersionIds}
                  installingNames={installing}
                  onInstallVersion={installVersion}
                  onBack={() => setDetailItem(null)}
                />
              </Box>
            ) : (
              <>
                <InstallToolbar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onSearch={loadData}
                  modelType={modelType}
                  onSelectModelType={setModelType}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  baseModel={baseModel}
                  setBaseModel={setBaseModel}
                  onCustomUrlInstall={onOpen}
                  resultCount={models.length}
                  loading={loading}
                />
                <Box
                  flex={1}
                  minHeight={0}
                  overflowY={"auto"}
                  px={4}
                  py={4}
                  sx={hideScrollbarSx}
                >
                  <Grid
                    templateColumns={"repeat(auto-fill, minmax(190px, 1fr))"}
                    gap={4}
                  >
                    {models.map((model) => {
                      const latestFile = getFileEssential(
                        model.modelVersions?.[0],
                        model.name,
                      );
                      return (
                        <InstallModelCard
                          key={model.id}
                          model={model}
                          installed={installedModelIds.has(String(model.id))}
                          progress={progressForFile(latestFile?.name)}
                          installing={
                            latestFile?.name
                              ? installing.includes(latestFile.name)
                              : false
                          }
                          onQuickInstall={quickInstall}
                          onOpenDetail={setDetailItem}
                        />
                      );
                    })}
                  </Grid>
                </Box>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      <ChooseFolder
        fileSelected={!!fileState}
        isOpen={isOpen}
        onClose={onCloseChooseFolderModal}
        selectFolder={(folderPath: string, customUrl?: string) => {
          if (file.current) {
            doDownload(file.current, folderPath);
          } else if (customUrl) {
            // Custom URL Install: direkt über die bestehende API laden.
            const version = customUrl.split("/").pop() ?? "download";
            setInstalling((cur) => [...cur, version]);
            const apiKey = getCivitApiKey();
            let url = customUrl;
            if (apiKey && !/[?&]token=/.test(url)) {
              url += `${url.includes("?") ? "&" : "?"}token=${apiKey}`;
            }
            installModelsApi({ filename: version, save_path: folderPath, url });
          }
          onCloseChooseFolderModal();
        }}
      />
    </>
  );
}
```

> `useDisclosure` muss importiert werden — ergänze es im `@chakra-ui/react`-Import (`Box, Grid, Modal, ModalOverlay, ModalContent, ModalCloseButton, ModalBody, useDisclosure`).

- [ ] **Step 2: Alte Karte löschen**

```bash
git rm ui/src/model-manager/install-models/ModelCard.tsx
```

- [ ] **Step 3: Verwaisten Import prüfen**

Run: `grep -rn "InstallModelSearchBar\|InstallProgress\|from \"./ModelCard\"" ui/src/model-manager/install-models/`
Falls `InstallModelsModal.tsx` sie nicht mehr referenziert, ist alles gut. `InstallProgress.tsx` und `InstallModelSearchBar.tsx` bleiben als Dateien liegen (kein Import mehr = kein Build-Fehler), werden aber nicht mehr gerendert.

- [ ] **Step 4: Build prüfen**

Run (in `ui/`): `npm run build`
Expected: Build ohne neue Fehler. Achte auf: `getFileEssential`-Überladung akzeptiert `undefined` (gibt `undefined` zurück) — der Aufruf mit `model.modelVersions?.[0]` ist damit typkonform.

- [ ] **Step 5: Commit (nur Source)**

```bash
git add ui/src/model-manager/install-models/InstallModelsModal.tsx
git commit -m "feat(install): Panel-Umbau zur Entdeckungs-Zentrale (Toolbar, reiches Grid, Detail, Trending, Karten-Fortschritt)"
```

---

### Task 7: Dist-Rebuild + visuelle Verifikation

**Files:**
- Modify: `ui/dist/**` (Build-Artefakte)

- [ ] **Step 1: Produktions-Build**

Run (in `ui/`): `npm run build`
Expected: `ui/dist/workspace_web/` neu erzeugt, keine Fehler.

- [ ] **Step 2: Testserver sicherstellen**

Prüfe, ob Port 8189 lauscht; falls nicht, in `G:\Weiterentwicklung\ComfyUI` starten:
`venv/Scripts/python.exe main.py --port 8189 --cpu`
(Plugin ist per Junction in `custom_nodes/` verlinkt; Build landet automatisch im ausgelieferten `dist`.)

- [ ] **Step 3: Visuelle Prüfung via Chrome DevTools MCP (Port 8189)**

Mit Mock/Cache-Daten (Fetch-Stub für `/api/v1/models` + `indexdb.models`-Seed für „installiert"). Checkliste:
1. Install-Panel öffnen → **Trending-Feed** erscheint sofort (ohne Suche), Karten mit Bild + Stats (⬇/♥) + Typ/Basismodell.
2. Eine bereits lokal vorhandene Karte zeigt **„Installiert"** statt Install-Button.
3. Hover über nicht-installierte Karte → **Installieren**-Button erscheint; Klick löst Download aus, **Fortschritt auf der Karte**.
4. Klick auf Karte (nicht Button) → **Detailansicht**: Cover, Versionsliste rechts mit **Install je Version**, Beschreibung, Beispielbilder → Klick zeigt **Prompt**.
5. **Sortierung**- und **Basismodell**-Menü wechseln → Grid lädt neu.
6. NSFW-Toggle blurrt/entblurrt; „Anzeigen" auf einzelner Karte funktioniert.
7. **Gegenprüfung Models-Panel**: Detailansicht dort unverändert korrekt (wegen Shared-Refactor in Task 2).
8. Schließen-Button (getönt-rot) funktioniert.

- [ ] **Step 4: Screenshots dem User zeigen, auf „OK" warten**

Testserver **nicht** vorher stoppen. Erst nach explizitem „OK" des Users committen.

- [ ] **Step 5: Dist-Commit (separat)**

```bash
git add ui/dist
git commit -m "build: dist-Rebuild fuer Install-Models-Entdeckungs-Zentrale"
```

---

## Self-Review (durchgeführt)

**Spec-Abdeckung:**
- Rich card + Stats + NSFW-Reveal + Installiert → Task 3. ✅
- Ein-Klick-Install + Detail-Install → Task 3 (`onQuickInstall`) + Task 5 (`onInstallVersion`). ✅
- Detailansicht (Beschreibung, Trigger, Versionen, Beispielbilder+Prompts) → Task 5. ✅
- Browser-Toolbar (Suche, Tabs, Sort, Basismodell, NSFW, ⋯-Menü) → Task 4. ✅
- API sort/baseModels + Trending-Default → Task 1 + Task 6 (`sortBy` initial = „Most Downloaded"). ✅
- Karten-Fortschritt statt separater Liste → Task 6 (`download_progress` → `progressForFile`) + Task 3. ✅
- Installiert-Abgleich via `civitModelID`/`civitModelVersionID` → Task 6. ✅
- Aufräumen (Dropdown-Pult weg, Custom-URL/API-Key ins Menü, `ModelCard` gelöscht) → Task 4 + Task 6. ✅
- Shared-Bausteine statt Duplikat → Task 2. ✅
- Commit-Konvention Source + separater Dist → alle Tasks + Task 7. ✅

**Platzhalter-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code. ✅

**Typ-Konsistenz:** `getModelFromCivitAPi(types, query, sort, baseModels)` einheitlich (Task 1 ↔ Task 6); `installedVersionIds`/`installingNames`-Props identisch (Task 5 ↔ Task 6); `onInstallVersion(version, model)`-Signatur konsistent; `progressForFile(fileName)`-Match per `basename` deckt sich mit `download_progress`-`save_path`. ✅

**Offene Laufzeit-Risiken (bewusst, im Schluss-Task zu prüfen):**
- Exakte `baseModels`-Strings der Civitai-API (Task 4) — ggf. an Live-Werte angleichen.
- `SearchInput`-Prop-Namen (Task 4, Step 2 verifiziert das explizit).
- Progress-Zuordnung per Datei-Basename setzt eindeutige Dateinamen im gleichzeitigen Download voraus (praktisch gegeben).
