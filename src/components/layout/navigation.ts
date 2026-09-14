import {
  Bot,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Server,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AppRoute =\n  | "/painel"\n  | "/pedidos"\n  | "/clientes"\n  | "/cobrancas"\n  | "/sigma"\n  | "/bot"\n  | "/whatsapp"\n  | "/pagamentos"\n  | "/mensagens"\n  | "/configuracoes";\n\nexport type NavigationBadge = "orders" | "clients" | "invoices" | "sigma" | "whatsapp";

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

export const navigationGroups: NavigationGroup[] = [
  {
    title: "Visão geral",
    items: [
      {
        to: "/painel",
        label: "Painel Geral",
        shortLabel: "Início",
        icon: LayoutDashboard,
        mobilePrimary: true,
      },
    ],
  },
  {
    title: "Operação",
    items: [
      {
        to: "/pedidos",
        label: "Pedidos & PIX",
        shortLabel: "Pedidos",
        icon: ShoppingBag,
        badgeKey: "orders",
        mobilePrimary: true,
      },
      {
        to: "/clientes",
        label: "Clientes & Acessos",
        shortLabel: "Clientes",
        icon: Users,
        badgeKey: "clients",
        mobilePrimary: true,
      },
      {
        to: "/cobrancas",
        label: "Cobranças",
        shortLabel: "Cobrar",
        icon: Receipt,
        badgeKey: "invoices",
        mobilePrimary: true,
      },
    ],
  },
  {
    title: "Automação",
    items: [
      {
        to: "/sigma",
        label: "Servidor Sigma",
        shortLabel: "Sigma",
        icon: Server,
        badgeKey: "sigma",
      },
      {
        to: "/bot",
        label: "Robô WhatsApp",
        shortLabel: "Robô",
        icon: Bot,
      },
      {
        to: "/whatsapp",
        label: "Conexão WhatsApp",
        shortLabel: "WhatsApp",
        icon: MessageCircle,
        badgeKey: "whatsapp",
      },
    ],
  },
  {
    title: "Preferências",
    items: [
      {
        to: "/pagamentos",
        label: "Formas de Pagamento",
        shortLabel: "Pagamentos",
        icon: CreditCard,
      },
      {
        to: "/mensagens",
        label: "Modelos de Mensagem",
        shortLabel: "Mensagens",
        icon: Sparkles,
      },
      {
        to: "/configuracoes",
        label: "Ajustes Gerais",
        shortLabel: "Ajustes",
        icon: Settings,
      },
    ],
  },
];

export const primaryMobileNavigation = navigationGroups
  .flatMap((group) => group.items)
  .filter((item) => item.mobilePrimary);
