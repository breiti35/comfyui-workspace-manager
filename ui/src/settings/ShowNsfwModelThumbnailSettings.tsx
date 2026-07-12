import { Checkbox } from "@chakra-ui/react";
import { useEffect, ChangeEvent, useState } from "react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";

export default function ShowNsfwModelThumbnailSettings() {
  const [checkedState, setChecked] = useState(false);

  const updateShowThumbnail = () => {
    userSettingsTable?.getSetting("showNsfwModelThumbnail").then((res) => {
      setChecked(res ?? false);
    });
  };

  useEffect(() => {
    updateShowThumbnail();
  }, []);

  const onShowThumbnailsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const state = e.target.checked;
    userSettingsTable
      ?.upsert({
        showNsfwModelThumbnail: state,
      })
      .then(() => {
        updateShowThumbnail();
        // The fetched image/NSFW status no longer depends on this setting -
        // only the blur/label at render time does (see ModelItem.tsx /
        // ModelCard.tsx) - so no re-fetch from Civitai is needed here. This
        // also avoids re-querying every cached model's hash on every toggle.
        window.dispatchEvent(new Event("showNsfwModelThumbnail"));
      });
  };

  return (
    <Checkbox isChecked={checkedState} onChange={onShowThumbnailsChange}>
      Show NSFW
    </Checkbox>
  );
}
