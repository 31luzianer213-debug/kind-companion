import {
  Activity,
  BellRing,
  Bot,
  CreditCard,
  Gauge,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Radio,
  Receipt,
  RefreshCw,
  Server,
  Settings,
  ShoppingBag,
  Sparkles,
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

export const navigationGroups: NavigationGroup[] = [
  {
    title: "Visão geral",
    items: [
      { to: "/painel", label: "Painel Geral", shortLabel: "Início", icon: LayoutDashboard, mobilePrimary: true },
      { to: "/indicadores", label: "Indicadores", shortLabel: "Indicadores", icon: Gauge },
    ],
  },
  {
    title: "Operação",
    items: [
      { to: "/pedidos", label: "Pedidos & PIX", shortLabel: "Pedidos", icon: ShoppingBag, badgeKey: "orders", mobilePrimary: true },
      { to: "/clientes", label: "Clientes & Acessos", shortLabel: "Clientes", icon: Users, badgeKey: "clients", mobilePrimary: true },
      { to: "/clientes-operacao", label: "Operação de Clientes", shortLabel: "Operação", icon: ListChecks },
      { to: "/cobrancas", label: "Cobranças", shortLabel: "Cobrar", icon: Receipt, badgeKey: "invoices", mobilePrimary: true },
      { to: "/atividades", label: "Atividades", shortLabel: "Atividades", icon: Activity },
    ],
  },
  {
    title: "Automação",
    items: [
      { to: "/sigma", label: "Servidor Sigma", shortLabel: "Sigma", icon: Server, badgeKey: "sigma" },
      { to: "/sigma-sincronizacao", label: "Sincronização Sigma", shortLabel: "Sincronizar", icon: RefreshCw },
      { to: "/bot", label: "Robô WhatsApp", shortLabel: "Robô", icon: Bot },
      { to: "/whatsapp", label: "Conexão WhatsApp", shortLabel: "WhatsApp", icon: MessageCircle, badgeKey: "whatsapp" },
      { to: "/whatsapp-diagnostico", label: "Diagnóstico WhatsApp", shortLabel: "Diagnóstico", icon: Radio },
      { to: "/cobranca-automatica", label: "Cobrança automática", shortLabel: "Automação", icon: BellRing },
    ],
  },
  {
    title: "Preferências",
    items: [
      { to: "/pagamentos", label: "Formas de Pagamento", shortLabel: "Pagamentos", icon: CreditCard },
      { to: "/mensagens", label: "Modelos de Mensagem", shortLabel: "Mensagens", icon: Sparkles },
      { to: "/configuracoes", label: "Ajustes Gerais", shortLabel: "Ajustes", icon: Settings },
    ],
  },
];

export const primaryMobileNavigation = navigationGroups.flatMap((group) => group.items).filter((item) => item.mobilePrimary);
