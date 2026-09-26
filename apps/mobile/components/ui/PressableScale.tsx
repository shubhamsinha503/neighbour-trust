import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, "style"> {
  style?: ViewStyle | ViewStyle[];
  /** How far to scale on press-in. */
  to?: number;
}

/**
 * A pressable that dips slightly on press-in and springs back on release — the
 * physical press feedback mobile needs in place of hover. The scale runs on the
 * UI thread (transform only) and collapses to no motion under Reduce Motion.
 *
 * It forwards all Pressable props, so it drops into `<Link asChild>` in place of
 * a Pressable and still receives the router's onPress.
 */
export function PressableScale({ style, to = 0.97, ...rest }: Props) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        if (!reduced) scale.set(withTiming(to, { duration: 120 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: 150 }));
        rest.onPressOut?.(e);
      }}
      style={[animatedStyle, style as ViewStyle]}
    />
  );
}
