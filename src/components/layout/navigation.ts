import {
  Activity,
  Bot,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  PieChart,
  Receipt,
  RefreshCw,
  Server,
  Settings,
  ShoppingBag,
  Stethoscope,
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
  | "/configuracoes";

export type NavigationBadge = "orders" | "clients" | "invoices" | "sigma" | "whatsapp";

export interface NavigationItem {
  to: AppRoute;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badgeKey?: NavigationBadge;
  mobilePrimary?: boolean;
  /** Item secundário: pertence à área logo acima e aparece recuado. */
  secondary?: boolean;
}

export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

/**
 * Cada área principal reúne suas telas complementares logo abaixo, recuadas.
 * Assim nada fica escondido e a navegação continua enxuta.
 */
export const navigationGroups: NavigationGroup[] = [
  {
    title: "Operação",
    items: [
      { to: "/painel", label: "Painel", shortLabel: "Início", icon: LayoutDashboard, mobilePrimary: true },
      { to: "/indicadores", label: "Indicadores", shortLabel: "Dados", icon: PieChart, secondary: true },
      { to: "/clientes", label: "Clientes", shortLabel: "Clientes", icon: Users, badgeKey: "clients", mobilePrimary: true },
      { to: "/clientes-operacao", label: "Ações em massa", shortLabel: "Massa", icon: ClipboardList, secondary: true },
      { to: "/pedidos", label: "Pedidos", shortLabel: "Pedidos", icon: ShoppingBag, badgeKey: "orders", mobilePrimary: true },
    ],
  },
  {
    title: "Cobrança",
    items: [
      { to: "/cobrancas", label: "Cobranças", shortLabel: "Cobrar", icon: Receipt, badgeKey: "invoices", mobilePrimary: true },
      { to: "/cobranca-automatica", label: "Regras automáticas", shortLabel: "Regras", icon: Timer, secondary: true },
    ],
  },
  {
    title: "Conexões",
    items: [
      { to: "/sigma", label: "Sigma", shortLabel: "Sigma", icon: Server, badgeKey: "sigma" },
      { to: "/sigma-sincronizacao", label: "Sincronização Sigma", shortLabel: "Sync", icon: RefreshCw, secondary: true },
      { to: "/whatsapp", label: "WhatsApp", shortLabel: "WhatsApp", icon: MessageCircle, badgeKey: "whatsapp" },
      { to: "/whatsapp-diagnostico", label: "Diagnóstico WhatsApp", shortLabel: "Diagnóstico", icon: Stethoscope, secondary: true },
      { to: "/bot", label: "Robô WhatsApp", shortLabel: "Robô", icon: Bot },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/configuracoes", label: "Configurações", shortLabel: "Ajustes", icon: Settings },
      { to: "/atividades", label: "Histórico de atividades", shortLabel: "Histórico", icon: Activity, secondary: true },
    ],
  },
];

export const primaryMobileNavigation = navigationGroups
  .flatMap((group) => group.items)
  .filter((item) => item.mobilePrimary);
