import { View } from "react-native";
import Svg, { Circle, Path, Rect, G, Ellipse } from "react-native-svg";

/**
 * The home hero scene from the reference: a soft park with a lake, trees, a
 * pastel skyline and a family of three seen from behind. Pure SVG — scales
 * crisply, no image weight. Purely decorative.
 */
export function CityIllustration({ height = 210 }: { height?: number }) {
  return (
    <View style={{ width: "100%", height }}>
      <Svg width="100%" height="100%" viewBox="0 0 360 210" preserveAspectRatio="xMidYMax slice">
        <Rect x="0" y="0" width="360" height="210" fill="#FFF0F6" />

        {/* skyline */}
        <G opacity={0.9}>
          <Rect x="8" y="52" width="30" height="70" rx="3" fill="#C9B8F5" />
          <Rect x="42" y="38" width="26" height="84" rx="3" fill="#B7A6EE" />
          <Rect x="250" y="46" width="26" height="76" rx="3" fill="#9BDBC9" />
          <Rect x="280" y="58" width="36" height="64" rx="3" fill="#A7E8D6" />
          <Rect x="320" y="44" width="24" height="78" rx="3" fill="#C9B8F5" />
          <Rect x="86" y="64" width="24" height="58" rx="3" fill="#FFB3CC" />
          <Rect x="212" y="60" width="24" height="62" rx="3" fill="#FF9DBE" />
        </G>
        <G fill="#ffffff" opacity={0.65}>
          <Rect x="48" y="50" width="4" height="4" /><Rect x="58" y="50" width="4" height="4" />
          <Rect x="48" y="64" width="4" height="4" /><Rect x="58" y="64" width="4" height="4" />
          <Rect x="290" y="70" width="4" height="4" /><Rect x="300" y="70" width="4" height="4" />
        </G>

        {/* trees */}
        <G>
          <Rect x="128" y="104" width="4" height="18" fill="#8A6D4B" />
          <Circle cx="130" cy="98" r="15" fill="#7FCBA6" />
          <Rect x="234" y="106" width="4" height="16" fill="#8A6D4B" />
          <Circle cx="236" cy="100" r="13" fill="#6FBF98" />
        </G>

        {/* lake */}
        <Rect x="0" y="122" width="360" height="34" fill="#BFE3EE" />
        <Ellipse cx="180" cy="139" rx="150" ry="12" fill="#CDEAF2" />
        {/* railing */}
        <Path d="M0 122 H360" stroke="#9FCBD8" strokeWidth="2" />
        <G stroke="#9FCBD8" strokeWidth="2">
          <Path d="M40 122 v-8M90 122 v-8M140 122 v-8M220 122 v-8M270 122 v-8M320 122 v-8" />
          <Path d="M30 116 H330" />
        </G>

        {/* grass foreground */}
        <Rect x="0" y="156" width="360" height="54" fill="#Dff0E4" />
        <Path d="M0 156 H360" stroke="#C6E4CE" strokeWidth="2" />

        {/* lamp posts */}
        <G stroke="#B48BA8" strokeWidth="3" strokeLinecap="round">
          <Path d="M22 178 V150" /><Path d="M338 178 V150" />
        </G>
        <Circle cx="22" cy="147" r="4" fill="#F7C948" />
        <Circle cx="338" cy="147" r="4" fill="#F7C948" />

        {/* family of three, from behind */}
        <G>
          {/* father */}
          <Circle cx="168" cy="150" r="9" fill="#2A2A33" />
          <Path d="M158 200 V162 q10 -8 20 0 V200 Z" fill="#1D3452" />
          {/* mother */}
          <Circle cx="204" cy="150" r="9" fill="#3A2A33" />
          <Path d="M193 200 V164 q11 -9 22 0 V200 Z" fill="#F72575" />
          {/* child, holding mother's hand */}
          <Circle cx="187" cy="166" r="6" fill="#2A2A33" />
          <Path d="M181 200 V176 q6 -5 12 0 V200 Z" fill="#7C3AED" />
        </G>
      </Svg>
    </View>
  );
}
