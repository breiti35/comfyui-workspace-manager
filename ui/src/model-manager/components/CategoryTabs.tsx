import { Box, Flex } from "@chakra-ui/react";

export interface CategoryTabItem {
  key: string;
  label: string;
}

interface Props {
  items: CategoryTabItem[];
  value: string;
  onChange: (key: string) => void;
}

/**
 * Horizontal category/tab bar in the shared gallery style: a hairline base
 * line, with the active tab marked by a blue underline accent - the same blue
 * used for active items in the gallery sidebar and the workflow drawer. Used
 * by both the Models panel and the Install Models search panel so their
 * navigation reads as one consistent system. Scrolls horizontally (scrollbar
 * hidden) when there are more categories than fit.
 */
export default function CategoryTabs({ items, value, onChange }: Props) {
  return (
    <Flex
      borderBottom={"1px solid"}
      borderColor={"rowBorderColor"}
      overflowX={"auto"}
      overflowY={"hidden"}
      flexShrink={0}
      css={{
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Box
            as={"button"}
            key={item.key}
            onClick={() => onChange(item.key)}
            px={3}
            py={2}
            mb={"-1px"}
            fontSize={"sm"}
            fontWeight={active ? 600 : 500}
            whiteSpace={"nowrap"}
            color={active ? "chakra-body-text" : "gray.500"}
            borderBottom={"2px solid"}
            borderColor={active ? "blue.400" : "transparent"}
            _hover={{ color: "chakra-body-text" }}
            transition={"color 0.12s ease, border-color 0.12s ease"}
          >
            {item.label}
          </Box>
        );
      })}
    </Flex>
  );
}
