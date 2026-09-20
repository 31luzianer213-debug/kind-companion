import {
  Activity,
  BarChart3,
  Bot,
  CreditCard,
  Crown,
  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  Receipt,
  Server,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Timer,
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
  | "/assinatura"
  | "/admin"
  | "/configuracoes";

export type NavigationBadge = "orders" | "clients" | "invoices" | "sigma" | "whatsapp";

export interface NavigationItem {
  to: AppRoute;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badgeKey?: NavigationBadge;
  mobilePrimary?: boolean;
  adminOnly?: boolean;
}

export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    title: "Principal",
    items: [
      { to: "/painel", label: "Painel", shortLabel: "Início", icon: LayoutDashboard, mobilePrimary: true },
      { to: "/clientes", label: "Clientes", shortLabel: "Clientes", icon: Users, badgeKey: "clients", mobilePrimary: true },
      { to: "/pedidos", label: "Pedidos", shortLabel: "Pedidos", icon: ShoppingBag, badgeKey: "orders", mobilePrimary: true },
      { to: "/cobrancas", label: "Cobranças", shortLabel: "Cobrar", icon: Receipt, badgeKey: "invoices", mobilePrimary: true },
      { to: "/indicadores", label: "Indicadores", shortLabel: "Dados", icon: BarChart3 },
    ],
  },
  {
    title: "Automação",
    items: [
      { to: "/cobranca-automatica", label: "Cobrança automática", shortLabel: "Automação", icon: Timer },
      { to: "/mensagens", label: "Modelos de mensagem", shortLabel: "Mensagens", icon: MessageSquareText },
      { to: "/bot", label: "Robô WhatsApp", shortLabel: "Robô", icon: Bot },
      { to: "/pagamentos", label: "Recebimentos (Pix)", shortLabel: "Pix", icon: CreditCard },
    ],
  },
  {
    title: "Conexões",
    items: [
      { to: "/sigma", label: "Painel Sigma", shortLabel: "Sigma", icon: Server, badgeKey: "sigma" },
      { to: "/whatsapp", label: "WhatsApp", shortLabel: "WhatsApp", icon: MessageCircle, badgeKey: "whatsapp" },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/atividades", label: "Atividades", shortLabel: "Histórico", icon: Activity },
      { to: "/assinatura", label: "Assinatura", shortLabel: "Plano", icon: Crown },
      { to: "/admin", label: "Administração", shortLabel: "Admin", icon: ShieldCheck, adminOnly: true },
      { to: "/configuracoes", label: "Configurações", shortLabel: "Ajustes", icon: Settings },
    ],
  },
];

export const primaryMobileNavigation = navigationGroups
  .flatMap((group) => group.items)
  .filter((item) => item.mobilePrimary);
