import React from "react";
import { StatusScreen } from "./StatusScreen";
import { RotateCw } from "lucide-react";

export class TabErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed)
      return (
        <StatusScreen
          icon={RotateCw}
          testId="tab-error"
          title="Could not load this screen"
          message="Your activity is safe. Try loading this screen again."
          primaryAction={{
            label: "Retry",
            icon: RotateCw,
            onClick: () => this.setState({ failed: false }),
          }}
        />
      );
    return this.props.children;
  }
}
