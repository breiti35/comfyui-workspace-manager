import { Button, Tooltip } from "@chakra-ui/react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";

/**
 * Adult-content host switch. One click toggles ONLY
 * `civitaiIncludeAdultContent` (civitai.red vs .com) and fires the
 * `civitaiIncludeAdultContent` event so panels re-fetch from the new host.
 * NSFW thumbnail blur (`showNsfwModelThumbnail`) is a SEPARATE setting owned by
 * the Settings panel - deliberately not coupled here, so blur stays meaningful
 * (adult content available but previews blurred).
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
      ?.upsert({ civitaiIncludeAdultContent: next })
      .then(() => {
        setChecked(next);
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
