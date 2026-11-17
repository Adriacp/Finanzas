import {
  Baby, Banknote, Beer, BookOpen, Briefcase, Bus, Car, ChartLine, CircleEllipsis, Coffee, CreditCard, Droplet, Dumbbell, Film, Fuel,
  Gamepad2, Gift, GraduationCap, Hammer, HeartPulse, House, Landmark, Laptop, Music, PartyPopper, PawPrint, PiggyBank, Pill, Plane,
  Receipt, Repeat, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Tag, Target, Ticket, TreePalm, TrendingUp, Umbrella,
  Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { cn, tint } from "@/lib/utils";

/** Registro de iconos por nombre (los nombres se guardan en BD y son compatibles con lucide-react-native). */
export const ICONS: Record<string, LucideIcon> = {
  baby: Baby, banknote: Banknote, beer: Beer, "book-open": BookOpen, briefcase: Briefcase, bus: Bus, car: Car, "chart-line": ChartLine,
  "circle-ellipsis": CircleEllipsis, coffee: Coffee, "credit-card": CreditCard, droplet: Droplet, dumbbell: Dumbbell, film: Film, fuel: Fuel,
  "gamepad-2": Gamepad2, gift: Gift, "graduation-cap": GraduationCap, hammer: Hammer, "heart-pulse": HeartPulse, house: House, landmark: Landmark,
  laptop: Laptop, music: Music, "party-popper": PartyPopper, "paw-print": PawPrint, "piggy-bank": PiggyBank, pill: Pill, plane: Plane,
  receipt: Receipt, repeat: Repeat, shirt: Shirt, "shopping-bag": ShoppingBag, "shopping-basket": ShoppingBasket, smartphone: Smartphone,
  sparkles: Sparkles, tag: Tag, target: Target, ticket: Ticket, "tree-palm": TreePalm, "trending-up": TrendingUp, umbrella: Umbrella,
  utensils: Utensils, wallet: Wallet, wifi: Wifi, wrench: Wrench, zap: Zap,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Tag;
  return <C className={className} />;
}

/** Icono dentro de una “pastilla” con el color de la categoría/cuenta. */
export function IconBadge({ name, color, size = "md", className }: { name: string; color: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        size === "sm" && "size-8 rounded-lg [&_svg]:size-4",
        size === "md" && "size-10 rounded-xl [&_svg]:size-[18px]",
        size === "lg" && "size-12 rounded-2xl [&_svg]:size-5",
        className,
      )}
      style={{ backgroundColor: tint(color, 0.15), color }}
    >
      <Icon name={name} />
    </span>
  );
}
