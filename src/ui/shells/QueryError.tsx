import { i18n } from "@/i18n/config";
import { CircleAlert } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Text } from "../Text";

/**
 * A query that failed with nothing to show. `useScreen` keeps the error for the screen; a screen that returns its
 * skeleton when `data` is missing would otherwise show that skeleton forever. Same words and Retry as the route error
 * boundary (src/screens/ScreenError.tsx), in place of the page.
 */
export function QueryError({ error, reload, compact }: { error: Error; reload: () => void; /** Inside a card or a section, not a whole page. */ compact?: boolean }) {
  if (__DEV__) console.warn("[query]", error.message);
  return (
    <View accessibilityRole="alert" className={compact ? "items-start gap-2 py-3" : "flex-1 items-center justify-center gap-3 bg-background px-8"}>
      {!compact && <Icon icon={CircleAlert} size={28} tone="muted-foreground" />}
      <Text className={compact ? "text-[15px] font-semibold text-foreground" : "text-center text-[17px] font-semibold leading-6 text-foreground"}>
        {i18n.t("errors:screen.title")}
      </Text>
      <Text className={compact ? "text-[13px] leading-[19px] text-foreground-secondary" : "max-w-72 text-center text-[15px] leading-[22px] text-foreground-secondary"}>
        {i18n.t("errors:screen.body")}
      </Text>
      <View className={compact ? "mt-1" : "mt-2 flex-row gap-3"}>
        <Button variant={compact ? "secondary" : undefined} onPress={reload}>
          {i18n.t("common:actions.tryAgain")}
        </Button>
      </View>
    </View>
  );
}
