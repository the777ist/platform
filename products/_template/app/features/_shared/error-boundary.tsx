import { Component, type ReactNode } from "react";
import { View } from "react-native";
import { Button, Text } from "@platform/ui";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Global error boundary (product-local error UX — PHILOSOPHY "Operational defaults").
 * Catches render-time errors anywhere in the tree and offers a reset instead of a
 * white screen. Data-layer errors stay screen-local (e.g. home's error state).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
          <Text className="text-lg font-semibold text-foreground">Something went wrong</Text>
          <Text className="text-center text-muted-foreground">{this.state.error.message}</Text>
          <Button onPress={() => this.setState({ error: null })}>
            <Text>Try again</Text>
          </Button>
        </View>
      );
    }
    return this.props.children;
  }
}
