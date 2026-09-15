import {
  Bot,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Server,
  Settings,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AppRoute =
  | "/painel"
  | "/indicadores"
  | "/pedidos"
  | "/clientes"
  | "/clientes-operacao"
  | "/cobrancas"
  | "/atividades"
  | "/cobranca-automatica"
  | "/sigma"
  | "/sigma-sincronizacao"
  | "/bot"
  | "/whatsapp"
  | "/whatsapp-diagnostico"
  | "/pagamentos"
  | "/mensagens"
  | "/configuracoes";

export type NavigationBadge = "orders" | "clients" | "invoices" | "sigma" | "whatsapp";

export interface NavigationItem {
  to: AppRoute;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badgeKey?: NavigationBadge;
  mobilePrimary?: boolean;
}

export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

/**
 * O menu principal mostra apenas as áreas que o usuário realmente precisa
 * escolher no dia a dia. Recursos avançados continuam disponíveis dentro
 * das áreas correspondentes, sem poluir a navegação.
 */
export const navigationGroups: NavigationGroup[] = [
  {
    title: "Principal",
    items: [
      { to: "/painel", label: "Painel", shortLabel: "Início", icon: LayoutDashboard, mobilePrimary: true },
      { to: "/clientes", label: "Clientes", shortLabel: "Clientes", icon: Users, badgeKey: "clients", mobilePrimary: true },
      { to: "/pedidos", label: "Pedidos", shortLabel: "Pedidos", icon: ShoppingBag, badgeKey: "orders", mobilePrimary: true },
      { to: "/cobrancas", label: "Cobranças", shortLabel: "Cobrar", icon: Receipt, badgeKey: "invoices", mobilePrimary: true },
    ],
  },
  {
    title: "Conexões",
    items: [
      { to: "/sigma", label: "Sigma", shortLabel: "Sigma", icon: Server, badgeKey: "sigma" },
      { to: "/whatsapp", label: "WhatsApp", shortLabel: "WhatsApp", icon: MessageCircle, badgeKey: "whatsapp" },
      { to: "/bot", label: "Robô WhatsApp", shortLabel: "Robô", icon: Bot },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/configuracoes", label: "Configurações", shortLabel: "Ajustes", icon: Settings },
    ],
  },
];

export const primaryMobileNavigation = navigationGroups
  .flatMap((group) => group.items)
  .filter((item) => item.mobilePrimary);
