import { useContext } from "react";
import { Button } from "@chakra-ui/react";
import { WorkspaceContext } from "../../WorkspaceContext";
import { useT } from "../../i18n/LanguageContext";

export default function InstallModelsButton() {
  const { t } = useT();
  const { setRoute } = useContext(WorkspaceContext);
  return (
    <>
      <Button
        size={"sm"}
        colorScheme="blue"
        onClick={() => setRoute("installModels")}
      >
        {t("install.title")}
      </Button>
    </>
  );
}
