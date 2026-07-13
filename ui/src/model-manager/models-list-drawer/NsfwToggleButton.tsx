import { Button, Tooltip } from "@chakra-ui/react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";

/**
 * Single adult-content switch. One click turns adult content fully on/off:
 * - `civitaiIncludeAdultContent` decides the Civitai host (civitai.red vs .com)
 *   and whether NSFW results/covers are requested at all, and
 * - `showNsfwModelThumbnail` un-blurs the thumbnails.
 * Both are kept in lockstep so the user never has to hunt for a second setting.
 * Fires `showNsfwModelThumbnail` (cards re-read blur) and
 * `civitaiIncludeAdultContent` (panels re-fetch from the new host) so it all
 * updates live.
 */
export default function NsfwToggleButton() {
  const [checked, setChecked] = useState(false);

  const read = () => {
    userSettingsTable?.getSetting("civitaiIncludeAdultContent").then((res) => {
      setChecked(res ?? false);
    });
  };

  useEffect(() => {
    read();
    // Keep in sync if another surface toggles the same setting.
    window.addEventListener("civitaiIncludeAdultContent", read);
    return () =>
      window.removeEventListener("civitaiIncludeAdultContent", read);
  }, []);

  const toggle = () => {
    const next = !checked;
    userSettingsTable
      ?.upsert({
        showNsfwModelThumbnail: next,
        civitaiIncludeAdultContent: next,
      })
      .then(() => {
        setChecked(next);
        window.dispatchEvent(new Event("showNsfwModelThumbnail"));
        window.dispatchEvent(new Event("civitaiIncludeAdultContent"));
      });
  };

  return (
    <Tooltip
      label={
        checked
          ? "Adult-Inhalte ausblenden"
          : "Adult-Inhalte anzeigen (NSFW)"
      }
    >
      <Button
        size={"sm"}
        flexShrink={0}
        variant={"outline"}
        colorScheme={"gray"}
        // Tinted (not loud) when active - blue stays the only bright accent.
        borderColor={checked ? "pink.400" : undefined}
        color={checked ? "pink.200" : undefined}
        bg={checked ? "rgba(237, 100, 166, 0.16)" : undefined}
        _hover={
          checked
            ? { bg: "rgba(237, 100, 166, 0.28)", color: "white" }
            : undefined
        }
        leftIcon={
          checked ? <IconEye size={16} /> : <IconEyeOff size={16} />
        }
        onClick={toggle}
      >
        NSFW
      </Button>
    </Tooltip>
  );
}
