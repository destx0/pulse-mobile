// The gym pages' first-frame skeleton: a template grid and a couple of rows, at the size the real ones take.
import { View } from "react-native";
import { Skeleton } from "@/ui/Skeleton";

export function GymSkeleton() {
  return (
    <View className="gap-8">
      <Skeleton className="h-12 w-full rounded-xl" />
      <View className="gap-3">
        <Skeleton className="h-6 w-40 rounded-md" />
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] w-[48.5%] rounded-2xl" />
          ))}
        </View>
      </View>
      <View className="gap-3">
        <Skeleton className="h-6 w-28 rounded-md" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </View>
    </View>
  );
}
