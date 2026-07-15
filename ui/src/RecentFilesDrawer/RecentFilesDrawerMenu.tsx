import {
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorMode,
} from "@chakra-ui/react";
import {
  IconMenu2,
  IconMoon,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { useState } from "react";
import WorkspaceSettingsModal from "./WorkspaceSettingsModal";
import { useT } from "../i18n/LanguageContext";
const ICON_SIZE = 16;
type Props = {
  //   onclose: () => void;
};
export default function RecentFilesDrawerMenu({}: Props) {
  const { t } = useT();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <>
      <Menu isLazy>
        <MenuButton
          as={IconButton}
          aria-label={t("drawer.menu.optionsAria")}
          icon={<IconMenu2 size={18} />}
          size={"sm"}
          variant="ghost"
        />
        <MenuList>
          <MenuItem
            onClick={() => setIsSettingsOpen(true)}
            icon={<IconSettings size={16} />}
            fontSize={16}
          >
            {t("settings.title")}
          </MenuItem>
          <MenuItem
            onClick={toggleColorMode}
            icon={
              colorMode === "light" ? (
                <IconMoon size={ICON_SIZE} />
              ) : (
                <IconSun size={ICON_SIZE} />
              )
            }
            fontSize={16}
          >
            {colorMode === "light"
              ? t("drawer.menu.darkMode")
              : t("drawer.menu.lightMode")}
          </MenuItem>
        </MenuList>
      </Menu>
      {isSettingsOpen && (
        <WorkspaceSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
    </>
  );
}
