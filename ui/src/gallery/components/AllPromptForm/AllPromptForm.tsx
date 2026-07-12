import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { FormItemComponent } from "../FormItem/FormItemComponent.tsx";
import { isInTopField } from "../MetaBox/MetadataForm.tsx";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MetaBoxContext } from "../MetaBox/metaBoxContext.ts";
import { PromptNodeInputItem } from "../MetaBox/utils.ts";

// Node types whose parameters matter most at a glance (model, prompt,
// sampler settings, dimensions). These stay expanded by default; every
// other node group starts collapsed to keep the panel tidy.
const IMPORTANT_NODE_TYPES = new Set([
  "KSampler",
  "KSamplerAdvanced",
  "SamplerCustom",
  "CheckpointLoaderSimple",
  "CLIPTextEncode",
  "EmptyLatentImage",
  "LoraLoader",
  "LoraLoaderModelOnly",
]);

export default function AllPromptForm() {
  const { topFields, calcInputList, showNodeName } = useContext(MetaBoxContext);

  const groupInputsByNodeType = useCallback(
    (inputList: PromptNodeInputItem[]) => {
      const groupedInputs: PromptNodeInputItem[][] = [];
      inputList.forEach((input) => {
        const lastGroup = groupedInputs[groupedInputs.length - 1];
        if (
          !lastGroup ||
          lastGroup[0].nodeID !== input.nodeID ||
          lastGroup[0].classType !== input.classType
        ) {
          groupedInputs.push([input]);
        } else {
          lastGroup.push(input);
        }
      });
      return groupedInputs;
    },
    [],
  );

  const nodes = useMemo(
    () => groupInputsByNodeType(calcInputList).filter((group) => group[0]),
    [calcInputList, groupInputsByNodeType],
  );
  const nodesKey = nodes.map((group) => group[0].nodeID).join(",");

  // Which node groups are expanded, keyed by nodeID. Re-seeded whenever the
  // node set changes (e.g. selecting another image): important nodes open,
  // the rest collapsed.
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set());
  useEffect(() => {
    const init = new Set<string>();
    nodes.forEach((group) => {
      if (IMPORTANT_NODE_TYPES.has(group[0].classType)) {
        init.add(group[0].nodeID);
      }
    });
    setOpenNodes(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesKey]);

  const toggleNode = (nodeID: string) => {
    setOpenNodes((prev) => {
      const next = new Set(prev);
      next.has(nodeID) ? next.delete(nodeID) : next.add(nodeID);
      return next;
    });
  };

  if (!showNodeName) {
    return (
      <Stack>
        {calcInputList.map((input) => {
          if (
            isInTopField(topFields, {
              name: input.inputName,
              promptKey: input.nodeID,
              classType: input.classType,
            })
          ) {
            return null;
          }
          return (
            <FormItemComponent
              key={`form${input.nodeID}${input.inputName}`}
              inputItem={input}
            />
          );
        })}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {nodes.map((nodeInputs) => {
        const nodeID = nodeInputs[0].nodeID;
        const open = openNodes.has(nodeID);
        const visibleInputs = nodeInputs.filter(
          (input) =>
            !isInTopField(topFields, {
              name: input.inputName,
              promptKey: input.nodeID,
              classType: input.classType,
            }),
        );
        if (visibleInputs.length === 0) {
          return null;
        }
        return (
          <Box
            key={nodeID}
            border={"1px solid"}
            borderColor={"rowBorderColor"}
            borderRadius={"md"}
            overflow={"hidden"}
          >
            <Flex
              as={"button"}
              w={"100%"}
              align={"center"}
              justify={"space-between"}
              gap={2}
              px={3}
              py={2}
              onClick={() => toggleNode(nodeID)}
              _hover={{ bg: "rowHoverBg" }}
              textAlign={"left"}
            >
              <Text fontSize={"sm"} fontWeight={600} noOfLines={1}>
                {nodeInputs[0].classType}
                <Text as={"span"} color={"GrayText"} fontWeight={400}>
                  {" #"}
                  {nodeID}
                </Text>
              </Text>
              {open ? (
                <IconChevronUp size={16} />
              ) : (
                <IconChevronDown size={16} />
              )}
            </Flex>
            {open && (
              <Flex px={3} pb={3} pt={0} gap={1} direction={"column"}>
                {visibleInputs.map((input) => (
                  <FormItemComponent
                    key={`form${input.nodeID}${input.inputName}`}
                    inputItem={input}
                  />
                ))}
              </Flex>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
