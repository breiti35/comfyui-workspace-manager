import { Button, Tooltip } from "@chakra-ui/react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";

/**
 * NSFW visibility as an on/off toggle button (not a bare checkbox), to fit the
 * toolbar's button-based concept. Reads/writes the same `showNsfwModelThumbnail`
 * setting and fires the same `showNsfwModelThumbnail` event that the cards
 * listen on, so toggling it un-blurs/blurs thumbnails live.
 */
export default function NsfwToggleButton() {
  const [checked, setChecked] = useState(false);

  const read = () => {
    userSettingsTable?.getSetting("showNsfwModelThumbnail").then((res) => {
      setChecked(res ?? false);
    });
  };

  useEffect(() => {
    read();
    // Keep in sync if another surface toggles the same setting.
    window.addEventListener("showNsfwModelThumbnail", read);
    return () => window.removeEventListener("showNsfwModelThumbnail", read);
  }, []);

  const toggle = () => {
    const next = !checked;
    userSettingsTable
      ?.upsert({ showNsfwModelThumbnail: next })
      .then(() => {
        setChecked(next);
        window.dispatchEvent(new Event("showNsfwModelThumbnail"));
      });
  };

  return (
    <Tooltip
      label={checked ? "NSFW-Vorschauen ausblenden" : "NSFW-Vorschauen anzeigen"}
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
