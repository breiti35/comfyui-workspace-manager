import { Button, Flex, Input } from "@chakra-ui/react";
import { useT } from "../../i18n/LanguageContext";

export default function InstallModelSearchBar({
  searchQuery,
  setSearchQuery,
  onSearch,
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: () => void;
}) {
  const { t } = useT();
  return (
    <Flex gap={2} alignItems={"center"} grow={1}>
      <Input
        size={"sm"}
        borderRadius={"md"}
        placeholder={t("install.searchBar.placeholder")}
        width={"60%"}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyUp={(e) => {
          e.code === "Enter" && onSearch();
        }}
      />
      <Button size={"sm"} onClick={() => onSearch()} colorScheme="blue">
        {t("install.searchBar.searchButton")}
      </Button>
    </Flex>
  );
}
