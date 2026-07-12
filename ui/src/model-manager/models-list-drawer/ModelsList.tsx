import { Grid, GridItem } from "@chakra-ui/react";
import { ModelsListRespItem } from "../types";
import { ModelItem } from "./ModelItem";

interface Props {
  list: ModelsListRespItem[];
  onOpenDetail: (data: ModelsListRespItem) => void;
}

export function ModelsList({ list, onOpenDetail }: Props) {
  return (
    <Grid
      templateColumns="repeat(auto-fill, minmax(180px, 1fr))"
      gap={3}
      marginTop={2}
    >
      {list.map((v) => (
        <GridItem key={v.model_name + v.date.getTime()}>
          <ModelItem data={v} onOpenDetail={onOpenDetail} />
        </GridItem>
      ))}
    </Grid>
  );
}
