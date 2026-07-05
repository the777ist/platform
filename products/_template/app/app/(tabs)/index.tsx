import { View } from "react-native";
import {
  Card,
  CardTitle,
  CardContent,
  Button,
  Text,
  Input,
} from "@platform/ui";

export default function Home() {
  return (
    <View className="flex-1 gap-4 bg-background p-4">
      <Text size="xl">Template</Text>
      <Card>
        <CardTitle>Components</CardTitle>
        <CardContent>
          <Input placeholder="Type here" />
          <Button>Primary</Button>
        </CardContent>
      </Card>
    </View>
  );
}
