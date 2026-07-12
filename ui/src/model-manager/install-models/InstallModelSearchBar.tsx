import { Button, Flex, Input } from "@chakra-ui/react";

export default function InstallModelSearchBar({
  searchQuery,
  setSearchQuery,
  onSearch,
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: () => void;
}) {
  return (
    <Flex gap={2} alignItems={"center"} grow={1}>
      <Input
        size={"sm"}
        borderRadius={"md"}
        placeholder="Search models in CivitAI"
        width={"60%"}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyUp={(e) => {
          e.code === "Enter" && onSearch();
        }}
      />
      <Button size={"sm"} onClick={() => onSearch()} colorScheme="blue">
        Search
      </Button>
    </Flex>
  );
}
