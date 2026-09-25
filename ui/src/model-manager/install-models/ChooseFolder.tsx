import {
  Button,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  Select,
  Text,
  Input,
  Stack,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { getAllFoldersList } from "../../Api";
import { useT } from "../../i18n/LanguageContext";

interface ChooseFolderProps {
  isOpen: boolean;
  fileSelected?: boolean;
  /**
   * Folder category (ComfyUI folder key, e.g. "loras") matching the model
   * being installed - its first path is preselected.
   */
  preferredCategory?: string;
  onClose: () => void;
  selectFolder: (folderPath: string, url: string) => void;
}

// Folder categories that never hold downloadable models.
const HIDDEN_CATEGORIES = ["custom_nodes", "config", "saved_prompts"];

export default function ChooseFolder({
  isOpen,
  fileSelected,
  preferredCategory,
  onClose,
  selectFolder,
}: ChooseFolderProps) {
  const { t } = useT();
  const [folderPath, setFolderPath] = useState("");
  // category -> paths, as returned by get_folder_list (sorted by category).
  const [foldersByCategory, setFoldersByCategory] = useState<
    [string, string[]][]
  >([]);
  const [url, setUrl] = useState<string>("");
  const cancelRef = useRef(null);

  useEffect(() => {
    // Load on first open (and retry on a later open if that failed) rather
    // than on mount - the dialog is mounted with every install panel.
    if (!isOpen || foldersByCategory.length) return;
    let cancelled = false;
    getAllFoldersList().then((folders_list) => {
      if (cancelled || !folders_list) return;
      HIDDEN_CATEGORIES.forEach((folder) => {
        delete folders_list[folder];
      });
      setFoldersByCategory(
        Object.entries(folders_list)
          .filter(([, paths]) => paths?.length)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, foldersByCategory.length]);

  // Preselect the first path of the category matching the model type, but
  // never override a choice the user already made in this dialog.
  useEffect(() => {
    if (!isOpen || folderPath || !preferredCategory) return;
    const match = foldersByCategory.find(
      ([category]) => category.toLowerCase() === preferredCategory.toLowerCase(),
    );
    if (match?.[1][0]) setFolderPath(match[1][0]);
  }, [isOpen, preferredCategory, foldersByCategory, folderPath]);

  const reset = () => {
    setFolderPath("");
    setUrl("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={handleClose}
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {t("install.chooseFolder.title")}
          </AlertDialogHeader>

          <AlertDialogBody>
            <Stack spacing={4}>
              {!fileSelected && (
                <>
                  <Text>{t("install.chooseFolder.urlLabel")}</Text>
                  <Input
                    placeholder="https://civitai.com/api/download/models/311399"
                    onChange={(e) => setUrl(e.target.value)}
                    value={url}
                  />
                </>
              )}
              <Text>{t("install.chooseFolder.folderLabel")}</Text>
              <Select
                placeholder={t("install.chooseFolder.selectPlaceholder")}
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
              >
                {foldersByCategory.map(([category, paths]) => (
                  <optgroup key={category} label={category}>
                    {paths.map((path) => (
                      <option key={category + path} value={path}>
                        {path}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Stack>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={handleClose}>
              {t("install.action.cancel")}
            </Button>
            <Button
              onClick={() => {
                selectFolder(folderPath, url);
                // Next open starts clean (and gets the preselection again).
                reset();
              }}
              ml={3}
              // A target folder is always required. The URL field is only
              // part of the Custom URL Install flow (no file preselected);
              // for a normal install from a search result it stays hidden and
              // must not block Confirm.
              isDisabled={folderPath.length === 0 || (!fileSelected && url.length === 0)}
            >
              {t("install.action.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
