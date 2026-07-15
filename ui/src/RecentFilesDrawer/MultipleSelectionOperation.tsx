import { Checkbox, HStack, IconButton, Text, Tooltip } from "@chakra-ui/react";
import { IconListCheck, IconX, IconDownload } from "@tabler/icons-react";
import DeleteConfirm from "../components/DeleteConfirm";
import { ChangeEvent } from "react";
import { workflowsTable } from "../db-tables/WorkspaceDB";
import { downloadWorkflowsZip } from "../utils/downloadWorkflowsZip";
import { useT } from "../i18n/LanguageContext";

type Props = {
  multipleState: boolean;
  selectedKeys: string[];
  isSelectedAll: boolean;
  changeMultipleState: (isMultiple: boolean) => void;
  batchOperationCallback: (type: string, value?: unknown) => void;
};

export default function MultipleSelectionOperation(props: Props) {
  const { t } = useT();
  const {
    multipleState,
    changeMultipleState,
    selectedKeys,
    isSelectedAll,
    batchOperationCallback,
  } = props;

  const batchExport = async () => {
    const selectedList = (await workflowsTable?.batchQuery(selectedKeys)) ?? [];
    downloadWorkflowsZip(selectedList);
  };

  const notChecked = selectedKeys.length === 0;

  return (
    <HStack spacing={2} wrap={"wrap"} mb={0}>
      {multipleState ? (
        <>
          <Checkbox
            isChecked={isSelectedAll}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              batchOperationCallback("selectAll", e.target.checked);
            }}
          />
          <Tooltip hasArrow label={t("drawer.downloadZip")} placement="bottom">
            <IconButton
              isDisabled={notChecked}
              aria-label={t("drawer.batchExportAria")}
              size={"sm"}
              icon={<IconDownload size={21} />}
              onClick={batchExport}
            />
          </Tooltip>
          <Tooltip hasArrow label={t("drawer.batchDeleteTooltip")}>
            <DeleteConfirm
              isDisabled={notChecked}
              variant="solid"
              promptMessage={`${t("drawer.batchDeleteConfirmPrefix")}${selectedKeys.length}${t("drawer.batchDeleteConfirmSuffix")}`}
              tooltipText={t("drawer.deleteSelected")}
              onDelete={async () => {
                await workflowsTable?.batchDeleteFlow(selectedKeys);
                batchOperationCallback("batchDelete");
              }}
            />
          </Tooltip>

          {selectedKeys.length > 0 && (
            <Text
              fontWeight={600}
            >{`${t("drawer.selectedCountPrefix")}${selectedKeys.length}`}</Text>
          )}
          <Tooltip hasArrow label={t("drawer.exitMultiSelect")}>
            <IconButton
              aria-label={t("drawer.closeMultiSelectAria")}
              size={"sm"}
              icon={<IconX />}
              onClick={() => {
                changeMultipleState(false);
              }}
            />
          </Tooltip>
        </>
      ) : (
        <Tooltip
          hasArrow
          label={t("drawer.selectMultiple")}
          placement="bottom-start"
        >
          <IconButton
            aria-label={t("drawer.startMultiSelectAria")}
            size={"sm"}
            variant={"outline"}
            icon={<IconListCheck size={21} />}
            onClick={() => {
              changeMultipleState(true);
            }}
          />
        </Tooltip>
      )}
    </HStack>
  );
}
